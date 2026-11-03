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

          // State machine invariant: only PENDING can transition to PAID
          if (booking.status !== 'PENDING') {
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
            razorpayPaymentId: verifiedPayment.id,
            paidAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            qrPayload: ticket.qrPayload,
            ticketSignature: ticket.signature,
          };

          if (duplicateRecords.length > 0) {
            updateData.duplicateCapturedPayments = FieldValue.arrayUnion(...duplicateRecords);
            updateData.reconciliationNeeded = true;
          }

          transaction.update(doc.ref, updateData);

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
            // Terminal state protection: PAID bookings can NEVER be marked FAILED
            if (booking.status !== 'PAID') {
              transaction.update(doc.ref, {
                status: 'FAILED',
                failureReason: paymentEntity?.error_description || 'Payment failed',
                updatedAt: FieldValue.serverTimestamp(),
              });
              console.log(`Webhook marked booking ${doc.id} as FAILED`);
            } else {
              console.log(`Webhook ignored payment.failed for already PAID booking ${doc.id}`);
            }
          });
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: 'Internal webhook error.' });
  }
}
