import type { IncomingMessage, ServerResponse } from 'http';
import { getRazorpayConfig } from './_lib/config';
import { getFirebaseAdmin, FieldValue } from './_lib/firebaseAdmin';
import { verifyWebhookSignature } from './_lib/razorpay';

interface ExtendedRequest extends IncomingMessage {
  body?: any;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ExtendedResponse extends ServerResponse {
  status: (code: number) => ExtendedResponse;
  json: (data: any) => void;
  setHeader: (name: string, value: string | number | readonly string[]) => this;
}

// Disable automatic body parser so we can verify exact HMAC signature on raw body bytes
export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req: ExtendedRequest): Promise<Buffer> {
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

export default async function handler(req: ExtendedRequest, res: ExtendedResponse) {
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
  } catch (err: any) {
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

      if (orderId) {
        const snapshot = await db
          .collection('demo_bookings')
          .where('razorpayOrderId', '==', orderId)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const booking = doc.data() as any;

          // Idempotency: skip if already PAID
          if (booking.status !== 'PAID') {
            if (amount && Number(amount) !== Number(booking.amountInPaise)) {
              console.error(
                `Amount mismatch in webhook for order ${orderId}: expected ${booking.amountInPaise}, got ${amount}`
              );
              res.status(400).json({ error: 'Amount mismatch' });
              return;
            }

            await doc.ref.update({
              status: 'PAID',
              razorpayPaymentId: paymentId || booking.razorpayPaymentId || null,
              paidAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            console.log(`Webhook marked booking ${booking.bookingId} as PAID`);
          }
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
          await doc.ref.update({
            status: 'FAILED',
            failureReason: paymentEntity?.error_description || 'Payment failed',
            updatedAt: FieldValue.serverTimestamp(),
          });
          console.log(`Webhook marked booking ${doc.id} as FAILED`);
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: 'Internal webhook error.' });
  }
}
