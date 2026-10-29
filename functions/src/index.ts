import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import cors from 'cors';
import {
  getRazorpayConfig,
  razorpayKeyIdSecret,
  razorpayKeySecretSecret,
  razorpayWebhookSecretSecret,
} from './config';
import { validateAndCalculateFare } from './fare';
import {
  createOrderOnRazorpay,
  verifySignature,
  verifyWebhookSignature,
  fetchRazorpayPayment,
} from './razorpayService';

// Initialize Firebase Admin SDK
if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();
const corsHandler = cors({ origin: true });

function generateDemoBookingId(): string {
  const date = new Date();
  const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const randomChars = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `DMRC-DEMO-${yearMonth}-${randomChars}`;
}

/**
 * 1. Create Razorpay Test Order
 * Validates stations, calculates official fare on server, registers order in Razorpay,
 * and records pending booking in Cloud Firestore.
 */
export const createRazorpayOrder = onRequest(
  {
    secrets: [razorpayKeyIdSecret, razorpayKeySecretSecret],
    cors: true,
  },
  async (req, res) => {
    corsHandler(req, res, async () => {
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

        const {
          sourceId,
          destinationId,
          passengerCount = 1,
          ticketType = 'SINGLE',
        } = req.body;

        if (!sourceId || !destinationId) {
          res.status(400).json({ error: 'sourceId and destinationId are required.' });
          return;
        }

        // Decode optional user auth token
        let userId: string | null = null;
        let userEmail: string | null = null;
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
          const idToken = authHeader.split('Bearer ')[1];
          try {
            const decoded = await getAuth().verifyIdToken(idToken);
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
    });
  }
);

/**
 * 2. Verify Razorpay Payment Signature
 * Retrieves expected order ID from Firestore, cryptographically verifies HMAC SHA-256 signature,
 * validates actual payment status with Razorpay API, and transitions booking to PAID.
 */
export const verifyRazorpayPayment = onRequest(
  {
    secrets: [razorpayKeyIdSecret, razorpayKeySecretSecret],
    cors: true,
  },
  async (req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed. Use POST.' });
        return;
      }

      try {
        const { bookingId, razorpayPaymentId, razorpaySignature } = req.body;

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

        // Verify cryptographic HMAC SHA256 signature
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

          const expectedCurrency = (booking.currency || 'INR').toUpperCase();
          if (payment.currency && payment.currency.toUpperCase() !== expectedCurrency) {
            res.status(400).json({
              error: 'Paid currency does not match booking currency.',
              code: 'CURRENCY_MISMATCH',
            });
            return;
          }

          if (payment.status !== 'captured') {
            const isAuthorized = payment.status === 'authorized';
            res.status(400).json({
              error: isAuthorized
                ? 'Payment is authorized but not yet captured. Ticket will be issued upon capture confirmation.'
                : `Payment is not in successful state (status: ${payment.status}).`,
              code: isAuthorized ? 'PAYMENT_AUTHORIZED_PENDING_CAPTURE' : 'PAYMENT_NOT_CAPTURED',
            });
            return;
          }
        } catch (fetchErr: any) {
          if (fetchErr?.statusCode === 400 || fetchErr?.statusCode === 404 || fetchErr?.code === 'BAD_REQUEST_ERROR') {
            res.status(400).json({
              error: 'Payment record could not be found or validated with provider.',
              code: 'PAYMENT_NOT_FOUND',
            });
            return;
          }
          console.error('Razorpay API verification failed (unreachable/error):', fetchErr.message);
          res.status(502).json({
            error: 'Payment provider verification service temporarily unavailable. Please retry verification.',
            code: 'PROVIDER_UNAVAILABLE',
          });
          return;
        }

        // Generate verified ticket QR payload
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

        // Update Firestore booking record atomically inside a transaction
        let currentBookingData = {
          ...booking,
          status: 'PAID',
          razorpayPaymentId,
          razorpaySignature,
          qrPayload,
          paidAt: now.toISOString(),
        };

        await db.runTransaction(async (transaction) => {
          const freshSnap = await transaction.get(docRef);
          if (!freshSnap.exists) {
            throw new Error('BOOKING_NOT_FOUND');
          }
          const freshData = freshSnap.data() as any;
          if (freshData.status === 'PAID') {
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

        res.status(200).json({
          success: true,
          status: 'PAID',
          bookingId: currentBookingData.bookingId,
          ticket: formatVerifiedTicket(currentBookingData),
        });
      } catch (err: any) {
        console.error('Error verifying Razorpay payment:', err);
        res.status(500).json({
          error: err.message || 'Payment verification failed.',
        });
      }
    });
  }
);

/**
 * 3. Razorpay Server-to-Server Webhook
 * Processes asynchronous events (payment.captured, order.paid, payment.failed) with raw body HMAC verification.
 */
export const razorpayWebhook = onRequest(
  {
    secrets: [razorpayWebhookSecretSecret],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const signature = req.headers['x-razorpay-signature'] as string;
    if (!signature) {
      res.status(400).json({ error: 'Missing X-Razorpay-Signature header.' });
      return;
    }

    // Verify webhook signature against raw payload
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const isValid = verifyWebhookSignature(rawBody, signature);

    if (!isValid) {
      console.warn('SECURITY ALERT: Invalid Razorpay webhook signature');
      res.status(400).json({ error: 'Invalid webhook signature.' });
      return;
    }

    try {
      const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const eventType = event.event;

      if (eventType === 'payment.captured' || eventType === 'order.paid') {
        const paymentEntity = event.payload?.payment?.entity;
        const orderId = paymentEntity?.order_id || event.payload?.order?.entity?.id;
        const paymentId = paymentEntity?.id;
        const amount = paymentEntity?.amount;
        const currency = paymentEntity?.currency;

        if (orderId) {
          const snapshot = await db
            .collection('demo_bookings')
            .where('razorpayOrderId', '==', orderId)
            .limit(1)
            .get();

          if (!snapshot.empty) {
            const doc = snapshot.docs[0];

            try {
              await db.runTransaction(async (transaction) => {
                const freshSnap = await transaction.get(doc.ref);
                if (!freshSnap.exists) return;
                const booking = freshSnap.data() as any;

                // Idempotency: skip if already PAID
                if (booking.status === 'PAID') {
                  console.log(`Webhook: Booking ${booking.bookingId} already marked PAID`);
                  return;
                }

                if (amount && Number(amount) !== Number(booking.amountInPaise)) {
                  console.error(`Amount mismatch in webhook for order ${orderId}: expected ${booking.amountInPaise}, got ${amount}`);
                  throw new Error('AMOUNT_MISMATCH');
                }

                const expectedCurrency = (booking.currency || 'INR').toUpperCase();
                if (currency && currency.toUpperCase() !== expectedCurrency) {
                  console.error(`Currency mismatch in webhook for order ${orderId}: expected ${expectedCurrency}, got ${currency}`);
                  throw new Error('CURRENCY_MISMATCH');
                }

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
                  razorpayPaymentId: paymentId || booking.razorpayPaymentId || null,
                  verifiedAt: now.toISOString(),
                });

                transaction.update(doc.ref, {
                  status: 'PAID',
                  razorpayPaymentId: paymentId || booking.razorpayPaymentId || null,
                  paidAt: FieldValue.serverTimestamp(),
                  updatedAt: FieldValue.serverTimestamp(),
                  qrPayload,
                });
                console.log(`Webhook marked booking ${booking.bookingId} as PAID`);
              });
            } catch (txErr: any) {
              if (txErr?.message === 'AMOUNT_MISMATCH') {
                res.status(400).json({ error: 'Amount mismatch' });
                return;
              }
              if (txErr?.message === 'CURRENCY_MISMATCH') {
                res.status(400).json({ error: 'Currency mismatch' });
                return;
              }
              throw txErr;
            }
          }
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
            await db.runTransaction(async (transaction) => {
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
            await db.runTransaction(async (transaction) => {
              const freshSnap = await transaction.get(doc.ref);
              if (!freshSnap.exists) return;
              const booking = freshSnap.data() as any;
              // Protect already confirmed PAID tickets from being overwritten by a delayed failure event
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
);

function formatVerifiedTicket(booking: any) {
  const qrPayload =
    booking.qrPayload ||
    JSON.stringify({
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
      razorpayPaymentId: booking.razorpayPaymentId || null,
      verifiedAt: new Date().toISOString(),
    });

  return {
    id: booking.bookingId,
    createdAt: typeof booking.createdAt === 'string' ? booking.createdAt : new Date().toISOString(),
    expiresAt: booking.expiresAt || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    source: { id: booking.sourceId, name: booking.sourceName },
    destination: { id: booking.destinationId, name: booking.destinationName },
    passengerCount: booking.passengerCount,
    ticketType: booking.ticketType,
    baseFare: booking.baseFare,
    totalFare: booking.totalFare,
    status: 'ACTIVE',
    paymentStatus: 'PAID',
    isDemo: true,
    disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
    razorpayOrderId: booking.razorpayOrderId,
    razorpayPaymentId: booking.razorpayPaymentId,
    qrPayload,
  };
}
