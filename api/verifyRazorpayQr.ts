import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { getRazorpayConfig } from './_lib/config.js';
import {
  getFirebaseAdmin,
  getFirebaseAuth,
  sanitizeFirestoreError,
  FieldValue,
} from './_lib/firebaseAdmin.js';
import {
  fetchRazorpayQrCode,
  fetchAllPaymentsPaginated,
} from './_lib/razorpay.js';
import { formatVerifiedTicket } from './_lib/formatTicket.js';
import { handleCors } from './_lib/cors.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = `req_qrv_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

  try {
    // 1. Strict Allowlisted CORS
    const corsAllowed = handleCors(req, res, 'POST, OPTIONS');
    if (!corsAllowed) {
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({
        error: 'Method not allowed. Use POST.',
        code: 'METHOD_NOT_ALLOWED',
        requestId,
      });
      return;
    }

    let config;
    try {
      config = getRazorpayConfig();
    } catch (cfgErr: any) {
      res.status(500).json({
        error: cfgErr.message || 'Configuration error',
        code: 'INVALID_CONFIG',
        stage: 'CONFIG_VALIDATION',
        requestId,
      });
      return;
    }

    if (!config) {
      res.status(503).json({
        error: 'Razorpay credentials are not configured in backend.',
        code: 'CONFIG_MISSING',
        stage: 'CONFIG_VALIDATION',
        requestId,
      });
      return;
    }

    const { db, isConfigured } = getFirebaseAdmin();
    if (!isConfigured || !db) {
      res.status(503).json({
        error: 'Firebase database is not configured.',
        code: 'DATABASE_UNAVAILABLE',
        stage: 'FIREBASE_INITIALIZATION',
        requestId,
      });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { bookingId } = body;

    if (!bookingId) {
      res.status(400).json({
        error: 'bookingId is required.',
        code: 'INVALID_REQUEST',
        stage: 'REQUEST_VALIDATION',
        requestId,
      });
      return;
    }

    // 2. Fetch booking from Firestore
    let docSnap;
    try {
      const docRef = db.collection('demo_bookings').doc(bookingId);
      docSnap = await docRef.get();
    } catch (lookupErr: any) {
      const sanitized = sanitizeFirestoreError(lookupErr);
      res.status(500).json({
        error: 'Failed to retrieve booking from database.',
        code: 'DATABASE_READ_ERROR',
        stage: 'BOOKING_LOOKUP',
        firestoreErrorCode: sanitized.code,
        firestoreErrorMessage: sanitized.message,
        requestId,
      });
      return;
    }

    if (!docSnap.exists) {
      res.status(404).json({
        error: `Booking record "${bookingId}" not found.`,
        code: 'BOOKING_NOT_FOUND',
        stage: 'BOOKING_LOOKUP',
        requestId,
      });
      return;
    }

    const booking = docSnap.data() as any;

    // 3. Strict Authorization Verification (No silent fallback, reject unowned bookings)
    const authHeader = req.headers.authorization;
    const headerStr = (Array.isArray(authHeader) ? authHeader[0] : authHeader)?.trim();
    // Accept guest token EXCLUSIVELY through the x-guest-access-token header
    const rawGuestHeader = req.headers['x-guest-access-token'];
    const guestToken = (Array.isArray(rawGuestHeader) ? rawGuestHeader[0] : rawGuestHeader)?.trim();

    if (booking.userId) {
      // Authenticated booking: requires valid Firebase ID token matching userId
      if (!headerStr?.startsWith('Bearer ')) {
        res.status(401).json({
          error: 'Authentication required to access this booking.',
          code: 'AUTH_REQUIRED',
          stage: 'AUTHORIZATION',
          requestId,
        });
        return;
      }
      const idToken = headerStr.slice(7).trim();
      const auth = await getFirebaseAuth();
      if (!auth) {
        res.status(503).json({
          error: 'Authentication service unavailable.',
          code: 'AUTH_SERVICE_UNAVAILABLE',
          stage: 'AUTHORIZATION',
          requestId,
        });
        return;
      }

      try {
        const decoded = await auth.verifyIdToken(idToken);
        if (decoded.uid !== booking.userId) {
          res.status(403).json({
            error: 'You are not authorized to verify or view this booking.',
            code: 'FORBIDDEN',
            stage: 'AUTHORIZATION',
            requestId,
          });
          return;
        }
      } catch (tokenErr: any) {
        console.warn(`[verifyRazorpayQr] [${requestId}] Auth token verification failed: ${tokenErr?.message}`);
        res.status(401).json({
          error: 'Invalid or expired authentication token. Please sign in again.',
          code: 'AUTH_TOKEN_INVALID',
          stage: 'AUTHORIZATION',
          requestId,
        });
        return;
      }
    } else if (booking.guestAccessHash) {
      // Guest booking: requires matching x-guest-access-token header
      if (!guestToken) {
        res.status(401).json({
          error: 'Guest access credential header (x-guest-access-token) is required.',
          code: 'GUEST_TOKEN_REQUIRED',
          stage: 'AUTHORIZATION',
          requestId,
        });
        return;
      }

      const incomingHash = crypto.createHash('sha256').update(guestToken).digest('hex');
      const expectedHash = booking.guestAccessHash;

      let isMatch = false;
      try {
        const bufA = Buffer.from(incomingHash, 'utf8');
        const bufB = Buffer.from(expectedHash, 'utf8');
        if (bufA.length === bufB.length) {
          isMatch = crypto.timingSafeEqual(bufA, bufB);
        }
      } catch {
        isMatch = false;
      }

      if (!isMatch) {
        res.status(403).json({
          error: 'Invalid guest access credential.',
          code: 'GUEST_TOKEN_INVALID',
          stage: 'AUTHORIZATION',
          requestId,
        });
        return;
      }
    } else {
      // Neither userId nor guestAccessHash exists -> unowned / corrupted booking
      console.error(`[verifyRazorpayQr] [${requestId}] Booking ${bookingId} has no ownership credentials.`);
      res.status(403).json({
        error: 'Booking record has no valid ownership credentials associated with it.',
        code: 'UNOWNED_BOOKING',
        stage: 'AUTHORIZATION',
        requestId,
      });
      return;
    }

    // 4. Currency validation: require exact INR
    if (!booking.currency || booking.currency.toUpperCase() !== 'INR') {
      res.status(400).json({
        error: 'Booking currency is invalid or unsupported. Must be INR.',
        code: 'CURRENCY_MISMATCH',
        stage: 'BOOKING_VALIDATION',
        requestId,
      });
      return;
    }

    // 4b. Terminal refund check: Refunded bookings can NEVER return an active ticket
    if (booking.status === 'REFUNDED' || booking.status === 'PARTIALLY_REFUNDED') {
      res.status(409).json({
        error: 'Payment for this booking has been refunded. No active ticket is available.',
        code: 'PAYMENT_REFUNDED',
        status: booking.status,
        bookingId: booking.bookingId,
        requestId,
      });
      return;
    }

    const qrId = booking.razorpayQrId;
    if (!qrId) {
      if (booking.status === 'PAID') {
        res.status(200).json({
          success: true,
          status: 'PAID',
          bookingId: booking.bookingId,
          message: 'Payment already verified.',
          ticket: formatVerifiedTicket(booking),
          requestId,
        });
        return;
      }
      res.status(400).json({
        error: 'Booking is not associated with a Razorpay Dynamic QR.',
        code: 'NOT_QR_BOOKING',
        stage: 'QR_VERIFICATION',
        requestId,
      });
      return;
    }

    // 5. Fetch QR status and payments from Razorpay API.
    // If booking is already confirmed PAID, we do NOT return early without checking provider payments:
    // any newly discovered mismatched or duplicate captures must be recorded idempotently for reconciliation.
    let qrData: any;
    let allPayments: any[];
    try {
      [qrData, allPayments] = await Promise.all([
        fetchRazorpayQrCode(qrId),
        fetchAllPaymentsPaginated(qrId),
      ]);
    } catch (rzpErr: any) {
      if (booking.status === 'PAID') {
        console.warn(`[verifyRazorpayQr] [${requestId}] Provider fetch failed on already PAID booking (${rzpErr.message}), returning verified ticket.`);
        res.status(200).json({
          success: true,
          status: 'PAID',
          bookingId: booking.bookingId,
          message: 'Payment already verified.',
          ticket: formatVerifiedTicket(booking),
          requestId,
        });
        return;
      }
      console.error(`[verifyRazorpayQr] [${requestId}] Provider fetch failed: ${rzpErr.message}`);
      res.status(502).json({
        error: 'Payment provider verification service temporarily unavailable.',
        code: 'PROVIDER_UNAVAILABLE',
        stage: 'RAZORPAY_FETCH',
        requestId,
      });
      return;
    }

    // 5b. Inspect provider payments for refund status
    const refundedPayment = (allPayments || []).find(
      (p: any) =>
        p &&
        p.qr_code_id === qrId &&
        (p.status === 'refunded' ||
          p.refund_status === 'full' ||
          p.refund_status === 'partial' ||
          (p.amount_refunded && Number(p.amount_refunded) > 0))
    );

    if (refundedPayment) {
      const isFull =
        refundedPayment.status === 'refunded' ||
        refundedPayment.refund_status === 'full' ||
        Number(refundedPayment.amount_refunded) >= Number(booking.amountInPaise);
      const newStatus = isFull ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

      try {
        const docRef = db.collection('demo_bookings').doc(bookingId);
        await docRef.update({
          status: newStatus,
          refundStatus: isFull ? 'FULL' : 'PARTIAL',
          amountRefundedInPaise: refundedPayment.amount_refunded || refundedPayment.amount,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (refundUpdateErr: any) {
        console.error(`[verifyRazorpayQr] [${requestId}] Failed to record refund status:`, refundUpdateErr);
      }

      res.status(409).json({
        error: 'Payment for this booking has been refunded. No active ticket is available.',
        code: 'PAYMENT_REFUNDED',
        status: newStatus,
        bookingId: booking.bookingId,
        requestId,
      });
      return;
    }

    // 6. Strict QR entity provider validation (require fixed_amount === true)
    if (
      qrData.id !== qrId ||
      qrData.type !== 'upi_qr' ||
      qrData.usage !== 'single_use' ||
      qrData.fixed_amount !== true ||
      Number(qrData.payment_amount) !== Number(booking.amountInPaise)
    ) {
      if (booking.status === 'PAID') {
        res.status(200).json({
          success: true,
          status: 'PAID',
          bookingId: booking.bookingId,
          message: 'Payment already verified.',
          ticket: formatVerifiedTicket(booking),
          requestId,
        });
        return;
      }
      console.error(`[verifyRazorpayQr] [${requestId}] QR entity mismatch with booking invariants.`);
      res.status(400).json({
        error: 'Provider QR Code configuration does not match booking invariants.',
        code: 'QR_ENTITY_MISMATCH',
        stage: 'QR_VERIFICATION',
        requestId,
      });
      return;
    }

    // 8. Distinguish captured payments associated with booking QR:
    // a) qrCapturedPayments: All captured payments matching exact QR ID
    // b) validCapturedPayments: Captured payments matching exact QR ID AND expected amount AND INR currency
    // c) mismatchedCapturedPayments: Captured payments matching exact QR ID but with amount or currency mismatch
    const qrCapturedPayments = allPayments.filter(
      (p: any) =>
        p &&
        typeof p.id === 'string' &&
        p.id.trim().length > 0 &&
        p.qr_code_id === qrId &&
        p.status === 'captured'
    );

    const capturedPayments = qrCapturedPayments.filter(
      (p: any) =>
        Number(p.amount) === Number(booking.amountInPaise) &&
        typeof p.currency === 'string' &&
        p.currency.toUpperCase() === 'INR'
    );

    const mismatchedCapturedPayments = qrCapturedPayments.filter(
      (p: any) =>
        Number(p.amount) !== Number(booking.amountInPaise) ||
        typeof p.currency !== 'string' ||
        p.currency.toUpperCase() !== 'INR'
    );

    const now = new Date();

    // 8b. If ANY captured payment associated with this QR has an incorrect amount or currency:
    // STRICT SECURITY INVARIANT:
    // Even if one payment is valid, if ANY associated captured payment is mismatched:
    // - Do NOT mark the booking PAID.
    // - Do NOT generate or return a newly confirmed ticket.
    // - Do NOT mark the booking EXPIRED or FAILED.
    // - Keep the booking in a retryable reconciliation state (PENDING) with reconciliationNeeded: true.
    // - Safely record the mismatched payment details idempotently in Firestore.
    if (mismatchedCapturedPayments.length > 0) {
      const mismatchRecords = mismatchedCapturedPayments.map((p: any) => {
        const isAmtMismatch = Number(p.amount) !== Number(booking.amountInPaise);
        const isCurrMismatch = typeof p.currency !== 'string' || p.currency.toUpperCase() !== 'INR';
        let reason = 'AMOUNT_AND_CURRENCY_MISMATCH';
        if (isAmtMismatch && !isCurrMismatch) reason = 'AMOUNT_MISMATCH';
        else if (!isAmtMismatch && isCurrMismatch) reason = 'CURRENCY_MISMATCH';

        return {
          paymentId: p.id,
          amount: p.amount,
          expectedAmount: booking.amountInPaise,
          currency: p.currency || null,
          expectedCurrency: 'INR',
          qrCodeId: p.qr_code_id,
          capturedAt: p.created_at,
          recordedAt: now.toISOString(),
          reason,
        };
      });

      console.warn(
        `[verifyRazorpayQr] [${requestId}] Mismatched captured payment(s) detected on booking ${booking.bookingId} (total associated: ${qrCapturedPayments.length}, valid: ${capturedPayments.length}, mismatched: ${mismatchedCapturedPayments.length}):`,
        mismatchRecords
      );

      let freshStatus = booking.status;
      let latestBookingData = booking;
      try {
        const docRef = db.collection('demo_bookings').doc(bookingId);
        await db.runTransaction(async (transaction: any) => {
          const freshSnap = await transaction.get(docRef);
          if (!freshSnap.exists) return;
          const freshData = freshSnap.data() as any;
          freshStatus = freshData.status;
          latestBookingData = freshData;

          // Preserve immutable PAID status and existing ticket, but record newly discovered mismatched captures
          // for financial reconciliation/refund investigation
          const existingMismatches = freshData.reconciliationCapturedPayments || [];
          const newMismatches = mismatchRecords.filter(
            (m: any) => !existingMismatches.some((em: any) => em.paymentId === m.paymentId)
          );

          if (newMismatches.length > 0) {
            transaction.update(docRef, {
              reconciliationCapturedPayments: FieldValue.arrayUnion(...newMismatches),
              reconciliationNeeded: true,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        });
      } catch (recErr: any) {
        console.error(`[verifyRazorpayQr] [${requestId}] Failed to record mismatched payments: ${recErr.message}`);
        const sanitized = sanitizeFirestoreError(recErr);
        res.status(503).json({
          error: 'Failed to record payment parameter mismatch reconciliation. Please retry.',
          code: 'RECONCILIATION_WRITE_FAILED',
          stage: 'RECONCILIATION_UPDATE',
          firestoreErrorCode: sanitized.code,
          firestoreErrorMessage: sanitized.message,
          requestId,
        });
        return;
      }

      if (freshStatus === 'PAID') {
        res.status(200).json({
          success: true,
          status: 'PAID',
          bookingId: booking.bookingId,
          message: 'Payment verified; additional mismatched payment recorded for reconciliation.',
          ticket: formatVerifiedTicket(latestBookingData),
          reconciliationNeeded: true,
          requestId,
        });
        return;
      }

      res.status(200).json({
        success: false,
        status: 'PENDING',
        bookingId: booking.bookingId,
        reconciliationNeeded: true,
        message: 'Payment received with parameter mismatch; awaiting administrative reconciliation.',
        code: 'PAYMENT_PARAMETER_MISMATCH_RECONCILIATION_REQUIRED',
        requestId,
      });
      return;
    }

    // 8c. If already confirmed PAID and no mismatched captures detected:
    // Concurrency-safe duplicate capture recording inside a transaction
    if (booking.status === 'PAID') {
      let latestPaidBooking = booking;
      let hasDuplicates = (booking.duplicateCapturedPayments || []).length > 0;

      try {
        const docRef = db.collection('demo_bookings').doc(bookingId);
        await db.runTransaction(async (transaction: any) => {
          // 1. Read latest booking document inside transaction
          const freshSnap = await transaction.get(docRef);
          if (!freshSnap.exists) {
            throw new Error('BOOKING_NOT_FOUND');
          }
          const freshData = freshSnap.data() as any;

          // 2. Check that status is still PAID
          if (freshData.status !== 'PAID') {
            console.warn(`[verifyRazorpayQr] [${requestId}] Booking status mutated from PAID to "${freshData.status}"`);
            throw new Error(`INVALID_STATE_TRANSITION_${freshData.status}`);
          }

          latestPaidBooking = freshData;

          // 3. Exclude the primary payment ID and deduplicate against latest persisted duplicateCapturedPayments
          const primaryPaymentId = freshData.razorpayPaymentId;
          const existingDuplicates = freshData.duplicateCapturedPayments || [];

          const newDuplicates = capturedPayments
            .filter(
              (p: any) =>
                p.id !== primaryPaymentId &&
                !existingDuplicates.some((ed: any) => ed.paymentId === p.id)
            )
            .map((p: any) => ({
              paymentId: p.id,
              amount: p.amount,
              currency: p.currency,
              capturedAt: p.created_at,
              recordedAt: now.toISOString(),
            }));

          if (newDuplicates.length > 0) {
            transaction.update(docRef, {
              duplicateCapturedPayments: FieldValue.arrayUnion(...newDuplicates),
              reconciliationNeeded: true,
              updatedAt: FieldValue.serverTimestamp(),
            });
            hasDuplicates = true;
            latestPaidBooking = {
              ...freshData,
              duplicateCapturedPayments: [...existingDuplicates, ...newDuplicates],
              reconciliationNeeded: true,
            };
          } else if (existingDuplicates.length > 0) {
            hasDuplicates = true;
          }
        });
      } catch (dupErr: any) {
        console.error(`[verifyRazorpayQr] [${requestId}] Failed to record duplicate payments on PAID booking: ${dupErr.message}`);
        const sanitized = sanitizeFirestoreError(dupErr);
        res.status(503).json({
          error: 'Failed to record duplicate payment reconciliation. Please retry.',
          code: 'RECONCILIATION_WRITE_FAILED',
          stage: 'RECONCILIATION_UPDATE',
          firestoreErrorCode: sanitized.code,
          firestoreErrorMessage: sanitized.message,
          requestId,
        });
        return;
      }

      res.status(200).json({
        success: true,
        status: 'PAID',
        bookingId: latestPaidBooking.bookingId,
        message: 'Payment already verified.',
        ticket: formatVerifiedTicket(latestPaidBooking),
        ...(hasDuplicates ? { reconciliationNeeded: true } : {}),
        requestId,
      });
      return;
    }

    // 9. State machine check for existing terminal states (EXPIRED or FAILED)
    if (booking.status === 'EXPIRED' || booking.status === 'FAILED') {
      // Reconcile: If a captured payment was received on Razorpay for this expired booking, record it for refund audit
      if (capturedPayments.length > 0) {
        try {
          const docRef = db.collection('demo_bookings').doc(bookingId);
          await db.runTransaction(async (transaction: any) => {
            const freshSnap = await transaction.get(docRef);
            if (!freshSnap.exists) return;
            const freshData = freshSnap.data() as any;
            if (freshData.status === 'EXPIRED' || freshData.status === 'FAILED') {
              const reconcileRecords = capturedPayments.map((p: any) => ({
                paymentId: p.id,
                amount: p.amount,
                currency: p.currency,
                capturedAt: p.created_at,
                recordedAt: now.toISOString(),
                reason: 'CAPTURED_ON_EXPIRED_OR_FAILED_BOOKING',
              }));
              transaction.update(docRef, {
                reconciliationCapturedPayments: FieldValue.arrayUnion(...reconcileRecords),
                reconciliationNeeded: true,
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
          });
        } catch (recErr: any) {
          console.error(`[verifyRazorpayQr] [${requestId}] Failed to record reconciliation on expired booking: ${recErr.message}`);
          const sanitized = sanitizeFirestoreError(recErr);
          res.status(503).json({
            error: 'Failed to record payment reconciliation for terminal booking. Please retry.',
            code: 'RECONCILIATION_WRITE_FAILED',
            stage: 'RECONCILIATION_UPDATE',
            firestoreErrorCode: sanitized.code,
            firestoreErrorMessage: sanitized.message,
            requestId,
          });
          return;
        }
      }

      res.status(409).json({
        success: false,
        status: booking.status,
        bookingId: booking.bookingId,
        reconciliationNeeded: capturedPayments.length > 0,
        error: `Cannot verify payment for booking in terminal "${booking.status}" status.`,
        code: `BOOKING_ALREADY_${booking.status}`,
        stage: 'STATE_VALIDATION',
        requestId,
      });
      return;
    }

    // 10. Handle case where NO captured payment has been confirmed yet
    if (capturedPayments.length === 0) {
      const authorizedPayment = allPayments.find(
        (p: any) => p && p.qr_code_id === qrId && p.status === 'authorized'
      );
      if (authorizedPayment) {
        res.status(200).json({
          success: false,
          status: 'AUTHORIZED',
          bookingId: booking.bookingId,
          message: 'Payment authorized but awaiting settlement capture.',
          code: 'PAYMENT_AUTHORIZED_PENDING_CAPTURE',
          requestId,
        });
        return;
      }

      // Check Expiry Race-Safely:
      // A booking is ONLY transitioned from PENDING to EXPIRED if ALL conditions are met:
      // a) Razorpay reports ZERO payments received (neither count nor amount > 0)
      // b) Razorpay QR status is closed
      // c) Configured close_by timestamp + 15s clock-skew buffer has elapsed
      const EXPIRY_GRACE_BUFFER_SECONDS = 15;
      const effectiveCloseBy = booking.qrCloseBy || (qrData.close_by ? Number(qrData.close_by) : 0);
      const isPastCloseByWithGrace =
        effectiveCloseBy > 0 && Math.floor(now.getTime() / 1000) > effectiveCloseBy + EXPIRY_GRACE_BUFFER_SECONDS;
      const hasProviderReportedPayments =
        Number(qrData.payments_count_received || 0) > 0 || Number(qrData.payments_amount_received || 0) > 0;

      if (hasProviderReportedPayments) {
        // Funds were received by Razorpay; capture is settling. Do NOT expire.
        res.status(200).json({
          success: false,
          status: 'PENDING',
          bookingId: booking.bookingId,
          message: 'Payment registered by provider; awaiting settlement confirmation.',
          paymentsReceived: qrData.payments_count_received,
          requestId,
        });
        return;
      }

      if (isPastCloseByWithGrace && qrData.status === 'closed') {
        // SECOND CONFIRMATION PASS:
        // Before committing PENDING -> EXPIRED in Firestore, perform an immediate second fetch from Razorpay API
        // to close the race gap where a payment was captured during the initial fetch processing.
        // If provider status is uncertain or an error occurs during reconciliation, keep booking PENDING.
        let finalQrCheck: any;
        let finalPaymentsCheck: any[];
        try {
          [finalQrCheck, finalPaymentsCheck] = await Promise.all([
            fetchRazorpayQrCode(qrId),
            fetchAllPaymentsPaginated(qrId),
          ]);
        } catch (recheckErr: any) {
          console.warn(`[verifyRazorpayQr] [${requestId}] Provider recheck failed during expiry evaluation: ${recheckErr.message}. Keeping booking PENDING.`);
          res.status(200).json({
            success: false,
            status: 'PENDING',
            bookingId: booking.bookingId,
            message: 'Provider reconciliation in progress; awaiting status confirmation.',
            requestId,
          });
          return;
        }

        // Check for captured payments associated with booking QR in the second fetch:
        const secondQrCaptured = finalPaymentsCheck.filter(
          (p: any) =>
            p &&
            typeof p.id === 'string' &&
            p.id.trim().length > 0 &&
            p.qr_code_id === qrId &&
            p.status === 'captured'
        );

        // Separate valid vs mismatched payments in the second pass:
        const lateCapturedPayments = secondQrCaptured.filter(
          (p: any) =>
            Number(p.amount) === Number(booking.amountInPaise) &&
            typeof p.currency === 'string' &&
            p.currency.toUpperCase() === 'INR'
        );

        const lateMismatchedPayments = secondQrCaptured.filter(
          (p: any) =>
            Number(p.amount) !== Number(booking.amountInPaise) ||
            typeof p.currency !== 'string' ||
            p.currency.toUpperCase() !== 'INR'
        );

        // STRICT SECURITY INVARIANT (Second pass):
        // If ANY captured payment associated with this QR is mismatched (even if another is valid):
        // - Abort expiry and do NOT mark PAID.
        // - Do NOT issue a ticket.
        // - Retain booking in reconciliation-required state (PENDING) with reconciliationNeeded: true.
        // - Safely record mismatched payment details idempotently.
        if (lateMismatchedPayments.length > 0) {
          const mismatchRecords = lateMismatchedPayments.map((p: any) => {
            const isAmtMismatch = Number(p.amount) !== Number(booking.amountInPaise);
            const isCurrMismatch = typeof p.currency !== 'string' || p.currency.toUpperCase() !== 'INR';
            let reason = 'AMOUNT_AND_CURRENCY_MISMATCH';
            if (isAmtMismatch && !isCurrMismatch) reason = 'AMOUNT_MISMATCH';
            else if (!isAmtMismatch && isCurrMismatch) reason = 'CURRENCY_MISMATCH';

            return {
              paymentId: p.id,
              amount: p.amount,
              expectedAmount: booking.amountInPaise,
              currency: p.currency || null,
              expectedCurrency: 'INR',
              qrCodeId: p.qr_code_id,
              capturedAt: p.created_at,
              recordedAt: now.toISOString(),
              reason,
            };
          });

          console.warn(
            `[verifyRazorpayQr] [${requestId}] Mismatched captured payment(s) discovered during second expiry check for booking ${booking.bookingId} (total associated: ${secondQrCaptured.length}, valid: ${lateCapturedPayments.length}, mismatched: ${lateMismatchedPayments.length}):`,
            mismatchRecords
          );

          let freshStatus = booking.status;
          let latestBookingData = booking;
          try {
            const docRef = db.collection('demo_bookings').doc(bookingId);
            await db.runTransaction(async (transaction: any) => {
              const freshSnap = await transaction.get(docRef);
              if (!freshSnap.exists) return;
              const freshData = freshSnap.data() as any;
              freshStatus = freshData.status;
              latestBookingData = freshData;

              // Preserve immutable PAID status and existing ticket, but record newly discovered mismatched captures
              // for financial reconciliation/refund investigation
              const existingMismatches = freshData.reconciliationCapturedPayments || [];
              const newMismatches = mismatchRecords.filter(
                (m: any) => !existingMismatches.some((em: any) => em.paymentId === m.paymentId)
              );

              if (newMismatches.length > 0) {
                transaction.update(docRef, {
                  reconciliationCapturedPayments: FieldValue.arrayUnion(...newMismatches),
                  reconciliationNeeded: true,
                  updatedAt: FieldValue.serverTimestamp(),
                });
              }
            });
          } catch (recErr: any) {
            console.error(`[verifyRazorpayQr] [${requestId}] Failed to record second-fetch mismatched payments: ${recErr.message}`);
            const sanitized = sanitizeFirestoreError(recErr);
            res.status(503).json({
              error: 'Failed to record payment parameter mismatch reconciliation during expiry recheck. Please retry.',
              code: 'RECONCILIATION_WRITE_FAILED',
              stage: 'RECONCILIATION_UPDATE',
              firestoreErrorCode: sanitized.code,
              firestoreErrorMessage: sanitized.message,
              requestId,
            });
            return;
          }

          if (freshStatus === 'PAID') {
            res.status(200).json({
              success: true,
              status: 'PAID',
              bookingId: booking.bookingId,
              message: 'Payment verified; additional mismatched payment recorded for reconciliation.',
              ticket: formatVerifiedTicket(latestBookingData),
              reconciliationNeeded: true,
              requestId,
            });
            return;
          }

          res.status(200).json({
            success: false,
            status: 'PENDING',
            bookingId: booking.bookingId,
            reconciliationNeeded: true,
            message: 'Payment received with parameter mismatch; awaiting administrative reconciliation.',
            code: 'PAYMENT_PARAMETER_MISMATCH_RECONCILIATION_REQUIRED',
            requestId,
          });
          return;
        } else if (lateCapturedPayments.length > 0) {
          console.log(`[verifyRazorpayQr] [${requestId}] Late captured payment(s) discovered during expiry reconciliation. Aborting expiry.`);
          // Forward to payment processing block below
          capturedPayments.push(...lateCapturedPayments);
        } else {
          // If the second pass detects provider-reported payments in aggregate counters
          if (
            Number(finalQrCheck.payments_count_received || 0) > 0 ||
            Number(finalQrCheck.payments_amount_received || 0) > 0
          ) {
            console.log(`[verifyRazorpayQr] [${requestId}] Aggregate counter shows payment arrived. Keeping booking PENDING.`);
            res.status(200).json({
              success: false,
              status: 'PENDING',
              bookingId: booking.bookingId,
              message: 'Payment registered by provider; awaiting settlement confirmation.',
              paymentsReceived: finalQrCheck.payments_count_received,
              requestId,
            });
            return;
          }

          if (finalQrCheck.status !== 'closed') {
            console.log(`[verifyRazorpayQr] [${requestId}] Provider QR reopened or not closed. Keeping booking PENDING.`);
            res.status(200).json({
              success: false,
              status: 'PENDING',
              bookingId: booking.bookingId,
              message: 'Awaiting UPI payment.',
              requestId,
            });
            return;
          }

          const docRef = db.collection('demo_bookings').doc(bookingId);
          let finalStatus = 'EXPIRED';
          let latestBookingData: any = booking;
          let transactionSucceeded = false;

          try {
            await db.runTransaction(async (transaction: any) => {
              const freshSnap = await transaction.get(docRef);
              if (!freshSnap.exists) {
                throw new Error('BOOKING_NOT_FOUND');
              }
              const freshData = freshSnap.data() as any;

              if (freshData.status === 'PAID') {
                // A concurrent webhook or polling succeeded in the meantime; PAID is immutable terminal state
                finalStatus = 'PAID';
                latestBookingData = freshData;
                return;
              }

              if (freshData.status === 'PENDING') {
                transaction.update(docRef, {
                  status: 'EXPIRED',
                  updatedAt: FieldValue.serverTimestamp(),
                });
                finalStatus = 'EXPIRED';
                latestBookingData = { ...freshData, status: 'EXPIRED' };
              } else {
                // Retain current persisted state (e.g. FAILED or already EXPIRED)
                finalStatus = freshData.status;
                latestBookingData = freshData;
              }
            });
            transactionSucceeded = true;
          } catch (txErr: any) {
            console.error(`[verifyRazorpayQr] [${requestId}] Expiry transaction failed: ${txErr?.message}`);
            // Attempt to re-read booking to establish actual persisted state
            try {
              const reReadSnap = await docRef.get();
              if (reReadSnap.exists) {
                latestBookingData = reReadSnap.data();
                finalStatus = latestBookingData.status;
                transactionSucceeded = true;
              }
            } catch {
              // Cannot establish state
            }
          }

          if (!transactionSucceeded) {
            // If transaction failed and state cannot be established, fail closed with 503 instead of assuming EXPIRED
            res.status(503).json({
              error: 'Failed to verify or transition booking expiry status. Please retry.',
              code: 'STATE_TRANSITION_UNAVAILABLE',
              stage: 'FIRESTORE_EXPIRY_TRANSACTION',
              requestId,
            });
            return;
          }

          if (finalStatus === 'PAID') {
            res.status(200).json({
              success: true,
              status: 'PAID',
              bookingId: latestBookingData.bookingId,
              ticket: formatVerifiedTicket(latestBookingData),
              requestId,
            });
            return;
          }

          res.status(200).json({
            success: false,
            status: finalStatus,
            bookingId: booking.bookingId,
            error: 'This Dynamic UPI QR code has expired. Please create a new pass.',
            code: 'QR_EXPIRED',
            requestId,
          });
          return;
        }
      }

      if (capturedPayments.length === 0) {
        // If QR is closed early but grace period has not elapsed, or if QR is still active:
        // Booking remains PENDING until grace period expires and provider payment status is fully reconciled.
        res.status(200).json({
          success: false,
          status: 'PENDING',
          bookingId: booking.bookingId,
          message: qrData.status === 'closed'
            ? 'QR code closed; awaiting settlement grace reconciliation.'
            : 'Awaiting UPI payment. Please scan QR with any UPI app.',
          paymentsReceived: qrData.payments_count_received || 0,
          requestId,
        });
        return;
      }
    }

    // 11. Captured payments found: Select earliest capture as primary, record duplicates for reconciliation
    capturedPayments.sort((a: any, b: any) => Number(a.created_at || 0) - Number(b.created_at || 0));
    const primaryPayment = capturedPayments[0];
    const duplicatePayments = capturedPayments.slice(1);

    const duplicateRecords = duplicatePayments
      .filter((p: any) => p.id !== primaryPayment.id)
      .map((p: any) => ({
        paymentId: p.id,
        amount: p.amount,
        currency: p.currency,
        capturedAt: p.created_at,
        recordedAt: now.toISOString(),
      }));

    if (duplicateRecords.length > 0) {
      console.warn(
        JSON.stringify({
          event: 'DUPLICATE_CAPTURED_PAYMENTS_DETECTED',
          bookingId: booking.bookingId,
          primaryPaymentId: primaryPayment.id,
          duplicatePayments: duplicateRecords,
        })
      );
    }

    let finalBookingData: any = null;

    // 12. Atomic transaction update to PAID status with state machine enforcement
    try {
      const docRef = db.collection('demo_bookings').doc(bookingId);
      await db.runTransaction(async (transaction: any) => {
        const freshSnap = await transaction.get(docRef);
        if (!freshSnap.exists) {
          throw new Error('BOOKING_NOT_FOUND');
        }
        const freshData = freshSnap.data() as any;

        // Terminal state check: PAID is immutable
        if (freshData.status === 'PAID') {
          // If already PAID, preserve primary payment and append all other captured payments
          // (both newly discovered duplicates AND the payment selected by polling if webhook won the race)
          // Ensure freshData.razorpayPaymentId is NEVER recorded as a duplicate
          const existingDuplicates = freshData.duplicateCapturedPayments || [];
          const allOtherCaptured = capturedPayments
            .filter((p: any) => p.id !== freshData.razorpayPaymentId)
            .map((p: any) => ({
              paymentId: p.id,
              amount: p.amount,
              currency: p.currency,
              capturedAt: p.created_at,
              recordedAt: now.toISOString(),
            }));

          const newDuplicates = allOtherCaptured.filter(
            (d: any) => !existingDuplicates.some((ed: any) => ed.paymentId === d.paymentId)
          );

          if (newDuplicates.length > 0) {
            transaction.update(docRef, {
              duplicateCapturedPayments: FieldValue.arrayUnion(...newDuplicates),
              reconciliationNeeded: true,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
          finalBookingData = freshData;
          return;
        }

        // State machine invariant: only PENDING can transition to PAID
        if (freshData.status !== 'PENDING') {
          console.warn(`[verifyRazorpayQr] Cannot fulfill booking ${bookingId}: current status is "${freshData.status}".`);
          throw new Error(`INVALID_STATE_TRANSITION_${freshData.status}`);
        }

        const updateData: any = {
          status: 'PAID',
          paymentMethod: 'UPI_QR',
          razorpayPaymentId: primaryPayment.id,
          paidAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (duplicateRecords.length > 0) {
          updateData.duplicateCapturedPayments = duplicateRecords;
          updateData.reconciliationNeeded = true;
        }

        transaction.update(docRef, updateData);

        finalBookingData = {
          ...freshData,
          status: 'PAID',
          paymentMethod: 'UPI_QR',
          razorpayPaymentId: primaryPayment.id,
          paidAt: now.toISOString(),
          ...(duplicateRecords.length > 0 ? { duplicateCapturedPayments: duplicateRecords, reconciliationNeeded: true } : {}),
        };
      });
    } catch (txErr: any) {
      if (txErr?.message?.startsWith('INVALID_STATE_TRANSITION_')) {
        const fromState = txErr.message.replace('INVALID_STATE_TRANSITION_', '');
        res.status(409).json({
          error: `Booking is in "${fromState}" status and cannot be paid.`,
          code: `BOOKING_ALREADY_${fromState}`,
          stage: 'FIRESTORE_UPDATE',
          requestId,
        });
        return;
      }

      const sanitized = sanitizeFirestoreError(txErr);
      res.status(500).json({
        error: 'Failed to update booking status in database.',
        code: 'DATABASE_UPDATE_ERROR',
        stage: 'FIRESTORE_UPDATE',
        firestoreErrorCode: sanitized.code,
        firestoreErrorMessage: sanitized.message,
        requestId,
      });
      return;
    }

    const verifiedTicket = formatVerifiedTicket(finalBookingData);

    res.status(200).json({
      success: true,
      status: 'PAID',
      bookingId: finalBookingData.bookingId,
      ticket: verifiedTicket,
      requestId,
    });
  } catch (err: any) {
    console.error(`[verifyRazorpayQr] [${requestId}] [UNHANDLED_EXCEPTION]`, err);
    res.status(500).json({
      error: err?.message || 'UPI QR payment verification failed.',
      code: 'INTERNAL_SERVER_ERROR',
      stage: 'UNHANDLED_EXCEPTION',
      requestId,
    });
  }
}
