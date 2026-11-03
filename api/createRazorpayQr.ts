import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { getRazorpayConfig } from './_lib/config.js';
import {
  getFirebaseAdmin,
  getFirebaseAuth,
  sanitizeFirestoreError,
  FieldValue,
} from './_lib/firebaseAdmin.js';
import { validateAndCalculateFare } from './_lib/fare.js';
import { createDynamicUpiQr, closeOrphanQrCode } from './_lib/razorpay.js';
import { handleCors } from './_lib/cors.js';
import { checkRateLimit } from './_lib/rateLimit.js';

function generateDemoBookingId(): string {
  const date = new Date();
  const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const uuid = crypto.randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase();
  return `DMRC-DEMO-${yearMonth}-${uuid}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = `req_qr_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

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

    // 2. Rate Limiting / Abuse Protection
    const rateLimit = checkRateLimit(req, 20, 60000);
    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', String(rateLimit.retryAfter || 60));
      res.status(429).json({
        error: 'Too many QR creation requests. Please wait a moment before trying again.',
        code: 'RATE_LIMIT_EXCEEDED',
        stage: 'RATE_LIMIT',
        requestId,
      });
      return;
    }

    // 3. Validate credentials
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
      console.error(`[createRazorpayQr] [${requestId}] [CONFIG_MISSING] Razorpay credentials missing in backend environment.`);
      res.status(503).json({
        error: 'Razorpay credentials are not configured in backend (RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET missing).',
        code: 'CONFIG_MISSING',
        stage: 'CONFIG_VALIDATION',
        requestId,
      });
      return;
    }

    // 3b. Mode-specific fail-closed protection
    if (config.isLive && !config.liveQrEnabled) {
      res.status(403).json({
        error: 'Razorpay Dynamic UPI QR in LIVE mode is currently disabled. Set ENABLE_LIVE_DYNAMIC_QR=true after merchant activation.',
        code: 'DYNAMIC_QR_LIVE_DISABLED',
        stage: 'LIVE_MODE_CHECK',
        requestId,
      });
      return;
    }

    // 4. Validate Firebase Admin / Firestore
    const { db, isConfigured, initError } = getFirebaseAdmin();
    if (!isConfigured || !db) {
      console.error(`[createRazorpayQr] [${requestId}] [DATABASE_UNAVAILABLE] Firebase Admin not configured: ${initError}`);
      res.status(503).json({
        error: 'Firebase database is not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY in Vercel environment variables.',
        code: 'DATABASE_UNAVAILABLE',
        stage: 'FIREBASE_INITIALIZATION',
        requestId,
      });
      return;
    }

    // 5. Parse request payload
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const {
      sourceId,
      destinationId,
      passengerCount = 1,
      ticketType = 'SINGLE',
      expiryMinutes = 15,
    } = body;

    if (!sourceId || !destinationId) {
      res.status(400).json({
        error: 'sourceId and destinationId are required.',
        code: 'INVALID_REQUEST',
        stage: 'REQUEST_VALIDATION',
        requestId,
      });
      return;
    }

    // 6. Strict Authentication Verification (No silent downgrade on malformed, empty, or invalid tokens)
    let userId: string | null = null;
    let userEmail: string | null = null;
    let guestAccessToken: string | null = null;
    let guestAccessHash: string | null = null;

    const authHeader = req.headers.authorization;
    const rawHeader = Array.isArray(authHeader) ? authHeader[0] : authHeader;

    if (rawHeader !== undefined) {
      // Authorization header is present: any empty, malformed, or invalid token must be rejected with HTTP 401
      if (typeof rawHeader !== 'string' || rawHeader.trim() === '') {
        res.status(401).json({
          error: 'Empty Authorization header provided.',
          code: 'AUTH_HEADER_EMPTY',
          stage: 'AUTH_VALIDATION',
          requestId,
        });
        return;
      }

      const trimmed = rawHeader.trim();
      if (!/^Bearer\s+/i.test(rawHeader.trimStart())) {
        res.status(401).json({
          error: 'Malformed Authorization header. Format must be "Bearer <idToken>".',
          code: 'AUTH_HEADER_MALFORMED',
          stage: 'AUTH_VALIDATION',
          requestId,
        });
        return;
      }

      const idToken = trimmed.replace(/^Bearer\s*/i, '').trim();
      if (!idToken) {
        res.status(401).json({
          error: 'Empty Bearer token provided.',
          code: 'AUTH_TOKEN_EMPTY',
          stage: 'AUTH_VALIDATION',
          requestId,
        });
        return;
      }

      const auth = await getFirebaseAuth();
      if (!auth) {
        res.status(503).json({
          error: 'Authentication service unavailable to verify identity token.',
          code: 'AUTH_SERVICE_UNAVAILABLE',
          stage: 'AUTH_VALIDATION',
          requestId,
        });
        return;
      }

      try {
        const decoded = await auth.verifyIdToken(idToken);
        userId = decoded.uid;
        userEmail = decoded.email || null;
      } catch (tokenErr: any) {
        console.warn(`[createRazorpayQr] [${requestId}] [AUTH_REJECTED] Invalid token: ${tokenErr?.message}`);
        res.status(401).json({
          error: 'Invalid or expired authentication token. Please sign in again.',
          code: 'AUTH_TOKEN_INVALID',
          stage: 'AUTH_VALIDATION',
          requestId,
        });
        return;
      }
    } else {
      // Guest booking: Authorization header is completely absent or empty
      guestAccessToken = crypto.randomBytes(32).toString('hex');
      guestAccessHash = crypto.createHash('sha256').update(guestAccessToken).digest('hex');
    }

    // 7. Server-side fare and station validation
    let validated;
    try {
      validated = validateAndCalculateFare(
        sourceId,
        destinationId,
        passengerCount,
        ticketType
      );
    } catch (fareErr: any) {
      res.status(400).json({
        error: fareErr.message || 'Invalid station or fare parameters.',
        code: 'INVALID_FARE_PARAMS',
        stage: 'FARE_CALCULATION',
        requestId,
      });
      return;
    }

    const bookingId = generateDemoBookingId();

    // 8. Create official Dynamic UPI QR on Razorpay
    let qrResult;
    try {
      qrResult = await createDynamicUpiQr(
        validated.amountInPaise,
        bookingId,
        {
          sourceId: validated.source.id,
          destinationId: validated.destination.id,
          passengerCount: String(validated.passengerCount),
          ticketType: validated.ticketType,
        },
        expiryMinutes
      );
    } catch (qrErr: any) {
      console.error(
        `[createRazorpayQr] [${requestId}] [RAZORPAY_QR_FAILED] Failed: ${qrErr.message} (code: ${qrErr.code || 'UNKNOWN'})`
      );
      res.status(qrErr.statusCode || 502).json({
        error: `Payment provider error: ${qrErr.message}`,
        code: qrErr.code || 'RAZORPAY_QR_FAILED',
        stage: 'RAZORPAY_QR_CREATION',
        requestId,
      });
      return;
    }

    const now = new Date();
    const qrExpiresAt = new Date((qrResult.close_by || (Math.floor(now.getTime() / 1000) + 15 * 60)) * 1000);
    const bookingExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // 9. Store pending UPI QR booking in Firestore
    try {
      await db.collection('demo_bookings').doc(bookingId).set({
        bookingId,
        userId,
        userEmail,
        guestAccessHash,
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
        paymentMethod: 'UPI_QR',
        razorpayQrId: qrResult.id,
        qrImageUrl: qrResult.image_url,
        qrStatus: qrResult.status,
        qrCloseBy: qrResult.close_by,
        qrExpiresAt: qrExpiresAt.toISOString(),
        status: 'PENDING',
        isDemo: true,
        disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: bookingExpiresAt.toISOString(),
      });
    } catch (dbErr: any) {
      // Best-effort cleanup of orphaned QR code on Razorpay
      await closeOrphanQrCode(qrResult.id, bookingId);

      const sanitized = sanitizeFirestoreError(dbErr);
      console.error(`[createRazorpayQr] [${requestId}] [FIRESTORE_WRITE] [${sanitized.code}] ${sanitized.message}`);
      res.status(500).json({
        error: 'Failed to record QR booking in database.',
        code: 'DATABASE_WRITE_ERROR',
        stage: 'FIRESTORE_WRITE',
        firestoreErrorCode: sanitized.code,
        firestoreErrorMessage: sanitized.message,
        requestId,
      });
      return;
    }

    // 10. Return safe response (guestAccessToken included only for guest creation)
    res.status(200).json({
      success: true,
      bookingId,
      qrId: qrResult.id,
      qrImageUrl: qrResult.image_url,
      amount: validated.amountInPaise,
      currency: 'INR',
      fareInRupees: validated.totalFare,
      sourceName: validated.source.name,
      destinationName: validated.destination.name,
      passengerCount: validated.passengerCount,
      ticketType: validated.ticketType,
      expiresAt: qrExpiresAt.toISOString(),
      closeByUnix: qrResult.close_by,
      paymentMethod: 'UPI_QR',
      paymentMode: config.paymentMode,
      guestAccessToken: guestAccessToken || undefined,
      disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
      requestId,
    });
  } catch (err: any) {
    console.error(`[createRazorpayQr] [${requestId}] [UNHANDLED_EXCEPTION]`, err);
    res.status(500).json({
      error: err?.message || 'An unexpected server error occurred.',
      code: 'INTERNAL_SERVER_ERROR',
      stage: 'UNHANDLED_EXCEPTION',
      requestId,
    });
  }
}
