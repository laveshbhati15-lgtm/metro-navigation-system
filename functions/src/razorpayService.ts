import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import { getRazorpayConfig } from './config';

let razorpayClient: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
  const config = getRazorpayConfig();
  if (!config) {
    throw new Error(
      'Razorpay credentials are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
    );
  }

  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: config.keyId,
      key_secret: config.keySecret,
    });
  }
  return razorpayClient;
}

export interface RazorpayOrderResult {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
}

/**
 * Creates an order on Razorpay servers in TEST MODE.
 */
export async function createOrderOnRazorpay(
  amountInPaise: number,
  receipt: string,
  notes: Record<string, string> = {}
): Promise<RazorpayOrderResult> {
  const client = getRazorpayClient();
  const order = await client.orders.create({
    amount: amountInPaise,
    currency: 'INR',
    receipt,
    notes,
  });

  return {
    id: order.id,
    amount: Number(order.amount),
    currency: order.currency,
    receipt: String(order.receipt || receipt),
  };
}

/**
 * Validates Razorpay Standard Checkout payment signature using HMAC SHA256.
 * Formula: HMAC_SHA256(order_id + "|" + razorpay_payment_id, secret)
 */
export function verifySignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  const config = getRazorpayConfig();
  if (!config) return false;

  try {
    const text = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', config.keySecret)
      .update(text)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const providedBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  } catch (error) {
    console.error('Error during payment signature verification:', error);
    return false;
  }
}

/**
 * Validates webhook HMAC SHA256 signature against raw request payload.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signature: string,
  secretOverride?: string
): boolean {
  const config = getRazorpayConfig();
  const secret = secretOverride || config?.webhookSecret;
  if (!secret) return false;

  try {
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(bodyStr)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const providedBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  } catch (error) {
    console.error('Error during webhook signature verification:', error);
    return false;
  }
}

/**
 * Fetches real payment record from Razorpay API to verify status and amount.
 */
export async function fetchRazorpayPayment(paymentId: string): Promise<any> {
  const client = getRazorpayClient();
  return client.payments.fetch(paymentId);
}
