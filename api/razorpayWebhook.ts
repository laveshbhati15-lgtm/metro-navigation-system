import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRazorpayConfig } from './_lib/config.js';
import { getFirebaseAdmin, FieldValue } from './_lib/firebaseAdmin.js';
import { verifyWebhookSignature, fetchRazorpayPayment, fetchAllPaymentsPaginated } from './_lib/razorpay.js';
import { formatVerifiedTicket } from './_lib/formatTicket.js';

// Disable automatic body parser so we can verify exact HMAC signature on raw body bytes
export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string') {
    return Buffer.from(req.body, 'utf8');
  }
  if (req.body && typeof req.body === 'object') {
    return Buffer.from(JSON.stringify(req.body), 'utf8');
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  // 1. Fail Closed: Verify webhook secret is configured
  let razorpayCfg;
  try {
    razorpayCfg = getRazorpayConfig();
  } catch (cfgErr: any) {
    console.error('Webhook error: Invalid Razorpay configuration:', cfgErr.message);
    res.status(500).json({ error: 'Invalid configuration' });
    return;
  }

  if (!razorpayCfg || !razorpayCfg.webhookSecret) {
    const secretVarName = razorpayCfg?.paymentMode === 'LIVE' ? 'RAZORPAY_LIVE_WEBHOOK_SECRET' : 'RAZORPAY_TEST_WEBHOOK_SECRET';
    console.error(`CRITICAL SECURITY: ${secretVarName} (or RAZORPAY_WEBHOOK_SECRET) is not configured for ${razorpayCfg?.paymentMode || 'current'} mode. Failing closed.`);
    res.status(500).json({ error: 'Webhook secret is not configured on server.' });
    return;
  }

  const rawHeader = req.headers['x-razorpay-signature'];
  const signature = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

  if (!signature) {
    res.status(400).json({ error: 'Missing X-Razorpay-Signature header.' });
    return;
  }

  let rawBodyBuffer: Buffer;
  try {
    rawBodyBuffer = await getRawBody(req);
  } catch (err: any) {
    console.error('Webhook payload read error:', err?.message || err);
    res.status(400).json({ error: 'Failed to read request body stream.' });
    return;
  }

  const isValid = verifyWebhookSignature(rawBodyBuffer, signature);

  if (!isValid) {
    console.warn('SECURITY ALERT: Invalid Razorpay webhook signature');
    res.status(400).json({ error: 'Invalid webhook signature.' });
    return;
  }

  try {
    const rawBodyString = rawBodyBuffer.toString('utf8');
    const event = JSON.parse(rawBodyString);
    const eventType = event.event;

    const { db, isConfigured } = getFirebaseAdmin();
    if (!isConfigured || !db) {
      console.warn('Firebase DB not initialized during webhook processing.');
      res.status(503).json({ error: 'Database unavailable' });
      return;
    }

    // Extract Razorpay event ID for persistent deduplication
    const rawEventId = event.id || req.headers['x-razorpay-event-id'];
    const eventId = rawEventId ? String(Array.isArray(rawEventId) ? rawEventId[0] : rawEventId).trim() : null;
    const eventDocRef = eventId ? db.collection('processed_webhook_events').doc(eventId) : null;

    if (eventDocRef) {
      try {
        const existingEventSnap = await eventDocRef.get();
        if (existingEventSnap.exists) {
          const existingData = existingEventSnap.data() as any;
          if (existingData?.status === 'COMPLETED') {
            console.log(`Webhook: Event ${eventId} already processed (COMPLETED). Returning idempotent 200.`);
            res.status(200).json({ received: true, deduplicated: true });
            return;
          }
          if (existingData?.status === 'PROCESSING') {
            const receivedAtMs = existingData.receivedAt?.toMillis
              ? existingData.receivedAt.toMillis()
              : existingData.receivedAtMs || Date.now();
            if (Date.now() - receivedAtMs < 60000) {
              console.log(`Webhook: Event ${eventId} currently PROCESSING. Returning concurrent acknowledgement.`);
              res.status(200).json({ received: true, status: 'PROCESSING' });
              return;
            }
          }
        }
      } catch (dedupErr: any) {
        console.warn(`Webhook: Deduplication check encountered non-fatal error: ${dedupErr.message}`);
      }
    }

    if (
      eventType === 'payment.captured' ||
      eventType === 'order.paid' ||
      eventType === 'qr_code.credited'
    ) {
      const paymentEntity = event.payload?.payment?.entity;
      const qrEntity = event.payload?.qr_code?.entity;
      const orderId = paymentEntity?.order_id || event.payload?.order?.entity?.id;
      const qrId = qrEntity?.id || paymentEntity?.qr_code_id;
      const paymentId = paymentEntity?.id;

      if (!paymentId && !orderId && !qrId) {
        console.warn('Webhook payload lacks provider identifiers (paymentId, orderId, qrId). Failing closed.');
        res.status(400).json({ error: 'Insufficient provider data in webhook.' });
        return;
      }

      // If an event lacks a payment ID (e.g. order.paid without payment entity or empty qr_code.credited),
      // we must NEVER mark the booking PAID using aggregate counters or notes.
      // Instead, acknowledge safely (HTTP 200) so polling verification or reconciliation can recover the exact payment.
      if (!paymentId) {
        console.warn(`Webhook: Event ${eventType} received without specific payment ID (orderId: ${orderId}, qrId: ${qrId}). Defending booking against unverified capture.`);
        res.status(200).json({ received: true, note: 'Event lacks specific payment ID; deferring to polling or reconciliation.' });
        return;
      }

      // Locate booking by official provider identifier (qrId or orderId)
      let queryRef: any = null;
      if (qrId) {
        queryRef = db.collection('demo_bookings').where('razorpayQrId', '==', qrId).limit(1);
      } else if (orderId) {
        queryRef = db.collection('demo_bookings').where('razorpayOrderId', '==', orderId).limit(1);
      }

      if (!queryRef) {
        console.warn('Webhook received without verifiable qrId or orderId. Unverified notes association rejected.');
        res.status(400).json({ error: 'Cannot associate webhook without verifiable provider reference.' });
        return;
      }

      const snapshot = await queryRef.get();
      if (snapshot.empty) {
        console.warn(`Webhook: No booking found for provider reference (qrId: ${qrId}, orderId: ${orderId})`);
        res.status(200).json({ received: true, note: 'Booking not found for provider reference' });
        return;
      }

      const doc = snapshot.docs[0];
      const initialBooking = doc.data() as any;

      // For Dynamic QR events, independently verify with Razorpay API to prevent amount tampering or substitution
      let verifiedPayment: any = paymentEntity;
      if (qrId && paymentId) {
        try {
          verifiedPayment = await fetchRazorpayPayment(paymentId);
        } catch (fetchErr: any) {
          console.error(`Webhook: Failed to independently verify QR payment ${paymentId} via Razorpay API:`, fetchErr.message);
          res.status(502).json({ error: 'Failed to verify payment with provider.' });
          return;
        }
      }

      if (!verifiedPayment) {
        res.status(400).json({ error: 'Missing payment record for capture event.' });
        return;
      }

      // Strict validation of provider payment invariants
      if (verifiedPayment.status !== 'captured') {
        console.warn(`Webhook: Payment ${verifiedPayment.id} status is "${verifiedPayment.status}", not "captured". Failing closed.`);
        res.status(200).json({ received: true, note: 'Payment not captured yet' });
        return;
      }

      const now = new Date();
      let allQrCaptured: any[] = [];

      if (qrId) {
        // Dynamic QR flow:
        // 1. Verify provider linkage: for QR code payments, qr_code_id MUST exist and match booking exactly
        if (!verifiedPayment.qr_code_id || verifiedPayment.qr_code_id !== initialBooking.razorpayQrId) {
          console.error('Webhook QR ID association missing or mismatched against stored booking.');
          res.status(400).json({ error: 'QR ID association missing or mismatched' });
          return;
        }

        // 2. Fetch all captured payments associated with this QR to verify parameter invariants
        // across all concurrent/prior captures (ensures no amount/currency mismatch exists for the QR).
        // Provider lookup failures MUST fail closed (do not mark booking PAID or fall back on partial data).
        let allProviderPayments: any[];
        try {
          allProviderPayments = await fetchAllPaymentsPaginated(qrId);
        } catch (fetchErr: any) {
          console.error(`Webhook: Failed to fetch complete payment set for QR ${qrId} (${fetchErr?.message}). Failing closed.`);
          res.status(502).json({ error: 'Failed to verify complete QR payment set with provider.' });
          return;
        }

        const candidatePayments = [...(allProviderPayments || [])];
        if (!candidatePayments.some((p: any) => p && p.id === verifiedPayment.id)) {
          candidatePayments.push(verifiedPayment);
        }

        allQrCaptured = candidatePayments.filter(
          (p: any) =>
            p &&
            typeof p.id === 'string' &&
            p.id.trim().length > 0 &&
            p.qr_code_id === qrId &&
            p.status === 'captured'
        );

        // 3. Inspect every captured payment associated with this QR for amount or currency mismatch.
        // STRICT SECURITY INVARIANT:
        // If ANY captured payment has an incorrect amount or currency (including verifiedPayment itself):
        // - Do NOT mark booking PAID
        // - Do NOT issue a ticket
        // - Record mismatch into reconciliationCapturedPayments idempotently with reconciliationNeeded: true
        // - If booking was already PAID, preserve immutable PAID status, primary payment ID, and ticket,
        //   while appending the newly discovered mismatch to reconciliationCapturedPayments.
        const mismatchedCaptured = allQrCaptured.filter(
          (p: any) =>
            Number(p.amount) !== Number(initialBooking.amountInPaise) ||
            typeof p.currency !== 'string' ||
            p.currency.toUpperCase() !== 'INR'
        );

        if (mismatchedCaptured.length > 0) {
          console.warn(`Webhook: Mismatched payment(s) detected for QR ${qrId}. Blocking PAID transition and flagging reconciliation.`);
          const mismatchRecords = mismatchedCaptured.map((p: any) => {
            const isAmtMismatch = Number(p.amount) !== Number(initialBooking.amountInPaise);
            const isCurrMismatch = typeof p.currency !== 'string' || p.currency.toUpperCase() !== 'INR';
            let reason = 'AMOUNT_AND_CURRENCY_MISMATCH';
            if (isAmtMismatch && !isCurrMismatch) reason = 'AMOUNT_MISMATCH';
            else if (!isAmtMismatch && isCurrMismatch) reason = 'CURRENCY_MISMATCH';

            return {
              paymentId: p.id,
              amount: p.amount,
              expectedAmount: initialBooking.amountInPaise,
              currency: p.currency || null,
              expectedCurrency: 'INR',
              qrCodeId: p.qr_code_id,
              capturedAt: p.created_at,
              recordedAt: now.toISOString(),
              reason,
            };
          });

          try {
            await db.runTransaction(async (transaction: any) => {
              const freshSnap = await transaction.get(doc.ref);
              if (!freshSnap.exists) return;
              const freshData = freshSnap.data() as any;

              // Preserve immutable PAID status and existing ticket, but record newly discovered mismatched captures
              const existingMismatches = freshData.reconciliationCapturedPayments || [];
              const newMismatches = mismatchRecords.filter(
                (m: any) => !existingMismatches.some((em: any) => em.paymentId === m.paymentId)
              );

              if (newMismatches.length > 0) {
                transaction.update(doc.ref, {
                  reconciliationCapturedPayments: FieldValue.arrayUnion(...newMismatches),
                  reconciliationNeeded: true,
                  updatedAt: FieldValue.serverTimestamp(),
                });
              }
            });
          } catch (recErr: any) {
            console.error(`Webhook: Failed to record mismatched payments for booking ${initialBooking.bookingId}: ${recErr.message}`);
            res.status(500).json({ error: 'Failed to record mismatched payment reconciliation. Please retry.' });
            return;
          }

          res.status(200).json({ received: true, note: 'Payment parameter mismatch detected; reconciliation required.' });
          return;
        }
      } else {
        // Standard Checkout validation:
        if (Number(verifiedPayment.amount) !== Number(initialBooking.amountInPaise)) {
          console.error(
            `Webhook amount mismatch for booking ${initialBooking.bookingId}: expected ${initialBooking.amountInPaise}, got ${verifiedPayment.amount}`
          );
          res.status(400).json({ error: 'Amount mismatch' });
          return;
        }

        const expectedCurrency = (initialBooking.currency || 'INR').toUpperCase();
        if (verifiedPayment.currency && verifiedPayment.currency.toUpperCase() !== expectedCurrency) {
          console.error(
            `Webhook currency mismatch for booking ${initialBooking.bookingId}: expected ${expectedCurrency}, got ${verifiedPayment.currency}`
          );
          res.status(400).json({ error: 'Currency mismatch' });
          return;
        }
      }

      // Transactional update with idempotency, state machine check, and duplicate payment handling
      try {
        await db.runTransaction(async (transaction: any) => {
          const freshSnap = await transaction.get(doc.ref);
          if (!freshSnap.exists) return;
          const booking = freshSnap.data() as any;

          // Check if any reconciliationCapturedPayments already exist on stored booking (e.g. from prior polling)
          if ((booking.reconciliationCapturedPayments || []).length > 0) {
            console.warn(`Webhook: Booking ${booking.bookingId} already has reconciliationCapturedPayments. Blocking PAID transition.`);
            return;
          }

          if (booking.status === 'PAID') {
            if (eventDocRef) {
              transaction.set(
                eventDocRef,
                {
                  eventId: String(eventId),
                  eventType,
                  status: 'COMPLETED',
                  bookingId: booking.bookingId,
                  completedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
              );
            }

            if (booking.razorpayPaymentId === verifiedPayment.id) {
              // Perfectly idempotent repeated webhook
              console.log(`Webhook: Booking ${booking.bookingId} already confirmed with payment ${verifiedPayment.id}`);
              return;
            }

            // Duplicate captured payment: ensure primary payment is not recorded as duplicate
            console.warn(`Webhook: Duplicate captured payment ${verifiedPayment.id} received for already PAID booking ${booking.bookingId}`);
            const existingDuplicates = booking.duplicateCapturedPayments || [];
            const alreadyRecorded = existingDuplicates.some((d: any) => d.paymentId === verifiedPayment.id);
            if (!alreadyRecorded && verifiedPayment.id !== booking.razorpayPaymentId) {
              const duplicateRecord = {
                paymentId: verifiedPayment.id,
                amount: verifiedPayment.amount,
                currency: verifiedPayment.currency,
                capturedAt: verifiedPayment.created_at,
                recordedAt: now.toISOString(),
              };

              transaction.update(doc.ref, {
                duplicateCapturedPayments: FieldValue.arrayUnion(duplicateRecord),
                reconciliationNeeded: true,
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
            return;
          }

          // State machine invariant: only PENDING or FAILED can transition to PAID (terminal refund/cancelled protected)
          if (booking.status !== 'PENDING' && booking.status !== 'FAILED') {
            console.warn(`Webhook: Cannot mark booking ${booking.bookingId} as PAID; current status is "${booking.status}".`);
            throw new Error(`INVALID_STATE_TRANSITION_${booking.status}`);
          }

          // For the primary payment, prefer verifiedPayment (the event's payment entity),
          // while ensuring all other valid captured payments are recorded as duplicates
          const otherValidCaptured = (allQrCaptured || []).filter((p: any) => p.id !== verifiedPayment.id);
          const duplicateRecords = otherValidCaptured.map((p: any) => ({
            paymentId: p.id,
            amount: p.amount,
            currency: p.currency,
            capturedAt: p.created_at,
            recordedAt: now.toISOString(),
          }));

          // Generate signed ticket (pass booking.createdAt directly; formatVerifiedTicket normalizes Firestore Timestamps deterministically)
          const ticket = formatVerifiedTicket({
            ...booking,
            razorpayPaymentId: verifiedPayment.id,
            createdAt: booking.createdAt,
          });

          const updateData: any = {
            status: 'PAID',
            paymentStatus: 'PAID',
            razorpayPaymentId: verifiedPayment.id,
            paidAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            ticket,
            qrPayload: ticket.qrPayload,
            ticketSignature: ticket.signature,
          };

          if (duplicateRecords.length > 0) {
            updateData.duplicateCapturedPayments = FieldValue.arrayUnion(...duplicateRecords);
            updateData.reconciliationNeeded = true;
          }

          transaction.update(doc.ref, updateData);

          if (eventDocRef) {
            transaction.set(
              eventDocRef,
              {
                eventId: String(eventId),
                eventType,
                status: 'COMPLETED',
                bookingId: booking.bookingId,
                completedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }

          console.log(`Webhook: Successfully marked booking ${booking.bookingId} as PAID with payment ${verifiedPayment.id}`);
        });
      } catch (txErr: any) {
        if (txErr?.message?.startsWith('INVALID_STATE_TRANSITION_')) {
          const fromState = txErr.message.replace('INVALID_STATE_TRANSITION_', '');
          res.status(409).json({ error: `Booking is in "${fromState}" status and cannot be paid.` });
          return;
        }
        throw txErr;
      }
    } else if (eventType === 'payment.authorized') {
      const paymentEntity = event.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;

      if (orderId) {
        const snapshot = await db
          .collection('demo_bookings')
          .where('razorpayOrderId', '==', orderId)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          await db.runTransaction(async (transaction: any) => {
            const freshSnap = await transaction.get(doc.ref);
            if (!freshSnap.exists) return;
            const booking = freshSnap.data() as any;
            if (booking.status === 'PENDING') {
              transaction.update(doc.ref, {
                status: 'AUTHORIZED',
                razorpayPaymentId: paymentEntity?.id || null,
                updatedAt: FieldValue.serverTimestamp(),
              });
              console.log(`Webhook marked booking ${doc.id} as AUTHORIZED`);
            }
          });
        }
      }
    } else if (eventType === 'payment.failed') {
      const paymentEntity = event.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;

      if (orderId) {
        const snapshot = await db
          .collection('demo_bookings')
          .where('razorpayOrderId', '==', orderId)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          await db.runTransaction(async (transaction: any) => {
            const freshSnap = await transaction.get(doc.ref);
            if (!freshSnap.exists) return;
            const booking = freshSnap.data() as any;
            // Terminal state protection: PAID and REFUNDED bookings can NEVER be marked FAILED
            if (
              booking.status !== 'PAID' &&
              booking.status !== 'REFUNDED' &&
              booking.status !== 'PARTIALLY_REFUNDED'
            ) {
              const failedAttempt = {
                paymentId: paymentEntity?.id || null,
                errorDescription: paymentEntity?.error_description || 'Payment failed',
                errorCode: paymentEntity?.error_code || null,
                failedAt: new Date().toISOString(),
              };
              transaction.update(doc.ref, {
                status: 'FAILED',
                failureReason: paymentEntity?.error_description || 'Payment failed',
                lastPaymentError: paymentEntity?.error_description || 'Payment failed',
                failedAttempts: FieldValue.arrayUnion(failedAttempt),
                updatedAt: FieldValue.serverTimestamp(),
              });
              console.log(`Webhook recorded payment failure attempt for booking ${doc.id}`);
            } else {
              console.log(`Webhook ignored payment.failed for already PAID/REFUNDED booking ${doc.id}`);
            }

            if (eventDocRef) {
              transaction.set(
                eventDocRef,
                {
                  eventId: String(eventId),
                  eventType,
                  status: 'COMPLETED',
                  bookingId: booking.bookingId,
                  completedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
              );
            }
          });
        }
      }
    } else if (
      eventType === 'refund.processed' ||
      eventType === 'refund.created' ||
      eventType === 'payment.refunded'
    ) {
      const refundEntity = event.payload?.refund?.entity;
      const paymentEntity = event.payload?.payment?.entity;
      const paymentId = refundEntity?.payment_id || paymentEntity?.id;
      const refundId = refundEntity?.id;
      const orderId = paymentEntity?.order_id || event.payload?.order?.entity?.id;
      const qrId = paymentEntity?.qr_code_id;

      if (!paymentId && !orderId && !qrId) {
        console.warn('Refund webhook missing paymentId, orderId, or qrId. Failing closed.');
        res.status(400).json({ error: 'Insufficient provider data in refund webhook.' });
        return;
      }

      // Locate booking by qrId, orderId, or paymentId
      let queryRef: any = null;
      if (qrId) {
        queryRef = db.collection('demo_bookings').where('razorpayQrId', '==', qrId).limit(1);
      } else if (orderId) {
        queryRef = db.collection('demo_bookings').where('razorpayOrderId', '==', orderId).limit(1);
      } else if (paymentId) {
        queryRef = db.collection('demo_bookings').where('razorpayPaymentId', '==', paymentId).limit(1);
      }

      if (!queryRef) {
        res.status(400).json({ error: 'Cannot query booking for refund event.' });
        return;
      }

      const snapshot = await queryRef.get();
      if (snapshot.empty) {
        console.warn(`Refund webhook: No booking found for paymentId ${paymentId}, orderId ${orderId}, qrId ${qrId}`);
        res.status(200).json({ received: true, note: 'Booking not found for refund reference' });
        return;
      }

      const doc = snapshot.docs[0];
      const initialBooking = doc.data() as any;

      // Independently verify payment refund status with Razorpay API
      let verifiedPayment: any = paymentEntity;
      if (paymentId) {
        try {
          verifiedPayment = await fetchRazorpayPayment(paymentId);
        } catch (fetchErr: any) {
          console.error(`Refund webhook: Failed to fetch payment ${paymentId}: ${fetchErr.message}`);
          res.status(502).json({ error: 'Failed to verify refund with payment provider.' });
          return;
        }
      }

      if (!verifiedPayment) {
        res.status(400).json({ error: 'Missing payment record for refund event.' });
        return;
      }

      // Verify that provider payment is actually refunded or has amount_refunded > 0
      const amountRefunded = Number(verifiedPayment.amount_refunded || refundEntity?.amount || 0);
      const isFullRefund =
        verifiedPayment.status === 'refunded' ||
        verifiedPayment.refund_status === 'full' ||
        amountRefunded >= Number(initialBooking.amountInPaise);

      const targetStatus = isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      const targetRefundStatus = isFullRefund ? 'FULL' : 'PARTIAL';

      const now = new Date();
      const refundRecord = {
        refundId: refundId || null,
        paymentId: verifiedPayment.id,
        amount: refundEntity?.amount || amountRefunded,
        currency: verifiedPayment.currency || 'INR',
        status: refundEntity?.status || 'processed',
        recordedAt: now.toISOString(),
      };

      try {
        await db.runTransaction(async (transaction: any) => {
          const freshSnap = await transaction.get(doc.ref);
          if (!freshSnap.exists) return;
          const booking = freshSnap.data() as any;

          // Idempotency: If booking is already in target status and this refund is already recorded
          const existingRefunds = booking.refunds || [];
          const alreadyRecorded = refundId && existingRefunds.some((r: any) => r.refundId === refundId);

          if (alreadyRecorded && booking.status === targetStatus) {
            console.log(`Refund webhook: Refund ${refundId} already applied to booking ${booking.bookingId}`);
            if (eventDocRef) {
              transaction.set(
                eventDocRef,
                {
                  eventId: String(eventId),
                  eventType,
                  status: 'COMPLETED',
                  bookingId: booking.bookingId,
                  completedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
              );
            }
            return;
          }

          // Generate cancelled/refunded ticket
          const updatedBookingData = {
            ...booking,
            status: targetStatus,
            refundStatus: targetRefundStatus,
          };
          const cancelledTicket = formatVerifiedTicket(updatedBookingData);

          const updateData: any = {
            status: targetStatus,
            paymentStatus: targetStatus,
            refundStatus: targetRefundStatus,
            amountRefundedInPaise: amountRefunded,
            refundedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            ticket: cancelledTicket,
            qrPayload: cancelledTicket.qrPayload,
            ticketSignature: cancelledTicket.signature,
          };

          if (!alreadyRecorded) {
            updateData.refunds = FieldValue.arrayUnion(refundRecord);
          }

          transaction.update(doc.ref, updateData);

          if (eventDocRef) {
            transaction.set(
              eventDocRef,
              {
                eventId: String(eventId),
                eventType,
                status: 'COMPLETED',
                bookingId: booking.bookingId,
                completedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }

          console.log(`Refund webhook: Marked booking ${booking.bookingId} as ${targetStatus}`);
        });
      } catch (txErr: any) {
        console.error('Refund transaction error:', txErr);
        throw txErr;
      }
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: 'Internal webhook error.' });
  }
}
