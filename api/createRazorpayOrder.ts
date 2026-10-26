import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRazorpayConfig, getDiagnosticsSummary } from './_lib/config.js';
import { getFirebaseAdmin, FieldValue } from './_lib/firebaseAdmin.js';
import { validateAndCalculateFare } from './_lib/fare.js';
import { createOrderOnRazorpay } from './_lib/razorpay.js';

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

function generateDemoBookingId(): string {
  const date = new Date();
  const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const randomChars = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `DMRC-DEMO-${yearMonth}-${randomChars}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

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
      service: 'Delhi Metro Navigator Payment API',
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
    // 1. Validate Razorpay Test Mode Configuration
    const config = getRazorpayConfig();
    if (!config) {
      console.error(
        `[createRazorpayOrder] [${requestId}] [CONFIG_MISSING] Razorpay credentials missing in backend environment.`
      );
      res.status(503).json({
        error: 'Razorpay Test credentials are not configured in backend (RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET missing).',
        code: 'CONFIG_MISSING',
        stage: 'CONFIG_VALIDATION',
        requestId,
      });
      return;
    }

    // 2. Validate Firebase Admin / Firestore Availability
    const { db, auth, isConfigured, initError } = getFirebaseAdmin();
    if (!isConfigured || !db) {
      console.error(
        `[createRazorpayOrder] [${requestId}] [DATABASE_UNAVAILABLE] Firebase Admin not configured. Cause: ${initError || 'FIREBASE_SERVICE_ACCOUNT_KEY missing'}`
      );
      res.status(503).json({
        error: 'Firebase database is not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY in Vercel environment variables.',
        code: 'DATABASE_UNAVAILABLE',
        stage: 'FIREBASE_INITIALIZATION',
        requestId,
      });
      return;
    }

    // 3. Parse and Validate Request Payload
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const {
      sourceId,
      destinationId,
      passengerCount = 1,
      ticketType = 'SINGLE',
    } = body;

    if (!sourceId || !destinationId) {
      console.warn(
        `[createRazorpayOrder] [${requestId}] [INVALID_REQUEST] Missing sourceId or destinationId.`
      );
      res.status(400).json({
        error: 'sourceId and destinationId are required.',
        code: 'INVALID_REQUEST',
        stage: 'REQUEST_VALIDATION',
        requestId,
      });
      return;
    }

    // 4. Decode optional passenger token
    let userId: string | null = null;
    let userEmail: string | null = null;
    const authHeader = req.headers.authorization;
    const headerStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;

    if (headerStr?.startsWith('Bearer ') && auth) {
      const idToken = headerStr.split('Bearer ')[1];
      try {
        const decoded = await auth.verifyIdToken(idToken);
        userId = decoded.uid;
        userEmail = decoded.email || null;
      } catch (tokenErr: any) {
        console.warn(
          `[createRazorpayOrder] [${requestId}] [AUTH_TOKEN] Token verification bypassed for guest: ${tokenErr?.message}`
        );
      }
    }

    // 5. Server-side fare and station validation (Never trust client-supplied fare)
    let validated;
    try {
      validated = validateAndCalculateFare(
        sourceId,
        destinationId,
        passengerCount,
        ticketType
      );
    } catch (fareErr: any) {
      console.error(
        `[createRazorpayOrder] [${requestId}] [FARE_CALCULATION] Validation failed: ${fareErr.message}`
      );
      res.status(400).json({
        error: fareErr.message || 'Invalid station or fare parameters.',
        code: 'INVALID_FARE_PARAMS',
        stage: 'FARE_CALCULATION',
        requestId,
      });
      return;
    }

    const bookingId = generateDemoBookingId();

    // 6. Create official order with Razorpay in TEST MODE
    let order;
    try {
      order = await createOrderOnRazorpay(
        validated.amountInPaise,
        bookingId,
        {
          bookingId,
          sourceId: validated.source.id,
          destinationId: validated.destination.id,
          passengerCount: String(validated.passengerCount),
          ticketType: validated.ticketType,
        }
      );
    } catch (rzpErr: any) {
      console.error(
        `[createRazorpayOrder] [${requestId}] [RAZORPAY_ORDER_CREATION] Failed: ${rzpErr.message} (code: ${rzpErr.code || 'UNKNOWN'}, status: ${rzpErr.statusCode || 500})`
      );
      res.status(rzpErr.statusCode === 401 ? 401 : 502).json({
        error: `Payment provider error: ${rzpErr.message}`,
        code: rzpErr.code || 'RAZORPAY_ORDER_FAILED',
        stage: 'RAZORPAY_ORDER_CREATION',
        requestId,
      });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // 7. Store pending booking in Firestore
    try {
      await db.collection('demo_bookings').doc(bookingId).set({
        bookingId,
        userId,
        userEmail,
        sourceId: validated.source.id,
        sourceName: validated.source.name,
        destinationId: validated.destination.id,
        destinationName: validated.destination.name,
        stationCount: validated.stationCount,
        passengerCount: validated.passengerCount,
        ticketType: validated.ticketType,
        baseFare: validated.baseFare,
        totalFare: validated.totalFare,
        amountInPaise: validated.amountInPaise,
        currency: 'INR',
        razorpayOrderId: order.id,
        status: 'PENDING',
        isDemo: true,
        disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: expiresAt.toISOString(),
      });
    } catch (dbErr: any) {
      console.error(
        `[createRazorpayOrder] [${requestId}] [FIRESTORE_WRITE] Booking write failed: ${dbErr.message}`
      );
      res.status(500).json({
        error: 'Failed to record booking in database.',
        code: 'DATABASE_WRITE_ERROR',
        stage: 'FIRESTORE_WRITE',
        requestId,
      });
      return;
    }

    // 8. Return ONLY public parameters to frontend
    res.status(200).json({
      success: true,
      bookingId,
      orderId: order.id,
      amount: validated.amountInPaise,
      currency: 'INR',
      keyId: config.keyId,
      fareInRupees: validated.totalFare,
      sourceName: validated.source.name,
      destinationName: validated.destination.name,
      passengerCount: validated.passengerCount,
      ticketType: validated.ticketType,
      requestId,
    });
  } catch (err: any) {
    console.error(`[createRazorpayOrder] [${requestId}] [UNHANDLED_EXCEPTION]`, err);
    res.status(500).json({
      error: err?.message || 'An unexpected server error occurred.',
      code: 'INTERNAL_SERVER_ERROR',
      stage: 'UNHANDLED_EXCEPTION',
      requestId,
    });
  }
}
