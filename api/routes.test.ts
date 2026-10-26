import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as crypto from 'crypto';
import createOrderHandler from './createRazorpayOrder';
import verifyPaymentHandler from './verifyRazorpayPayment';
import webhookHandler from './razorpayWebhook';

const TEST_KEY_ID = 'rzp_test_mock1234567890';
const TEST_KEY_SECRET = 'mockSecretKey9876543210';
const TEST_WEBHOOK_SECRET = 'mockWebhookSecret11223344';

// In-memory Firestore store for test isolation
const bookingsStore = new Map<string, any>();

// Mock Firebase Admin
vi.mock('./_lib/firebaseAdmin', () => {
  const mockDb = {
    collection: (colName: string) => {
      if (colName !== 'demo_bookings') {
        throw new Error(`Unexpected collection: ${colName}`);
      }
      return {
        doc: (docId: string) => ({
          set: async (data: any) => {
            bookingsStore.set(docId, { ...data });
          },
          get: async () => {
            const data = bookingsStore.get(docId);
            return {
              exists: !!data,
              data: () => (data ? { ...data } : undefined),
            };
          },
          update: async (updates: any) => {
            const existing = bookingsStore.get(docId);
            if (!existing) throw new Error('Document not found');
            bookingsStore.set(docId, { ...existing, ...updates });
          },
        }),
        where: (field: string, op: string, value: any) => ({
          limit: (_n: number) => ({
            get: async () => {
              const matched: any[] = [];
              for (const [id, data] of bookingsStore.entries()) {
                if (data[field] === value) {
                  matched.push({
                    id,
                    data: () => ({ ...data }),
                    ref: {
                      update: async (updates: any) => {
                        bookingsStore.set(id, { ...data, ...updates });
                      },
                    },
                  });
                }
              }
              return {
                empty: matched.length === 0,
                docs: matched,
              };
            },
          }),
        }),
      };
    },
  };

  const mockAuth = {
    verifyIdToken: async (token: string) => {
      if (token === 'valid-user-token') {
        return { uid: 'user_123', email: 'commuter@example.com' };
      }
      throw new Error('Invalid Firebase ID token');
    },
  };

  return {
    getFirebaseAdmin: () => ({
      db: mockDb,
      auth: mockAuth,
      isConfigured: true,
    }),
    FieldValue: {
      serverTimestamp: () => 'MOCK_SERVER_TIMESTAMP',
    },
  };
});

// Mock Razorpay API Client
vi.mock('./_lib/razorpay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_lib/razorpay')>();
  return {
    ...actual,
    createOrderOnRazorpay: vi.fn(async (amountInPaise: number, receipt: string) => ({
      id: `order_${Math.random().toString(36).substring(2, 10)}`,
      amount: amountInPaise,
      currency: 'INR',
      receipt,
    })),
    fetchRazorpayPayment: vi.fn(async (paymentId: string) => {
      if (paymentId === 'pay_mismatch_order') {
        return {
          id: paymentId,
          order_id: 'order_DIFFERENT',
          amount: 4000,
          status: 'captured',
        };
      }
      if (paymentId === 'pay_mismatch_amount') {
        return {
          id: paymentId,
          order_id: 'order_test_valid',
          amount: 1000, // Expected 4000
          status: 'captured',
        };
      }
      if (paymentId === 'pay_failed_status') {
        return {
          id: paymentId,
          order_id: 'order_test_valid',
          amount: 4000,
          status: 'failed',
        };
      }
      return {
        id: paymentId,
        order_id: 'order_test_valid',
        amount: 4000,
        status: 'captured',
      };
    }),
  };
});

function createMockReqRes({
  method = 'POST',
  headers = {},
  body = {},
}: {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}) {
  const req: any = {
    method,
    headers: { ...headers },
    body,
  };

  let statusCode = 200;
  const responseHeaders: Record<string, string> = {};
  let responseData: any = null;
  let ended = false;

  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    setHeader(name: string, value: string) {
      responseHeaders[name.toLowerCase()] = value;
      return res;
    },
    json(data: any) {
      responseData = data;
      ended = true;
    },
    end() {
      ended = true;
    },
  };

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getResponseData: () => responseData,
    getResponseHeaders: () => responseHeaders,
    isEnded: () => ended,
  };
}

describe('Vercel API Routes: createRazorpayOrder', () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = TEST_KEY_ID;
    process.env.RAZORPAY_KEY_SECRET = TEST_KEY_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    bookingsStore.clear();
  });

  afterEach(() => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  it('rejects non-POST requests with 405 Method Not Allowed', async () => {
    const { req, res, getStatusCode, getResponseData } = createMockReqRes({
      method: 'GET',
    });

    await createOrderHandler(req, res);
    expect(getStatusCode()).toBe(405);
    expect(getResponseData().error).toContain('Method not allowed');
  });

  it('handles CORS OPTIONS preflight request with 204 No Content', async () => {
    const { req, res, getStatusCode, getResponseHeaders } = createMockReqRes({
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173' },
    });

    await createOrderHandler(req, res);
    expect(getStatusCode()).toBe(204);
    expect(getResponseHeaders()['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('rejects requests missing source or destination station IDs', async () => {
    const { req, res, getStatusCode, getResponseData } = createMockReqRes({
      method: 'POST',
      body: { sourceId: 'RAJIV_CHOWK' },
    });

    await createOrderHandler(req, res);
    expect(getStatusCode()).toBe(400);
    expect(getResponseData().error).toContain('sourceId and destinationId are required');
  });

  it('creates an order with server-calculated fare and stores pending booking for guest user', async () => {
    const { req, res, getStatusCode, getResponseData } = createMockReqRes({
      method: 'POST',
      body: {
        sourceId: 'RAJIV_CHOWK',
        destinationId: 'HAUZ_KHAS',
        passengerCount: 1,
        ticketType: 'SINGLE',
        // Client attempts to pass a tampered amount - server MUST ignore it
        amount: 1,
        totalFare: 1,
      },
    });

    await createOrderHandler(req, res);
    expect(getStatusCode()).toBe(200);

    const data = getResponseData();
    expect(data.success).toBe(true);
    expect(data.fareInRupees).toBe(40); // 10 stations = ₹40 official slab
    expect(data.amount).toBe(4000); // 4000 paise
    expect(data.keyId).toBe(TEST_KEY_ID);
    expect(data.bookingId).toMatch(/^DMRC-DEMO-/);
    expect(data.orderId).toBeDefined();

    // Verify stored booking in Firestore
    const stored = bookingsStore.get(data.bookingId);
    expect(stored).toBeDefined();
    expect(stored.userId).toBeNull();
    expect(stored.userEmail).toBeNull();
    expect(stored.status).toBe('PENDING');
    expect(stored.amountInPaise).toBe(4000);
    expect(stored.disclaimer).toBe('DEMO — NOT VALID FOR METRO TRAVEL');
  });

  it('associates authenticated user ID and email when valid Authorization token is provided', async () => {
    const { req, res, getStatusCode, getResponseData } = createMockReqRes({
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-user-token',
      },
      body: {
        sourceId: 'RAJIV_CHOWK',
        destinationId: 'CENTRAL_SECRETARIAT',
        passengerCount: 2,
        ticketType: 'RETURN',
      },
    });

    await createOrderHandler(req, res);
    expect(getStatusCode()).toBe(200);

    const data = getResponseData();
    const stored = bookingsStore.get(data.bookingId);
    expect(stored).toBeDefined();
    expect(stored.userId).toBe('user_123');
    expect(stored.userEmail).toBe('commuter@example.com');
    expect(stored.ticketType).toBe('RETURN');
    expect(stored.passengerCount).toBe(2);
  });

  it('proceeds cleanly as guest booking if authorization token is invalid or expired', async () => {
    const { req, res, getStatusCode, getResponseData } = createMockReqRes({
      method: 'POST',
      headers: {
        authorization: 'Bearer invalid-expired-token',
      },
      body: {
        sourceId: 'RAJIV_CHOWK',
        destinationId: 'HAUZ_KHAS',
        passengerCount: 1,
      },
    });

    await createOrderHandler(req, res);
    expect(getStatusCode()).toBe(200);

    const data = getResponseData();
    const stored = bookingsStore.get(data.bookingId);
    expect(stored).toBeDefined();
    expect(stored.userId).toBeNull();
    expect(stored.userEmail).toBeNull();
  });
});

describe('Vercel API Routes: verifyRazorpayPayment', () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = TEST_KEY_ID;
    process.env.RAZORPAY_KEY_SECRET = TEST_KEY_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    bookingsStore.clear();
  });

  afterEach(() => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  it('rejects missing parameters with 400', async () => {
    const { req, res, getStatusCode, getResponseData } = createMockReqRes({
      method: 'POST',
      body: { bookingId: 'DMRC-123' },
    });

    await verifyPaymentHandler(req, res);
    expect(getStatusCode()).toBe(400);
    expect(getResponseData().error).toContain('required');
  });

  it('returns 404 when booking does not exist in Firestore', async () => {
    const { req, res, getStatusCode, getResponseData } = createMockReqRes({
      method: 'POST',
      body: {
        bookingId: 'NON_EXISTENT_BOOKING',
        razorpayPaymentId: 'pay_123',
        razorpaySignature: 'sig_123',
      },
    });

    await verifyPaymentHandler(req, res);
    expect(getStatusCode()).toBe(404);
    expect(getResponseData().error).toContain('not found');
  });

  it('rejects invalid or tampered payment signature with 400 SIGNATURE_MISMATCH', async () => {
    const bookingId = 'DMRC-DEMO-TEST-001';
    bookingsStore.set(bookingId, {
      bookingId,
      razorpayOrderId: 'order_test_valid',
      amountInPaise: 4000,
      totalFare: 40,
      status: 'PENDING',
      sourceId: 'RAJIV_CHOWK',
      sourceName: 'Rajiv Chowk',
      destinationId: 'HAUZ_KHAS',
      destinationName: 'Hauz Khas',
      passengerCount: 1,
      ticketType: 'SINGLE',
    });

    const { req, res, getStatusCode, getResponseData } = createMockReqRes({
      method: 'POST',
      body: {
        bookingId,
        razorpayPaymentId: 'pay_test_999',
        razorpaySignature: '0000000000000000000000000000000000000000000000000000000000000000',
      },
    });

    await verifyPaymentHandler(req, res);
    expect(getStatusCode()).toBe(400);
    expect(getResponseData().code).toBe('SIGNATURE_MISMATCH');

    // Document in Firestore must remain PENDING
    expect(bookingsStore.get(bookingId).status).toBe('PENDING');
  });

  it('verifies genuine payment signature, marks booking PAID, and includes demo disclaimer on ticket and QR', async () => {
    const bookingId = 'DMRC-DEMO-TEST-002';
    const orderId = 'order_test_valid';
    const paymentId = 'pay_test_999';

    bookingsStore.set(bookingId, {
      bookingId,
      razorpayOrderId: orderId,
      amountInPaise: 4000,
      baseFare: 40,
      totalFare: 40,
      status: 'PENDING',
      sourceId: 'RAJIV_CHOWK',
      sourceName: 'Rajiv Chowk',
      destinationId: 'HAUZ_KHAS',
      destinationName: 'Hauz Khas',
      passengerCount: 1,
      ticketType: 'SINGLE',
    });

    // Generate valid HMAC SHA256 signature
    const validSignature = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const { req, res, getStatusCode, getResponseData } = createMockReqRes({
      method: 'POST',
      body: {
        bookingId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSignature,
      },
    });

    await verifyPaymentHandler(req, res);
    expect(getStatusCode()).toBe(200);

    const data = getResponseData();
    expect(data.success).toBe(true);
    expect(data.status).toBe('PAID');
    expect(data.ticket).toBeDefined();
    expect(data.ticket.disclaimer).toBe('DEMO — NOT VALID FOR METRO TRAVEL');
    expect(data.ticket.isDemo).toBe(true);
    expect(data.ticket.qrPayload).toContain('DEMO — NOT VALID FOR METRO TRAVEL');

    // Firestore record updated to PAID
    const updated = bookingsStore.get(bookingId);
    expect(updated.status).toBe('PAID');
    expect(updated.razorpayPaymentId).toBe(paymentId);
  });

  it('handles duplicate verification idempotently without re-processing', async () => {
    const bookingId = 'DMRC-DEMO-TEST-003';
    bookingsStore.set(bookingId, {
      bookingId,
      razorpayOrderId: 'order_test_valid',
      amountInPaise: 4000,
      totalFare: 40,
      status: 'PAID', // Already PAID
      razorpayPaymentId: 'pay_already_processed',
      sourceId: 'RAJIV_CHOWK',
      sourceName: 'Rajiv Chowk',
      destinationId: 'HAUZ_KHAS',
      destinationName: 'Hauz Khas',
      passengerCount: 1,
      ticketType: 'SINGLE',
      disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
      qrPayload: '{"type":"DEMO_TICKET","disclaimer":"DEMO — NOT VALID FOR METRO TRAVEL"}',
    });

    const { req, res, getStatusCode, getResponseData } = createMockReqRes({
      method: 'POST',
      body: {
        bookingId,
        razorpayPaymentId: 'pay_already_processed',
        razorpaySignature: 'any_signature',
      },
    });

    await verifyPaymentHandler(req, res);
    expect(getStatusCode()).toBe(200);

    const data = getResponseData();
    expect(data.success).toBe(true);
    expect(data.status).toBe('PAID');
    expect(data.message).toContain('already verified');
    expect(data.ticket.disclaimer).toBe('DEMO — NOT VALID FOR METRO TRAVEL');
  });
});

describe('Vercel API Routes: razorpayWebhook', () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = TEST_KEY_ID;
    process.env.RAZORPAY_KEY_SECRET = TEST_KEY_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    bookingsStore.clear();
  });

  afterEach(() => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  it('rejects webhook requests without signature header with 400', async () => {
    const { req, res, getStatusCode, getResponseData } = createMockReqRes({
      method: 'POST',
      body: { event: 'payment.captured' },
    });

    await webhookHandler(req, res);
    expect(getStatusCode()).toBe(400);
    expect(getResponseData().error).toContain('Missing X-Razorpay-Signature');
  });

  it('rejects webhook requests with invalid signature', async () => {
    const payload = JSON.stringify({ event: 'payment.captured' });
    const { req, res, getStatusCode, getResponseData } = createMockReqRes({
      method: 'POST',
      headers: {
        'x-razorpay-signature': 'invalid_signature_hex_12345678',
      },
      body: Buffer.from(payload, 'utf8'),
    });

    await webhookHandler(req, res);
    expect(getStatusCode()).toBe(400);
    expect(getResponseData().error).toContain('Invalid webhook signature');
  });

  it('processes payment.captured event and marks booking PAID idempotently', async () => {
    const bookingId = 'DMRC-DEMO-TEST-WEBHOOK';
    const orderId = 'order_webhook_123';

    bookingsStore.set(bookingId, {
      bookingId,
      razorpayOrderId: orderId,
      amountInPaise: 5000,
      status: 'PENDING',
    });

    const eventPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_webhook_999',
            order_id: orderId,
            amount: 5000,
            status: 'captured',
          },
        },
      },
    };

    const rawBody = JSON.stringify(eventPayload);
    const validSignature = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    const { req, res, getStatusCode, getResponseData } = createMockReqRes({
      method: 'POST',
      headers: {
        'x-razorpay-signature': validSignature,
      },
      body: Buffer.from(rawBody, 'utf8'),
    });

    await webhookHandler(req, res);
    expect(getStatusCode()).toBe(200);
    expect(getResponseData().received).toBe(true);

    const updated = bookingsStore.get(bookingId);
    expect(updated.status).toBe('PAID');
    expect(updated.razorpayPaymentId).toBe('pay_webhook_999');

    // Test duplicate webhook event (idempotency)
    const { req: dupReq, res: dupRes, getStatusCode: getDupStatus } = createMockReqRes({
      method: 'POST',
      headers: {
        'x-razorpay-signature': validSignature,
      },
      body: Buffer.from(rawBody, 'utf8'),
    });

    await webhookHandler(dupReq, dupRes);
    expect(getDupStatus()).toBe(200);
    expect(bookingsStore.get(bookingId).status).toBe('PAID');
  });

  it('processes payment.failed event and marks booking FAILED', async () => {
    const bookingId = 'DMRC-DEMO-TEST-FAILED';
    const orderId = 'order_failed_123';

    bookingsStore.set(bookingId, {
      bookingId,
      razorpayOrderId: orderId,
      amountInPaise: 3000,
      status: 'PENDING',
    });

    const eventPayload = {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_failed_000',
            order_id: orderId,
            amount: 3000,
            error_description: 'Payment was cancelled by commuter',
          },
        },
      },
    };

    const rawBody = JSON.stringify(eventPayload);
    const validSignature = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    const { req, res, getStatusCode, getResponseData } = createMockReqRes({
      method: 'POST',
      headers: {
        'x-razorpay-signature': validSignature,
      },
      body: Buffer.from(rawBody, 'utf8'),
    });

    await webhookHandler(req, res);
    expect(getStatusCode()).toBe(200);
    expect(getResponseData().received).toBe(true);

    const updated = bookingsStore.get(bookingId);
    expect(updated.status).toBe('FAILED');
    expect(updated.failureReason).toBe('Payment was cancelled by commuter');
  });
});
