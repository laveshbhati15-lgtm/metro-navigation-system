import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'crypto';
import createOrderHandler from './createRazorpayOrder.js';
import verifyPaymentHandler from './verifyRazorpayPayment.js';
import verifyQrHandler from './verifyRazorpayQr.js';
import webhookHandler from './razorpayWebhook.js';

const TEST_KEY_ID = 'rzp_test_mockRemediationKey';
const TEST_KEY_SECRET = 'mockRemediationSecret999';
const TEST_WEBHOOK_SECRET = 'mockRemediationWebhookSecret888';

// In-memory Firestore store for test isolation
const { bookingsStore, eventsStore, mockDb } = vi.hoisted(() => {
  const bookingsStore = new Map<string, any>();
  const eventsStore = new Map<string, any>();

  const defaultDoc = (docId: string) => ({
    set: async (data: any, options?: any) => {
      const existing = bookingsStore.get(docId) || {};
      bookingsStore.set(docId, options?.merge ? { ...existing, ...data } : { ...data });
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
      if (!existing) throw new Error(`Document not found: ${docId}`);
      bookingsStore.set(docId, { ...existing, ...updates });
    },
  });

  const mockDb = {
    runTransaction: async (fn: (transaction: any) => Promise<any>) => {
      const pendingUpdates: Promise<any>[] = [];
      const transaction = {
        get: async (ref: any) => ref.get(),
        update: (ref: any, updates: any) => {
          pendingUpdates.push(ref.update(updates));
        },
        set: (ref: any, data: any, options?: any) => {
          pendingUpdates.push(ref.set(data, options));
        },
      };
      const result = await fn(transaction);
      await Promise.all(pendingUpdates);
      return result;
    },
    collection: (colName: string) => {
      if (colName === 'processed_webhook_events') {
        return {
          doc: (docId: string) => ({
            get: async () => {
              const data = eventsStore.get(docId);
              return {
                exists: !!data,
                data: () => (data ? { ...data } : undefined),
              };
            },
            set: async (data: any, options?: any) => {
              const existing = eventsStore.get(docId) || {};
              eventsStore.set(docId, options?.merge ? { ...existing, ...data } : { ...data });
            },
            update: async (updates: any) => {
              const existing = eventsStore.get(docId) || {};
              eventsStore.set(docId, { ...existing, ...updates });
            },
          }),
        };
      }
      if (colName !== 'demo_bookings') {
        throw new Error(`Unexpected collection in test: ${colName}`);
      }
      return {
        doc: (docId: string) => defaultDoc(docId),
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
                      get: async () => {
                        const current = bookingsStore.get(id);
                        return {
                          exists: !!current,
                          data: () => (current ? { ...current } : undefined),
                        };
                      },
                      update: async (updates: any) => {
                        const current = bookingsStore.get(id);
                        bookingsStore.set(id, { ...(current || data), ...updates });
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

  return { bookingsStore, eventsStore, mockDb };
});

// Mock Firebase Admin
vi.mock('./_lib/firebaseAdmin.js', () => {
  const mockAuth = {
    verifyIdToken: async (token: string) => {
      if (token === 'valid-user-123-token') {
        return { uid: 'user_123', email: 'user123@example.com' };
      }
      if (token === 'valid-user-456-token') {
        return { uid: 'user_456', email: 'user456@example.com' };
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
    probeFirestore: async () => ({ ok: true, stage: 'CONNECTED' }),
    sanitizeFirestoreError: (err: any) => ({
      code: err?.code || 'UNKNOWN',
      message: String(err?.message || 'Error'),
    }),
    FieldValue: {
      serverTimestamp: () => 'MOCK_SERVER_TIMESTAMP',
      arrayUnion: (...items: any[]) => items,
    },
  };
});

// Mock Razorpay Client
const mockRefundData: Record<string, any> = {};
const mockPaymentData: Record<string, any> = {};

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
      if (mockPaymentData[paymentId]) {
        return mockPaymentData[paymentId];
      }
      return {
        id: paymentId,
        order_id: 'order_default',
        amount: 4000,
        currency: 'INR',
        status: 'captured',
      };
    }),
    fetchRazorpayRefund: vi.fn(async (refundId: string) => {
      if (mockRefundData[refundId]) {
        return mockRefundData[refundId];
      }
      return {
        id: refundId,
        payment_id: 'pay_default',
        amount: 4000,
        currency: 'INR',
        status: 'processed',
      };
    }),
  };
});

function createMockReqRes(options: {
  method?: string;
  url?: string;
  body?: any;
  rawBody?: Buffer;
  headers?: Record<string, string>;
}) {
  let statusCode = 200;
  let responseData: any = null;
  let responseHeaders: Record<string, string> = {};

  const req = {
    method: options.method || 'POST',
    url: options.url || '/',
    headers: options.headers || {},
    body: options.body || {},
    rawBody: options.rawBody,
  };

  const res = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    setHeader: (name: string, value: string) => {
      responseHeaders[name.toLowerCase()] = value;
      return res;
    },
    json: (data: any) => {
      responseData = data;
      return res;
    },
    send: (data: any) => {
      responseData = data;
      return res;
    },
    end: () => res,
    _getStatusCode: () => statusCode,
    _getJSONData: () => responseData,
    _getHeaders: () => responseHeaders,
  };

  return { req, res };
}

function computeWebhookSignature(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

describe('Security Remediation Priority Tests', () => {
  beforeEach(() => {
    bookingsStore.clear();
    eventsStore.clear();
    for (const key of Object.keys(mockRefundData)) delete mockRefundData[key];
    for (const key of Object.keys(mockPaymentData)) delete mockPaymentData[key];

    process.env.RAZORPAY_KEY_ID = TEST_KEY_ID;
    process.env.RAZORPAY_KEY_SECRET = TEST_KEY_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    process.env.RAZORPAY_TEST_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    process.env.PAYMENT_MODE = 'TEST';
    delete process.env.ENABLE_LIVE_DYNAMIC_QR;
  });

  // --------------------------------------------------------------------------
  // PRIORITY 1: REFUND LIFECYCLE
  // --------------------------------------------------------------------------
  describe('Priority 1: Refund Lifecycle & Ticket Invalidation', () => {
    it('processes full refund webhook (refund.processed), marks booking REFUNDED, cancels ticket, and records refund details', async () => {
      const bookingId = 'DMRC-REFUND-FULL-01';
      const orderId = 'order_refund_01';
      const paymentId = 'pay_refund_01';
      const refundId = 'rfnd_full_01';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        paymentStatus: 'PAID',
        status: 'PAID',
        fare: 4000,
        amountInPaise: 4000,
        currency: 'INR',
        originStationId: 'SAMAYPUR_BADLI',
        destinationStationId: 'RAJIV_CHOWK',
        ticket: {
          id: 'TKT-VALID-01',
          status: 'ACTIVE',
          paymentStatus: 'PAID',
        },
      });

      mockPaymentData[paymentId] = {
        id: paymentId,
        order_id: orderId,
        amount: 4000,
        amount_refunded: 4000,
        currency: 'INR',
        status: 'refunded',
        refund_status: 'full',
      };

      mockRefundData[refundId] = {
        id: refundId,
        payment_id: paymentId,
        amount: 4000,
        currency: 'INR',
        status: 'processed',
        notes: { bookingId },
      };

      const webhookPayload = JSON.stringify({
        entity: 'event',
        account_id: 'acc_test_123',
        event: 'refund.processed',
        contains: ['refund'],
        created_at: 1700000000,
        id: 'evt_refund_proc_01',
        payload: {
          refund: {
            entity: {
              id: refundId,
              payment_id: paymentId,
              amount: 4000,
              currency: 'INR',
              status: 'processed',
              notes: { bookingId },
            },
          },
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              amount: 4000,
              currency: 'INR',
              amount_refunded: 4000,
              refund_status: 'full',
            },
          },
        },
      });

      const signature = computeWebhookSignature(webhookPayload, TEST_WEBHOOK_SECRET);
      const { req, res } = createMockReqRes({
        body: JSON.parse(webhookPayload),
        rawBody: Buffer.from(webhookPayload, 'utf8'),
        headers: {
          'x-razorpay-signature': signature,
          'x-razorpay-event-id': 'evt_refund_proc_01',
        },
      });

      await webhookHandler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toMatchObject({ received: true });

      const updated = bookingsStore.get(bookingId);
      expect(updated.status).toBe('REFUNDED');
      expect(updated.paymentStatus).toBe('REFUNDED');
      expect(updated.ticket.status).toBe('CANCELLED');
      expect(updated.ticket.paymentStatus).toBe('REFUNDED');
      expect(updated.ticket.disclaimer).toContain('DEMO — REFUNDED / CANCELLED — NOT VALID FOR METRO TRAVEL');
      expect(updated.refunds).toHaveLength(1);
      expect(updated.refunds[0].refundId).toBe(refundId);
      expect(updated.refunds[0].amount).toBe(4000);
    });

    it('processes partial refund webhook and transitions booking to PARTIALLY_REFUNDED with ticket CANCELLED', async () => {
      const bookingId = 'DMRC-REFUND-PARTIAL-02';
      const orderId = 'order_refund_02';
      const paymentId = 'pay_refund_02';
      const refundId = 'rfnd_partial_02';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        paymentStatus: 'PAID',
        status: 'PAID',
        fare: 4000,
        amountInPaise: 4000,
        currency: 'INR',
        ticket: {
          id: 'TKT-VALID-02',
          status: 'ACTIVE',
          paymentStatus: 'PAID',
        },
      });

      mockPaymentData[paymentId] = {
        id: paymentId,
        order_id: orderId,
        amount: 4000,
        amount_refunded: 2000,
        currency: 'INR',
        status: 'captured',
        refund_status: 'partial',
      };

      mockRefundData[refundId] = {
        id: refundId,
        payment_id: paymentId,
        amount: 2000, // 2000 out of 4000
        currency: 'INR',
        status: 'processed',
        notes: { bookingId },
      };

      const webhookPayload = JSON.stringify({
        entity: 'event',
        id: 'evt_refund_part_02',
        event: 'refund.processed',
        payload: {
          refund: {
            entity: {
              id: refundId,
              payment_id: paymentId,
              amount: 2000,
              currency: 'INR',
              status: 'processed',
              notes: { bookingId },
            },
          },
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              amount: 4000,
              currency: 'INR',
              amount_refunded: 2000,
              refund_status: 'partial',
            },
          },
        },
      });

      const signature = computeWebhookSignature(webhookPayload, TEST_WEBHOOK_SECRET);
      const { req, res } = createMockReqRes({
        body: JSON.parse(webhookPayload),
        rawBody: Buffer.from(webhookPayload, 'utf8'),
        headers: {
          'x-razorpay-signature': signature,
          'x-razorpay-event-id': 'evt_refund_part_02',
        },
      });

      await webhookHandler(req as any, res as any);
      expect(res._getStatusCode()).toBe(200);

      const updated = bookingsStore.get(bookingId);
      expect(updated.status).toBe('PARTIALLY_REFUNDED');
      expect(updated.paymentStatus).toBe('PARTIALLY_REFUNDED');
      expect(updated.ticket.status).toBe('CANCELLED');
    });

    it('rejects verifyRazorpayPayment with 409 PAYMENT_REFUNDED if booking is already refunded', async () => {
      const guestToken = 'guest_token_refund_test_123';
      const guestHash = crypto.createHash('sha256').update(guestToken).digest('hex');
      const bookingId = 'DMRC-REFUNDED-BOOKING-03';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayOrderId: 'order_test_rfnd',
        status: 'REFUNDED',
        paymentStatus: 'REFUNDED',
        guestAccessHash: guestHash,
        fare: 4000,
        currency: 'INR',
      });

      const { req, res } = createMockReqRes({
        body: {
          bookingId,
          razorpayPaymentId: 'pay_test_rfnd',
          razorpaySignature: 'any_signature',
        },
        headers: {
          'x-guest-access-token': guestToken,
        },
      });

      await verifyPaymentHandler(req as any, res as any);
      expect(res._getStatusCode()).toBe(409);
      expect(res._getJSONData().code).toBe('PAYMENT_REFUNDED');
    });

    it('rejects verifyRazorpayQr with 409 PAYMENT_REFUNDED if booking is already refunded', async () => {
      const guestToken = 'guest_token_qr_refund_04';
      const guestHash = crypto.createHash('sha256').update(guestToken).digest('hex');
      const bookingId = 'DMRC-QR-REFUND-04';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayQrId: 'qr_refunded_test_04',
        status: 'REFUNDED',
        paymentStatus: 'REFUNDED',
        guestAccessHash: guestHash,
        fare: 4000,
        currency: 'INR',
      });

      const { req, res } = createMockReqRes({
        body: { bookingId },
        headers: {
          'x-guest-access-token': guestToken,
        },
      });

      await verifyQrHandler(req as any, res as any);
      expect(res._getStatusCode()).toBe(409);
      expect(res._getJSONData().code).toBe('PAYMENT_REFUNDED');
    });
  });

  // --------------------------------------------------------------------------
  // PRIORITY 2: WEBHOOK EVENT DEDUPLICATION
  // --------------------------------------------------------------------------
  describe('Priority 2: Webhook Event Deduplication', () => {
    it('records event ID in processed_webhook_events and short-circuits identical duplicate deliveries', async () => {
      const eventId = 'evt_unique_dedup_999';
      const orderId = 'order_dedup_01';
      bookingsStore.set('DMRC-DEDUP-01', {
        bookingId: 'DMRC-DEDUP-01',
        razorpayOrderId: orderId,
        status: 'PENDING',
        amountInPaise: 4000,
        fare: 4000,
        currency: 'INR',
      });

      const webhookPayload = JSON.stringify({
        entity: 'event',
        id: eventId,
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: 'pay_fail_dedup_01',
              order_id: orderId,
              error_code: 'BAD_REQUEST_ERROR',
              error_description: 'Card declined',
            },
          },
        },
      });

      const signature = computeWebhookSignature(webhookPayload, TEST_WEBHOOK_SECRET);

      // First delivery: processes normally
      const { req: req1, res: res1 } = createMockReqRes({
        body: JSON.parse(webhookPayload),
        rawBody: Buffer.from(webhookPayload, 'utf8'),
        headers: {
          'x-razorpay-signature': signature,
          'x-razorpay-event-id': eventId,
        },
      });

      await webhookHandler(req1 as any, res1 as any);
      expect(res1._getStatusCode()).toBe(200);
      expect(eventsStore.has(eventId)).toBe(true);
      expect(eventsStore.get(eventId).status).toBe('COMPLETED');

      // Second delivery: deduplicated
      const { req: req2, res: res2 } = createMockReqRes({
        body: JSON.parse(webhookPayload),
        rawBody: Buffer.from(webhookPayload, 'utf8'),
        headers: {
          'x-razorpay-signature': signature,
          'x-razorpay-event-id': eventId,
        },
      });

      await webhookHandler(req2 as any, res2 as any);
      expect(res2._getStatusCode()).toBe(200);
      expect(res2._getJSONData()).toMatchObject({
        received: true,
        deduplicated: true,
      });
    });

    it('idempotently handles duplicate refund webhooks without appending duplicate entries in refunds array', async () => {
      const bookingId = 'DMRC-REFUND-IDEMPOTENT-05';
      const orderId = 'order_refund_idem_05';
      const paymentId = 'pay_refund_idem_05';
      const refundId = 'rfnd_idem_05';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        paymentStatus: 'PAID',
        status: 'PAID',
        fare: 4000,
        currency: 'INR',
        ticket: { id: 'TKT-05', status: 'ACTIVE' },
      });

      mockRefundData[refundId] = {
        id: refundId,
        payment_id: paymentId,
        amount: 4000,
        currency: 'INR',
        status: 'processed',
        notes: { bookingId },
      };

      const webhookPayload1 = JSON.stringify({
        entity: 'event',
        id: 'evt_refund_idem_01',
        event: 'refund.processed',
        payload: {
          refund: {
            entity: {
              id: refundId,
              payment_id: paymentId,
              amount: 4000,
              currency: 'INR',
              status: 'processed',
              notes: { bookingId },
            },
          },
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              amount: 4000,
              currency: 'INR',
              refund_status: 'full',
            },
          },
        },
      });

      const sig1 = computeWebhookSignature(webhookPayload1, TEST_WEBHOOK_SECRET);
      const { req: req1, res: res1 } = createMockReqRes({
        body: JSON.parse(webhookPayload1),
        rawBody: Buffer.from(webhookPayload1, 'utf8'),
        headers: { 'x-razorpay-signature': sig1, 'x-razorpay-event-id': 'evt_refund_idem_01' },
      });

      await webhookHandler(req1 as any, res1 as any);
      expect(res1._getStatusCode()).toBe(200);

      // Now simulate another refund event with a different event ID for the same refundId
      const webhookPayload2 = JSON.stringify({
        entity: 'event',
        id: 'evt_refund_idem_02',
        event: 'payment.refunded',
        payload: {
          refund: {
            entity: {
              id: refundId,
              payment_id: paymentId,
              amount: 4000,
              currency: 'INR',
              status: 'processed',
              notes: { bookingId },
            },
          },
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              amount: 4000,
              currency: 'INR',
              refund_status: 'full',
            },
          },
        },
      });

      const sig2 = computeWebhookSignature(webhookPayload2, TEST_WEBHOOK_SECRET);
      const { req: req2, res: res2 } = createMockReqRes({
        body: JSON.parse(webhookPayload2),
        rawBody: Buffer.from(webhookPayload2, 'utf8'),
        headers: { 'x-razorpay-signature': sig2, 'x-razorpay-event-id': 'evt_refund_idem_02' },
      });

      await webhookHandler(req2 as any, res2 as any);
      expect(res2._getStatusCode()).toBe(200);

      // Should not duplicate the refund record
      const updated = bookingsStore.get(bookingId);
      expect(updated.refunds.filter((r: any) => r.refundId === refundId)).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // PRIORITY 3: OUT-OF-ORDER PAYMENT EVENTS
  // --------------------------------------------------------------------------
  describe('Priority 3: Out-of-Order Payment Events State Machine', () => {
    it('allows verified payment.captured to fulfill a booking previously marked FAILED by payment.failed', async () => {
      const bookingId = 'DMRC-OUT-OF-ORDER-06';
      const orderId = 'order_ooo_06';
      const paymentId = 'pay_ooo_06';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayOrderId: orderId,
        status: 'PENDING',
        paymentStatus: 'CREATED',
        fare: 4000,
        amountInPaise: 4000,
        currency: 'INR',
        originStationId: 'KASHMERE_GATE',
        destinationStationId: 'CHANDNI_CHOWK',
        passengerCount: 1,
        ticketType: 'SINGLE',
      });

      // 1. payment.failed arrives first
      const failPayload = JSON.stringify({
        entity: 'event',
        id: 'evt_fail_ooo_01',
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              status: 'failed',
              error_code: 'BAD_REQUEST_ERROR',
              error_description: 'Card details incorrect',
              notes: { bookingId },
            },
          },
        },
      });

      const sigFail = computeWebhookSignature(failPayload, TEST_WEBHOOK_SECRET);
      const { req: reqFail, res: resFail } = createMockReqRes({
        body: JSON.parse(failPayload),
        rawBody: Buffer.from(failPayload, 'utf8'),
        headers: { 'x-razorpay-signature': sigFail, 'x-razorpay-event-id': 'evt_fail_ooo_01' },
      });

      await webhookHandler(reqFail as any, resFail as any);
      expect(resFail._getStatusCode()).toBe(200);

      const failedBooking = bookingsStore.get(bookingId);
      expect(failedBooking.status).toBe('FAILED');
      expect(failedBooking.failureReason).toBe('Card details incorrect');
      expect(failedBooking.failedAttempts).toHaveLength(1);

      // 2. payment.captured arrives next (customer retried and paid, or network reordered packets)
      mockPaymentData[paymentId] = {
        id: paymentId,
        order_id: orderId,
        amount: 4000,
        currency: 'INR',
        status: 'captured',
      };

      const capturePayload = JSON.stringify({
        entity: 'event',
        id: 'evt_capture_ooo_02',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              amount: 4000,
              currency: 'INR',
              status: 'captured',
              notes: { bookingId },
            },
          },
        },
      });

      const sigCapture = computeWebhookSignature(capturePayload, TEST_WEBHOOK_SECRET);
      const { req: reqCapture, res: resCapture } = createMockReqRes({
        body: JSON.parse(capturePayload),
        rawBody: Buffer.from(capturePayload, 'utf8'),
        headers: { 'x-razorpay-signature': sigCapture, 'x-razorpay-event-id': 'evt_capture_ooo_02' },
      });

      await webhookHandler(reqCapture as any, resCapture as any);
      expect(resCapture._getStatusCode()).toBe(200);

      // State machine successfully transitions FAILED -> PAID
      const paidBooking = bookingsStore.get(bookingId);
      expect(paidBooking.status).toBe('PAID');
      expect(paidBooking.paymentStatus).toBe('PAID');
      expect(paidBooking.razorpayPaymentId).toBe(paymentId);
      expect(paidBooking.ticket).toBeDefined();
      expect(paidBooking.ticket.status).toBe('ACTIVE');
      expect(paidBooking.ticket.disclaimer).toContain('DEMO — NOT VALID FOR METRO TRAVEL');
    });
  });

  // --------------------------------------------------------------------------
  // PRIORITY 4: STANDARD CHECKOUT OWNERSHIP VERIFICATION
  // --------------------------------------------------------------------------
  describe('Priority 4: Standard Checkout Ownership Verification', () => {
    it('creates order with guest access token and SHA-256 hash when caller is unauthenticated', async () => {
      const { req, res } = createMockReqRes({
        body: {
          sourceId: 'SAMAYPUR_BADLI',
          destinationId: 'RAJIV_CHOWK',
          passengerCount: 1,
          ticketType: 'SINGLE',
        },
      });

      await createOrderHandler(req as any, res as any);
      expect(res._getStatusCode()).toBe(200);

      const data = res._getJSONData();
      expect(data.success).toBe(true);
      expect(data.orderId).toBeDefined();
      expect(data.bookingId).toBeDefined();
      expect(data.guestAccessToken).toBeDefined();
      expect(typeof data.guestAccessToken).toBe('string');
      expect(data.guestAccessToken).toHaveLength(64); // 32 random bytes hex

      const storedBooking = bookingsStore.get(data.bookingId);
      expect(storedBooking).toBeDefined();
      expect(storedBooking.userId).toBeNull();
      expect(storedBooking.guestAccessHash).toBeDefined();

      // Verify that stored hash matches SHA-256 of the returned guest token
      const expectedHash = crypto.createHash('sha256').update(data.guestAccessToken).digest('hex');
      expect(storedBooking.guestAccessHash).toBe(expectedHash);
    });

    it('creates order with userId when valid Firebase Bearer token is provided', async () => {
      const { req, res } = createMockReqRes({
        body: {
          sourceId: 'SAMAYPUR_BADLI',
          destinationId: 'RAJIV_CHOWK',
          passengerCount: 1,
          ticketType: 'SINGLE',
        },
        headers: {
          authorization: 'Bearer valid-user-123-token',
        },
      });

      await createOrderHandler(req as any, res as any);
      expect(res._getStatusCode()).toBe(200);

      const data = res._getJSONData();
      expect(data.success).toBe(true);
      expect(data.guestAccessToken).toBeUndefined();

      const storedBooking = bookingsStore.get(data.bookingId);
      expect(storedBooking.userId).toBe('user_123');
      expect(storedBooking.userEmail).toBe('user123@example.com');
      expect(storedBooking.guestAccessHash).toBeNull();
    });

    it('allows verification when correct guestAccessToken is provided in x-guest-access-token header', async () => {
      const guestToken = crypto.randomBytes(32).toString('hex');
      const guestHash = crypto.createHash('sha256').update(guestToken).digest('hex');
      const bookingId = 'DMRC-OWNERSHIP-GUEST-OK';
      const orderId = 'order_guest_ok';
      const paymentId = 'pay_guest_ok';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayOrderId: orderId,
        status: 'PENDING',
        paymentStatus: 'CREATED',
        fare: 4000,
        amountInPaise: 4000,
        currency: 'INR',
        guestAccessHash: guestHash,
        originStationId: 'SAMAYPUR_BADLI',
        destinationStationId: 'RAJIV_CHOWK',
        passengerCount: 1,
        ticketType: 'SINGLE',
      });

      mockPaymentData[paymentId] = {
        id: paymentId,
        order_id: orderId,
        amount: 4000,
        currency: 'INR',
        status: 'captured',
      };

      const validSignature = crypto
        .createHmac('sha256', TEST_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const { req, res } = createMockReqRes({
        body: {
          bookingId,
          razorpayPaymentId: paymentId,
          razorpaySignature: validSignature,
        },
        headers: {
          'x-guest-access-token': guestToken,
        },
      });

      await verifyPaymentHandler(req as any, res as any);
      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().success).toBe(true);
    });

    it('rejects verification with 403 when guestAccessToken is invalid or tampered', async () => {
      const guestToken = crypto.randomBytes(32).toString('hex');
      const guestHash = crypto.createHash('sha256').update(guestToken).digest('hex');
      const bookingId = 'DMRC-OWNERSHIP-GUEST-BAD';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayOrderId: 'order_guest_bad',
        status: 'PENDING',
        fare: 4000,
        currency: 'INR',
        guestAccessHash: guestHash,
      });

      const { req, res } = createMockReqRes({
        body: {
          bookingId,
          razorpayPaymentId: 'pay_guest_bad',
          razorpaySignature: 'any_signature',
        },
        headers: {
          'x-guest-access-token': 'wrong-token-value',
        },
      });

      await verifyPaymentHandler(req as any, res as any);
      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().code).toBe('GUEST_TOKEN_INVALID');
    });

    it('rejects verification with 401 when guestAccessToken is missing entirely for guest booking', async () => {
      const guestToken = crypto.randomBytes(32).toString('hex');
      const guestHash = crypto.createHash('sha256').update(guestToken).digest('hex');
      const bookingId = 'DMRC-OWNERSHIP-GUEST-MISSING';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayOrderId: 'order_guest_missing',
        status: 'PENDING',
        fare: 4000,
        currency: 'INR',
        guestAccessHash: guestHash,
      });

      const { req, res } = createMockReqRes({
        body: {
          bookingId,
          razorpayPaymentId: 'pay_guest_missing',
          razorpaySignature: 'any_signature',
        },
      });

      await verifyPaymentHandler(req as any, res as any);
      expect(res._getStatusCode()).toBe(401);
      expect(res._getJSONData().code).toBe('GUEST_TOKEN_REQUIRED');
    });

    it('rejects verification with 401 when authenticated booking is accessed without Bearer token', async () => {
      const bookingId = 'DMRC-OWNERSHIP-AUTH-MISSING';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayOrderId: 'order_auth_missing',
        userId: 'user_123',
        status: 'PENDING',
        fare: 4000,
        currency: 'INR',
      });

      const { req, res } = createMockReqRes({
        body: {
          bookingId,
          razorpayPaymentId: 'pay_auth_missing',
          razorpaySignature: 'any_signature',
        },
      });

      await verifyPaymentHandler(req as any, res as any);
      expect(res._getStatusCode()).toBe(401);
      expect(res._getJSONData().code).toBe('AUTH_REQUIRED');
    });

    it('rejects verification with 403 when authenticated booking is accessed by a different user', async () => {
      const bookingId = 'DMRC-OWNERSHIP-AUTH-MISMATCH';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayOrderId: 'order_auth_mismatch',
        userId: 'user_123', // Owned by user_123
        status: 'PENDING',
        fare: 4000,
        currency: 'INR',
      });

      const { req, res } = createMockReqRes({
        body: {
          bookingId,
          razorpayPaymentId: 'pay_auth_mismatch',
          razorpaySignature: 'any_signature',
        },
        headers: {
          authorization: 'Bearer valid-user-456-token', // Attempted by user_456
        },
      });

      await verifyPaymentHandler(req as any, res as any);
      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().code).toBe('FORBIDDEN');
    });

    it('rejects verification with 403 UNOWNED_BOOKING if booking record has neither userId nor guestAccessHash', async () => {
      const bookingId = 'DMRC-UNOWNED-ANOMALY';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayOrderId: 'order_unowned',
        status: 'PENDING',
        fare: 4000,
        currency: 'INR',
        // Neither userId nor guestAccessHash
      });

      const { req, res } = createMockReqRes({
        body: {
          bookingId,
          razorpayPaymentId: 'pay_unowned',
          razorpaySignature: 'any_signature',
        },
      });

      await verifyPaymentHandler(req as any, res as any);
      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().code).toBe('UNOWNED_BOOKING');
    });
  });
});
