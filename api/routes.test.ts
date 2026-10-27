import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as crypto from 'crypto';
import createOrderHandler from './createRazorpayOrder.js';
import verifyPaymentHandler from './verifyRazorpayPayment.js';
import webhookHandler from './razorpayWebhook.js';

const TEST_KEY_ID = 'rzp_test_mock1234567890';
const TEST_KEY_SECRET = 'mockSecretKey9876543210';
const TEST_WEBHOOK_SECRET = 'mockWebhookSecret11223344';

// In-memory Firestore store and mock database for test isolation
const { bookingsStore, mockDb } = vi.hoisted(() => {
  const bookingsStore = new Map<string, any>();
  let docOverride: ((docId: string) => any) | null = null;

  const defaultDoc = (docId: string) => ({
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
  });

  const mockDb = {
    setDocOverride: (fn: ((docId: string) => any) | null) => {
      docOverride = fn;
    },
    collection: (colName: string) => {
      if (colName !== 'demo_bookings') {
        throw new Error(`Unexpected collection: ${colName}`);
      }
      return {
        doc: (docId: string) => (docOverride ? docOverride(docId) : defaultDoc(docId)),
        where: (field: string, _op: string, value: any) => ({
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
  return { bookingsStore, mockDb };
});

// Mock Firebase Admin
vi.mock('./_lib/firebaseAdmin.js', () => {

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
      initError: null,
      metadata: {
        isConfigured: true,
        projectId: 'metro-navigation-system',
        clientEmailDomain: 'metro-navigation-system.iam.gserviceaccount.com',
        hasPrivateKey: true,
        initError: null,
      },
    }),
    getFirebaseAuth: async () => mockAuth,
    probeFirestore: async (db: any) => {
      if (!db) {
        return {
          ok: false,
          stage: 'NOT_INITIALIZED',
          code: 'DATABASE_UNAVAILABLE',
          message: 'Firestore instance is not initialized',
        };
      }
      return { ok: true, stage: 'CONNECTED' };
    },
    sanitizeFirestoreError: (err: any) => {
      let code = 'UNKNOWN';
      if (err?.code === 7) code = 'PERMISSION_DENIED';
      else if (err?.code === 3) code = 'INVALID_ARGUMENT';
      else if (err?.code === 5) code = 'NOT_FOUND';
      else if (err?.code === 16) code = 'UNAUTHENTICATED';
      else if (typeof err?.code === 'string') code = err.code;
      const message = String(err?.details || err?.message || 'Error').replace(/[\r\n]+/g, ' ');
      return { code, message };
    },
    FieldValue: {
      serverTimestamp: () => 'MOCK_SERVER_TIMESTAMP',
    },
  };
});

// Mock Razorpay API Client
vi.mock('./_lib/razorpay.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_lib/razorpay.js')>();
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
  url = '/',
  headers = {},
  body = {},
}: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: any;
}) {
  const req: any = {
    method,
    url,
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

  it('serves safe diagnostics on GET with ?diagnostics=1 without exposing secrets', async () => {
    const { req, res, getStatusCode, getResponseData } = createMockReqRes({
      method: 'GET',
      url: '/api/createRazorpayOrder?diagnostics=1',
    });

    await createOrderHandler(req, res);
    expect(getStatusCode()).toBe(200);

    const data = getResponseData();
    expect(data.status).toBe('ok');
    expect(data.disclaimer).toBe('DEMO — NOT VALID FOR METRO TRAVEL');
    expect(data.diagnostics).toBeDefined();
    expect(data.diagnostics.razorpay.hasKeyId).toBe(true);
    expect(data.diagnostics.razorpay.keyType).toBe('TEST');
    expect(data.diagnostics.razorpay.hasKeySecret).toBe(true);
    expect(data.requestId).toBeDefined();

    // Verify secrets are strictly NOT present in the response
    const jsonStr = JSON.stringify(data);
    expect(jsonStr).not.toContain(TEST_KEY_SECRET);
    expect(jsonStr).not.toContain(TEST_WEBHOOK_SECRET);
  });

  it('returns structured 503 CONFIG_MISSING when Razorpay credentials are missing', async () => {
    delete process.env.RAZORPAY_KEY_ID;
    const { req, res, getStatusCode, getResponseData } = createMockReqRes({
      method: 'POST',
      body: {
        sourceId: 'RAJIV_CHOWK',
        destinationId: 'HAUZ_KHAS',
      },
    });

    await createOrderHandler(req, res);
    expect(getStatusCode()).toBe(503);
    expect(getResponseData().code).toBe('CONFIG_MISSING');
    expect(getResponseData().stage).toBe('CONFIG_VALIDATION');
    expect(getResponseData().requestId).toBeDefined();
  });

  it('returns structured 500 DATABASE_WRITE_ERROR with sanitized PERMISSION_DENIED details when Firestore rejects write', async () => {
    mockDb.setDocOverride(() => ({
      set: async () => {
        const err: any = new Error(
          '7 PERMISSION_DENIED: Cloud Firestore API has not been used in project metro-navigation-system before or it is disabled.'
        );
        err.code = 7;
        err.details =
          'Cloud Firestore API has not been used in project metro-navigation-system before or it is disabled.';
        throw err;
      },
      get: async () => ({ exists: false, data: () => null }),
      update: async () => {},
    }));

    const { req, res, getStatusCode, getResponseData } = createMockReqRes({
      method: 'POST',
      body: {
        sourceId: 'RAJIV_CHOWK',
        destinationId: 'HAUZ_KHAS',
        passengerCount: 1,
      },
    });

    try {
      await createOrderHandler(req, res);
      expect(getStatusCode()).toBe(500);
      const data = getResponseData();
      expect(data.code).toBe('DATABASE_WRITE_ERROR');
      expect(data.stage).toBe('FIRESTORE_WRITE');
      expect(data.firestoreErrorCode).toBe('PERMISSION_DENIED');
      expect(data.firestoreErrorMessage).toContain(
        'Cloud Firestore API has not been used in project'
      );
      expect(data.requestId).toBeDefined();
    } finally {
      mockDb.setDocOverride(null);
    }
  });

  it('returns structured 500 DATABASE_WRITE_ERROR with INVALID_ARGUMENT when document serialization fails', async () => {
    mockDb.setDocOverride(() => ({
      set: async () => {
        const err: any = new Error(
          '3 INVALID_ARGUMENT: Value for argument "documentPath" is not a valid resource path.'
        );
        err.code = 3;
        err.details =
          'Value for argument "documentPath" is not a valid resource path.';
        throw err;
      },
      get: async () => ({ exists: false, data: () => null }),
      update: async () => {},
    }));

    const { req, res, getStatusCode, getResponseData } = createMockReqRes({
      method: 'POST',
      body: {
        sourceId: 'RAJIV_CHOWK',
        destinationId: 'HAUZ_KHAS',
        passengerCount: 1,
      },
    });

    try {
      await createOrderHandler(req, res);
      expect(getStatusCode()).toBe(500);
      const data = getResponseData();
      expect(data.code).toBe('DATABASE_WRITE_ERROR');
      expect(data.stage).toBe('FIRESTORE_WRITE');
      expect(data.firestoreErrorCode).toBe('INVALID_ARGUMENT');
      expect(data.firestoreErrorMessage).toContain('Value for argument');
      expect(data.requestId).toBeDefined();
    } finally {
      mockDb.setDocOverride(null);
    }
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

  it('returns structured 500 DATABASE_UPDATE_ERROR when Firestore update fails after signature verification', async () => {
    const bookingId = 'DMRC-DEMO-TEST-UPDATE-FAIL';
    const orderId = 'order_test_valid';
    const paymentId = 'pay_test_fail_write';

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

    const validSignature = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    mockDb.setDocOverride((id: string) => ({
      get: async () => ({
        exists: bookingsStore.has(id),
        data: () => bookingsStore.get(id),
      }),
      update: async () => {
        const err: any = new Error(
          '7 PERMISSION_DENIED: Missing write permissions on database'
        );
        err.code = 7;
        err.details = 'Missing write permissions on database';
        throw err;
      },
      set: async () => {},
    }));

    const { req, res, getStatusCode, getResponseData } = createMockReqRes({
      method: 'POST',
      body: {
        bookingId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSignature,
      },
    });

    try {
      await verifyPaymentHandler(req, res);
      expect(getStatusCode()).toBe(500);
      const data = getResponseData();
      expect(data.code).toBe('DATABASE_UPDATE_ERROR');
      expect(data.stage).toBe('FIRESTORE_UPDATE');
      expect(data.firestoreErrorCode).toBe('PERMISSION_DENIED');
      expect(data.firestoreErrorMessage).toContain('Missing write permissions');
      expect(data.ticket).toBeUndefined();
      expect(bookingsStore.get(bookingId).status).toBe('PENDING');
    } finally {
      mockDb.setDocOverride(null);
    }
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
