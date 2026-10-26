import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRazorpayConfig, getDiagnosticsSummary } from './_lib/config.js';
import { getFirebaseAdmin, FieldValue } from './_lib/firebaseAdmin.js';
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
  setCorsHeaders(req, res);

  const requestId = `req_vrf_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

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
    const { isConfigured, initError } = getFirebaseAdmin();
    const diagnostics = getDiagnosticsSummary({ isConfigured, initError });
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

  try {
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
      console.error(
        `[verifyRazorpayPayment] [${requestId}] [BOOKING_LOOKUP_ERROR] Firestore read failed: ${lookupErr.message}`
      );
      res.status(500).json({
        error: 'Failed to retrieve booking from database.',
        code: 'DATABASE_READ_ERROR',
        stage: 'BOOKING_LOOKUP',
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

    // Idempotency: Return existing verified ticket if already processed
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

      if (payment.status !== 'captured' && payment.status !== 'authorized') {
        console.warn(
          `[verifyRazorpayPayment] [${requestId}] [PAYMENT_NOT_CAPTURED] Unexpected payment status: ${payment.status}`
        );
        res.status(400).json({
          error: `Payment is not in successful state (status: ${payment.status}).`,
          code: 'PAYMENT_NOT_CAPTURED',
          stage: 'RAZORPAY_FETCH',
          requestId,
        });
        return;
      }
    } catch (fetchErr: any) {
      console.warn(
        `[verifyRazorpayPayment] [${requestId}] Razorpay API fetch bypassed (HMAC verified): ${fetchErr.message}`
      );
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

    // Update Firestore booking record
    try {
      const docRef = db.collection('demo_bookings').doc(bookingId);
      await docRef.update({
        status: 'PAID',
        razorpayPaymentId,
        razorpaySignature,
        paidAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        qrPayload,
      });
    } catch (updateErr: any) {
      console.error(
        `[verifyRazorpayPayment] [${requestId}] [FIRESTORE_UPDATE] Firestore update failed: ${updateErr.message}`
      );
      res.status(500).json({
        error: 'Failed to update booking status in database.',
        code: 'DATABASE_UPDATE_ERROR',
        stage: 'FIRESTORE_UPDATE',
        requestId,
      });
      return;
    }

    const updatedBooking = {
      ...booking,
      status: 'PAID',
      razorpayPaymentId,
      qrPayload,
      paidAt: now.toISOString(),
    };

    res.status(200).json({
      success: true,
      status: 'PAID',
      bookingId: booking.bookingId,
      ticket: formatVerifiedTicket(updatedBooking),
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
