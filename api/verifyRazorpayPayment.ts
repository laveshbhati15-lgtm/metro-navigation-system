import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRazorpayConfig } from './_lib/config.js';
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const config = getRazorpayConfig();
    if (!config) {
      res.status(503).json({
        error: 'Razorpay Test credentials are not configured in backend.',
        code: 'CONFIG_MISSING',
      });
      return;
    }

    const { db, isConfigured } = getFirebaseAdmin();
    if (!isConfigured || !db) {
      res.status(503).json({
        error: 'Firebase database is not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY.',
        code: 'DATABASE_UNAVAILABLE',
      });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { bookingId, razorpayPaymentId, razorpaySignature } = body;

    if (!bookingId || !razorpayPaymentId || !razorpaySignature) {
      res.status(400).json({
        error: 'bookingId, razorpayPaymentId, and razorpaySignature are required.',
      });
      return;
    }

    const docRef = db.collection('demo_bookings').doc(bookingId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      res.status(404).json({ error: `Booking record "${bookingId}" not found.` });
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
      console.warn(`SECURITY ALERT: Invalid signature detected for booking ${bookingId}`);
      res.status(400).json({
        error: 'Invalid payment signature. Verification failed.',
        code: 'SIGNATURE_MISMATCH',
      });
      return;
    }

    // Verify actual payment details from Razorpay API
    try {
      const payment = await fetchRazorpayPayment(razorpayPaymentId);
      if (payment.order_id !== expectedOrderId) {
        res.status(400).json({
          error: 'Payment is not associated with this booking order.',
          code: 'ORDER_MISMATCH',
        });
        return;
      }

      if (Number(payment.amount) !== Number(booking.amountInPaise)) {
        res.status(400).json({
          error: 'Paid amount does not match booking fare.',
          code: 'AMOUNT_MISMATCH',
        });
        return;
      }

      if (payment.status !== 'captured' && payment.status !== 'authorized') {
        res.status(400).json({
          error: `Payment is not in successful state (status: ${payment.status}).`,
          code: 'PAYMENT_NOT_CAPTURED',
        });
        return;
      }
    } catch (fetchErr: any) {
      console.warn(
        'Could not fetch payment from Razorpay API directly, relying on HMAC verification:',
        fetchErr.message
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
    await docRef.update({
      status: 'PAID',
      razorpayPaymentId,
      razorpaySignature,
      paidAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      qrPayload,
    });

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
    });
  } catch (err: any) {
    console.error('Error verifying Razorpay payment:', err);
    res.status(500).json({
      error: err.message || 'Payment verification failed.',
    });
  }
}
