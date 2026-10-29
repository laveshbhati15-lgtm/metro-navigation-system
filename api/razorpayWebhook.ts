import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin, FieldValue } from './_lib/firebaseAdmin.js';
import { verifyWebhookSignature } from './_lib/razorpay.js';

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

  const rawHeader = req.headers['x-razorpay-signature'];
  const signature = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

  if (!signature) {
    res.status(400).json({ error: 'Missing X-Razorpay-Signature header.' });
    return;
  }

  let rawBodyBuffer: Buffer;
  try {
    rawBodyBuffer = await getRawBody(req);
  } catch (_err: any) {
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
            await db.runTransaction(async (transaction: any) => {
              const freshSnap = await transaction.get(doc.ref);
              if (!freshSnap.exists) return;
              const booking = freshSnap.data() as any;

              // Idempotency: skip if already PAID
              if (booking.status === 'PAID') {
                console.log(`Webhook: Booking ${booking.bookingId} already marked PAID`);
                return;
              }

              if (amount && Number(amount) !== Number(booking.amountInPaise)) {
                console.error(
                  `Amount mismatch in webhook for order ${orderId}: expected ${booking.amountInPaise}, got ${amount}`
                );
                throw new Error('AMOUNT_MISMATCH');
              }

              const expectedCurrency = (booking.currency || 'INR').toUpperCase();
              if (currency && currency.toUpperCase() !== expectedCurrency) {
                console.error(
                  `Currency mismatch in webhook for order ${orderId}: expected ${expectedCurrency}, got ${currency}`
                );
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
