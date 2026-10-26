import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRazorpayConfig } from './_lib/config.js';
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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

    const { db, auth, isConfigured } = getFirebaseAdmin();
    if (!isConfigured || !db) {
      res.status(503).json({
        error: 'Firebase database is not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY.',
        code: 'DATABASE_UNAVAILABLE',
      });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const {
      sourceId,
      destinationId,
      passengerCount = 1,
      ticketType = 'SINGLE',
    } = body;

    if (!sourceId || !destinationId) {
      res.status(400).json({ error: 'sourceId and destinationId are required.' });
      return;
    }

    // Decode optional passenger token
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
      } catch {
        // Proceed as guest demo booking if token is invalid or expired
      }
    }

    // Server-side fare and station validation (Never trust client-supplied fare)
    const validated = validateAndCalculateFare(
      sourceId,
      destinationId,
      passengerCount,
      ticketType
    );

    const bookingId = generateDemoBookingId();

    // Create official order with Razorpay in TEST MODE
    const order = await createOrderOnRazorpay(
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

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Store pending booking in Firestore
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

    // Return ONLY public parameters to frontend
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
    });
  } catch (err: any) {
    console.error('Error creating Razorpay order:', err);
    res.status(500).json({
      error: err.message || 'Failed to create payment order.',
    });
  }
}
