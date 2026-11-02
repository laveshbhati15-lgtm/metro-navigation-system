import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import { getRazorpayConfig } from './config.js';

let razorpayClient: Razorpay | null = null;

export function setRazorpayClientForTesting(client: any): void {
  razorpayClient = client;
}

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
  try {
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
  } catch (err: any) {
    const description =
      err?.error?.description ||
      err?.message ||
      'Failed to create order on Razorpay servers.';
    const code = err?.error?.code || 'RAZORPAY_API_ERROR';
    const statusCode = err?.statusCode || 502;
    const enhancedError: any = new Error(description);
    enhancedError.code = code;
    enhancedError.statusCode = statusCode;
    enhancedError.rawError = err?.error;
    throw enhancedError;
  }
}

/**
 * Validates Razorpay Standard Checkout payment signature using HMAC SHA256 with timing-safe comparison.
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
 * Validates webhook HMAC SHA256 signature against exact raw request payload.
 * Fails closed if secret is missing or signature is invalid.
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
  try {
    return await client.payments.fetch(paymentId);
  } catch (err: any) {
    const description =
      err?.error?.description ||
      err?.message ||
      'Failed to fetch payment from Razorpay servers.';
    const code = err?.error?.code || 'RAZORPAY_FETCH_ERROR';
    const statusCode = err?.statusCode || 502;
    const enhancedError: any = new Error(description);
    enhancedError.code = code;
    enhancedError.statusCode = statusCode;
    enhancedError.rawError = err?.error;
    throw enhancedError;
  }
}

export interface RazorpayQrResult {
  id: string;
  entity: string;
  name?: string;
  usage: string;
  type: string;
  image_url: string;
  payment_amount: number;
  status: string;
  description?: string;
  fixed_amount: boolean;
  payments_amount_received: number;
  payments_count_received: number;
  notes?: Record<string, string>;
  close_by?: number;
}

/**
 * Creates a single-use, fixed-amount Dynamic UPI QR code via Razorpay QR Codes API.
 */
export async function createDynamicUpiQr(
  amountInPaise: number,
  bookingId: string,
  notes: Record<string, string> = {},
  expiryMinutes: number = 15
): Promise<RazorpayQrResult> {
  const config = getRazorpayConfig();
  if (!config) {
    throw new Error(
      'Razorpay credentials are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
    );
  }

  // Fail-closed live guard: Dynamic QR in Live mode requires explicit enablement
  if (config.isLive && !config.liveQrEnabled) {
    const error: any = new Error(
      'Razorpay Dynamic UPI QR in LIVE mode is currently disabled. Set ENABLE_LIVE_DYNAMIC_QR=true after merchant activation.'
    );
    error.code = 'DYNAMIC_QR_LIVE_DISABLED';
    error.statusCode = 403;
    throw error;
  }

  const client = getRazorpayClient();
  // Validate expiry: clamp between 15 and 60 minutes
  const parsedExpiry = Number.isFinite(Number(expiryMinutes)) ? Math.floor(Number(expiryMinutes)) : 15;
  const safeExpiryMinutes = Math.min(Math.max(parsedExpiry, 15), 60);

  const nowUnix = Math.floor(Date.now() / 1000);
  const closeByUnix = nowUnix + safeExpiryMinutes * 60;

  try {
    const qrResponse: any = await (client as any).qrCode.create({
      type: 'upi_qr',
      usage: 'single_use',
      fixed_amount: true,
      payment_amount: amountInPaise,
      description: `DMRC Demo Transit Ticket (${bookingId})`,
      close_by: closeByUnix,
      // Protect bookingId: cannot be overwritten by incoming notes
      notes: {
        ...notes,
        bookingId,
      },
    });

    if (!qrResponse?.id || !qrResponse?.image_url) {
      throw new Error('Razorpay did not return a valid QR entity with ID and image URL.');
    }

    return {
      id: qrResponse.id,
      entity: qrResponse.entity || 'qr_code',
      name: qrResponse.name,
      usage: qrResponse.usage || 'single_use',
      type: qrResponse.type || 'upi_qr',
      image_url: qrResponse.image_url,
      payment_amount: Number(qrResponse.payment_amount || amountInPaise),
      status: qrResponse.status || 'active',
      description: qrResponse.description,
      fixed_amount: qrResponse.fixed_amount !== false,
      payments_amount_received: Number(qrResponse.payments_amount_received || 0),
      payments_count_received: Number(qrResponse.payments_count_received || 0),
      notes: qrResponse.notes,
      close_by: qrResponse.close_by || closeByUnix,
    };
  } catch (err: any) {
    const description =
      err?.error?.description ||
      err?.message ||
      'Failed to create Dynamic UPI QR on Razorpay servers.';
    const code = err?.error?.code || 'RAZORPAY_QR_CREATION_FAILED';
    const statusCode = err?.statusCode || 502;
    const enhancedError: any = new Error(description);
    enhancedError.code = code;
    enhancedError.statusCode = statusCode;
    enhancedError.rawError = err?.error;
    throw enhancedError;
  }
}

/**
 * Fetches dynamic QR code status and payment records from Razorpay QR Codes API.
 */
export async function fetchRazorpayQrCode(qrCodeId: string): Promise<any> {
  const client = getRazorpayClient();
  try {
    return await (client as any).qrCode.fetch(qrCodeId);
  } catch (err: any) {
    const description =
      err?.error?.description ||
      err?.message ||
      'Failed to fetch QR code from Razorpay servers.';
    const code = err?.error?.code || 'RAZORPAY_QR_FETCH_ERROR';
    const statusCode = err?.statusCode || 502;
    const enhancedError: any = new Error(description);
    enhancedError.code = code;
    enhancedError.statusCode = statusCode;
    enhancedError.rawError = err?.error;
    throw enhancedError;
  }
}

/**
 * Fetches all payments received against a QR code with pagination support.
 * Iterates through all pages using { count: 100, skip } until complete.
 */
export async function fetchAllPaymentsPaginated(qrCodeId: string): Promise<any[]> {
  const client = getRazorpayClient();
  const allPayments: any[] = [];
  let skip = 0;
  const pageSize = 100;
  let hasMore = true;

  try {
    while (hasMore) {
      const response: any = await (client as any).qrCode.fetchAllPayments(qrCodeId, {
        count: pageSize,
        skip,
      });

      const items = response?.items || [];
      allPayments.push(...items);

      const totalCount = Number(response?.count ?? items.length);
      if (items.length < pageSize || allPayments.length >= totalCount) {
        hasMore = false;
      } else {
        skip += pageSize;
      }
    }

    return allPayments;
  } catch (err: any) {
    const description =
      err?.error?.description ||
      err?.message ||
      'Failed to fetch payments for QR code from Razorpay servers.';
    const code = err?.error?.code || 'RAZORPAY_QR_PAYMENTS_FETCH_ERROR';
    const statusCode = err?.statusCode || 502;
    const enhancedError: any = new Error(description);
    enhancedError.code = code;
    enhancedError.statusCode = statusCode;
    enhancedError.rawError = err?.error;
    throw enhancedError;
  }
}

/**
 * Best-effort orphan QR cleanup when backend database operation fails after QR creation.
 * Logs sanitized information for audit/reconciliation without exposing secrets or tokens.
 */
export async function closeOrphanQrCode(qrCodeId: string, bookingId: string): Promise<void> {
  const client = getRazorpayClient();
  try {
    await (client as any).qrCode.close(qrCodeId);
  } catch (err: any) {
    console.error(
      JSON.stringify({
        event: 'ORPHAN_QR_CLEANUP_FAILED',
        qrCodeId,
        bookingId,
        error: err?.message || String(err),
      })
    );
  }
}
