import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { getRazorpayConfig, getDiagnosticsSummary } from './_lib/config.js';
import {
  getFirebaseAdmin,
  getFirebaseAuth,
  probeFirestore,
  sanitizeFirestoreError,
  FieldValue,
} from './_lib/firebaseAdmin.js';
import { verifySignature, fetchRazorpayPayment } from './_lib/razorpay.js';
import { formatVerifiedTicket } from './_lib/formatTicket.js';

function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;
  if (origin && typeof origin === 'string') {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = `req_vrf_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    // Safe health-check and configuration status (GET with ?health=1 or ?diagnostics=1)
    if (
      req.method === 'GET' &&
      (req.url?.includes('health') ||
        req.url?.includes('check') ||
        req.url?.includes('diagnostic'))
    ) {
      let isConfigured = false;
      let initError: string | null = null;
      let metadata: any = null;
      let dbInstance: any = null;

      try {
        const adminResult = getFirebaseAdmin();
        isConfigured = adminResult.isConfigured;
        initError = adminResult.initError;
        metadata = adminResult.metadata;
        dbInstance = adminResult.db;
      } catch (adminErr: any) {
        initError = adminErr?.message || 'Firebase Admin initialization exception';
      }

      let firestoreProbe;
      try {
        firestoreProbe = await probeFirestore(dbInstance);
      } catch (probeErr: any) {
        firestoreProbe = { ok: false, stage: 'PROBE_FAILED', message: probeErr?.message };
      }

      let diagnostics;
      try {
        diagnostics = getDiagnosticsSummary({ isConfigured, initError, metadata, firestoreProbe });
      } catch (diagErr: any) {
        diagnostics = {
          error: diagErr?.message || 'Failed to generate diagnostics summary',
        };
      }

      res.status(200).json({
        status: 'ok',
        service: 'Delhi Metro Navigator Payment Verification API',
        disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
        diagnostics,
        requestId,
      });
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
    const config = getRazorpayConfig();
    if (!config) {
      console.error(
        `[verifyRazorpayPayment] [${requestId}] [CONFIG_MISSING] Razorpay credentials missing.`
      );
      res.status(503).json({
        error: 'Razorpay Test credentials are not configured in backend.',
        code: 'CONFIG_MISSING',
        stage: 'CONFIG_VALIDATION',
        requestId,
      });
      return;
    }

    const { db, isConfigured, initError } = getFirebaseAdmin();
    if (!isConfigured || !db) {
      console.error(
        `[verifyRazorpayPayment] [${requestId}] [DATABASE_UNAVAILABLE] Firebase Admin not configured. Cause: ${initError || 'FIREBASE_SERVICE_ACCOUNT_KEY missing'}`
      );
      res.status(503).json({
        error: 'Firebase database is not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY in Vercel environment variables.',
        code: 'DATABASE_UNAVAILABLE',
        stage: 'FIREBASE_INITIALIZATION',
        requestId,
      });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { bookingId, razorpayPaymentId, razorpaySignature } = body;

    if (!bookingId || !razorpayPaymentId || !razorpaySignature) {
      console.warn(
        `[verifyRazorpayPayment] [${requestId}] [INVALID_REQUEST] Missing required verification parameters.`
      );
      res.status(400).json({
        error: 'bookingId, razorpayPaymentId, and razorpaySignature are required.',
        code: 'INVALID_REQUEST',
        stage: 'REQUEST_VALIDATION',
        requestId,
      });
      return;
    }

    let docSnap;
    try {
      const docRef = db.collection('demo_bookings').doc(bookingId);
      docSnap = await docRef.get();
    } catch (lookupErr: any) {
      const sanitized = sanitizeFirestoreError(lookupErr);
      console.error(
        `[verifyRazorpayPayment] [${requestId}] [BOOKING_LOOKUP] [${sanitized.code}] Firestore read failed: ${sanitized.message}`
      );
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
      console.warn(
        `[verifyRazorpayPayment] [${requestId}] [BOOKING_NOT_FOUND] Booking record "${bookingId}" not found.`
      );
      res.status(404).json({
        error: `Booking record "${bookingId}" not found.`,
        code: 'BOOKING_NOT_FOUND',
        stage: 'BOOKING_LOOKUP',
        requestId,
      });
      return;
    }

    const booking = docSnap.data() as any;

    // 1. Strict Authorization Verification (No silent fallback, reject unowned bookings)
    const authHeader = req.headers.authorization;
    const headerStr = (Array.isArray(authHeader) ? authHeader[0] : authHeader)?.trim();
    const rawGuestHeader = req.headers['x-guest-access-token'];
    const guestToken = (Array.isArray(rawGuestHeader) ? rawGuestHeader[0] : rawGuestHeader)?.trim() || body.guestAccessToken;

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
        console.warn(`[verifyRazorpayPayment] [${requestId}] Auth token verification failed: ${tokenErr?.message}`);
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
      console.error(`[verifyRazorpayPayment] [${requestId}] Booking ${bookingId} has no ownership credentials.`);
      res.status(403).json({
        error: 'Booking record has no valid ownership credentials associated with it.',
        code: 'UNOWNED_BOOKING',
        stage: 'AUTHORIZATION',
        requestId,
      });
      return;
    }

    // 2. Terminal refund check: Refunded bookings can NEVER return an active ticket
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

    // 3. Idempotency: Return existing verified ticket if already processed
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

    // Retrieve expected order ID from Firestore (NEVER trust client-provided order ID)
    const expectedOrderId = booking.razorpayOrderId;

    // Verify cryptographic HMAC SHA-256 signature with timing-safe comparison
    const isValid = verifySignature(
      expectedOrderId,
      razorpayPaymentId,
      razorpaySignature
    );

    if (!isValid) {
      console.warn(
        `SECURITY ALERT: Invalid signature detected for booking ${bookingId} [${requestId}]`
      );
      res.status(400).json({
        error: 'Invalid payment signature. Verification failed.',
        code: 'SIGNATURE_MISMATCH',
        stage: 'SIGNATURE_VERIFICATION',
        requestId,
      });
      return;
    }

    // Verify actual payment details from Razorpay API
    try {
      const payment = await fetchRazorpayPayment(razorpayPaymentId);

      // Check for refund status on fetched payment
      if (
        payment.status === 'refunded' ||
        payment.refund_status === 'full' ||
        payment.refund_status === 'partial' ||
        (payment.amount_refunded && Number(payment.amount_refunded) > 0)
      ) {
        const isFull =
          payment.status === 'refunded' ||
          payment.refund_status === 'full' ||
          Number(payment.amount_refunded) >= Number(booking.amountInPaise);
        const newStatus = isFull ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

        try {
          const docRef = db.collection('demo_bookings').doc(bookingId);
          await docRef.update({
            status: newStatus,
            refundStatus: isFull ? 'FULL' : 'PARTIAL',
            amountRefundedInPaise: payment.amount_refunded || payment.amount,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } catch (refundUpdateErr: any) {
          console.error(`[verifyRazorpayPayment] [${requestId}] Failed to record refund status:`, refundUpdateErr);
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
      if (payment.order_id !== expectedOrderId) {
        console.warn(
          `[verifyRazorpayPayment] [${requestId}] [ORDER_MISMATCH] Order ID mismatch: expected ${expectedOrderId}, got ${payment.order_id}`
        );
        res.status(400).json({
          error: 'Payment is not associated with this booking order.',
          code: 'ORDER_MISMATCH',
          stage: 'RAZORPAY_FETCH',
          requestId,
        });
        return;
      }

      if (Number(payment.amount) !== Number(booking.amountInPaise)) {
        console.warn(
          `[verifyRazorpayPayment] [${requestId}] [AMOUNT_MISMATCH] Amount mismatch: expected ${booking.amountInPaise}, got ${payment.amount}`
        );
        res.status(400).json({
          error: 'Paid amount does not match booking fare.',
          code: 'AMOUNT_MISMATCH',
          stage: 'RAZORPAY_FETCH',
          requestId,
        });
        return;
      }

      const expectedCurrency = (booking.currency || 'INR').toUpperCase();
      if (payment.currency && payment.currency.toUpperCase() !== expectedCurrency) {
        console.warn(
          `[verifyRazorpayPayment] [${requestId}] [CURRENCY_MISMATCH] Currency mismatch: expected ${expectedCurrency}, got ${payment.currency}`
        );
        res.status(400).json({
          error: 'Paid currency does not match booking currency.',
          code: 'CURRENCY_MISMATCH',
          stage: 'RAZORPAY_FETCH',
          requestId,
        });
        return;
      }

      if (payment.status !== 'captured') {
        const isAuthorized = payment.status === 'authorized';
        console.warn(
          `[verifyRazorpayPayment] [${requestId}] [PAYMENT_NOT_CAPTURED] Payment status is not captured: ${payment.status}`
        );
        res.status(400).json({
          error: isAuthorized
            ? 'Payment is authorized but not yet captured. Ticket will be issued upon capture confirmation.'
            : `Payment is not in successful state (status: ${payment.status}).`,
          code: isAuthorized ? 'PAYMENT_AUTHORIZED_PENDING_CAPTURE' : 'PAYMENT_NOT_CAPTURED',
          stage: 'RAZORPAY_FETCH',
          requestId,
        });
        return;
      }
    } catch (fetchErr: any) {
      if (fetchErr?.statusCode === 400 || fetchErr?.statusCode === 404 || fetchErr?.code === 'BAD_REQUEST_ERROR') {
        console.warn(
          `[verifyRazorpayPayment] [${requestId}] [PAYMENT_NOT_FOUND] Payment not found on Razorpay: ${fetchErr.message}`
        );
        res.status(400).json({
          error: 'Payment record could not be found or validated with provider.',
          code: 'PAYMENT_NOT_FOUND',
          stage: 'RAZORPAY_FETCH',
          requestId,
        });
        return;
      }
      console.error(
        `[verifyRazorpayPayment] [${requestId}] [PROVIDER_UNAVAILABLE] Razorpay API unreachable: ${fetchErr.message}`
      );
      res.status(502).json({
        error: 'Payment provider verification service temporarily unavailable. Please retry verification.',
        code: 'PROVIDER_UNAVAILABLE',
        stage: 'RAZORPAY_FETCH',
        requestId,
      });
      return;
    }

    // Generate verified ticket QR payload with mandatory disclaimer
    const now = new Date();
    const qrPayload = JSON.stringify({
      app: 'DELHI_METRO_NAVIGATOR',
      bookingId: booking.bookingId,
      type: 'DEMO_TICKET',
      status: 'PAID',
      valid: false,
      disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
      source: { id: booking.sourceId, name: booking.sourceName },
      destination: { id: booking.destinationId, name: booking.destinationName },
      passengers: booking.passengerCount,
      ticketType: booking.ticketType,
      totalFare: booking.totalFare,
      razorpayPaymentId,
      verifiedAt: now.toISOString(),
    });

    let currentBookingData = {
      ...booking,
      status: 'PAID',
      razorpayPaymentId,
      razorpaySignature,
      qrPayload,
      paidAt: now.toISOString(),
    };

    // Concurrency-safe atomic transaction for booking state transition
    try {
      const docRef = db.collection('demo_bookings').doc(bookingId);
      await db.runTransaction(async (transaction: any) => {
        const freshSnap = await transaction.get(docRef);
        if (!freshSnap.exists) {
          throw new Error('BOOKING_NOT_FOUND');
        }
        const freshData = freshSnap.data() as any;
        if (freshData.status === 'PAID') {
          // Idempotent: already marked PAID by concurrent request or webhook
          currentBookingData = freshData;
          return;
        }

        transaction.update(docRef, {
          status: 'PAID',
          razorpayPaymentId,
          razorpaySignature,
          paidAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          qrPayload,
        });

        currentBookingData = {
          ...freshData,
          status: 'PAID',
          razorpayPaymentId,
          razorpaySignature,
          qrPayload,
          paidAt: now.toISOString(),
        };
      });
    } catch (updateErr: any) {
      if (updateErr?.message === 'BOOKING_NOT_FOUND') {
        res.status(404).json({
          error: `Booking record "${bookingId}" not found.`,
          code: 'BOOKING_NOT_FOUND',
          stage: 'FIRESTORE_UPDATE',
          requestId,
        });
        return;
      }
      const sanitized = sanitizeFirestoreError(updateErr);
      console.error(
        `[verifyRazorpayPayment] [${requestId}] [FIRESTORE_UPDATE] [${sanitized.code}] Firestore update failed: ${sanitized.message}`
      );
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

    res.status(200).json({
      success: true,
      status: 'PAID',
      bookingId: currentBookingData.bookingId,
      ticket: formatVerifiedTicket(currentBookingData),
      requestId,
    });
  } catch (err: any) {
    console.error(`[verifyRazorpayPayment] [${requestId}] [UNHANDLED_EXCEPTION]`, err);
    res.status(500).json({
      error: err?.message || 'Payment verification failed.',
      code: 'INTERNAL_SERVER_ERROR',
      stage: 'UNHANDLED_EXCEPTION',
      requestId,
    });
  }
}
