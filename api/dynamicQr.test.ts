import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as crypto from 'crypto';
import createQrHandler from './createRazorpayQr.js';
import verifyQrHandler from './verifyRazorpayQr.js';
import webhookHandler from './razorpayWebhook.js';
import {
  signTicketPayload,
  verifyTicketSignature,
  formatVerifiedTicket,
} from './_lib/formatTicket.js';
import { getRazorpayConfig, getTicketSigningSecrets } from './_lib/config.js';
import { resetRateLimitForTesting } from './_lib/rateLimit.js';

const TEST_KEY_ID = 'rzp_test_mock1234567890';
const TEST_KEY_SECRET = 'mockSecretKey9876543210';
const TEST_WEBHOOK_SECRET = 'mockWebhookSecret11223344';
const TEST_TICKET_SECRET = 'test_ticket_signing_secret_32bytes_min';

// In-memory Firestore store for test isolation
const { bookingsStore, eventsStore, mockDb } = vi.hoisted(() => {
  const bookingsStore = new Map<string, any>();
  const eventsStore = new Map<string, any>();
  let docOverride: ((docId: string) => any) | null = null;

  const defaultDoc = (docId: string) => ({
    set: async (data: any) => {
      bookingsStore.set(docId, { ...data });
    },
    get: async () => {
      const data = bookingsStore.get(docId);
      if (data?.forceGetFailure && data?.duringReRead) {
        throw new Error('Simulated Firestore read failure');
      }
      return {
        exists: !!data,
        data: () => (data ? { ...data } : undefined),
      };
    },
    update: async (updates: any) => {
      const existing = bookingsStore.get(docId);
      if (!existing) throw new Error('Document not found');
      const merged = { ...existing, ...updates };
      if (updates.duplicateCapturedPayments && Array.isArray(existing.duplicateCapturedPayments)) {
        const combined = [...existing.duplicateCapturedPayments];
        for (const item of updates.duplicateCapturedPayments) {
          if (!combined.some((c: any) => c.paymentId === item.paymentId)) {
            combined.push(item);
          }
        }
        merged.duplicateCapturedPayments = combined;
      }
      if (updates.reconciliationCapturedPayments && Array.isArray(existing.reconciliationCapturedPayments)) {
        const combined = [...existing.reconciliationCapturedPayments];
        for (const item of updates.reconciliationCapturedPayments) {
          if (!combined.some((c: any) => c.paymentId === item.paymentId)) {
            combined.push(item);
          }
        }
        merged.reconciliationCapturedPayments = combined;
      }
      bookingsStore.set(docId, merged);
    },
  });

  const mockDb = {
    setDocOverride: (fn: ((docId: string) => any) | null) => {
      docOverride = fn;
    },
    runTransaction: async (fn: (transaction: any) => Promise<any>) => {
      const transaction = {
        get: async (ref: any) => {
          const snap = await ref.get();
          if (snap.exists && snap.data().simulateConcurrentPaymentCapture) {
            // Concurrent worker marks PAID before update
            bookingsStore.set(snap.data().bookingId, {
              ...snap.data(),
              status: 'PAID',
              razorpayPaymentId: 'pay_concurrent_won_race',
            });
            return {
              exists: true,
              data: () => ({
                ...snap.data(),
                status: 'PAID',
                razorpayPaymentId: 'pay_concurrent_won_race',
              }),
            };
          }
          if (snap.exists && snap.data().forceTransactionFailure) {
            // Set flag so subsequent re-read also fails
            bookingsStore.set(snap.data().bookingId, {
              ...snap.data(),
              duringReRead: true,
            });
            throw new Error('Simulated transaction failure');
          }
          return snap;
        },
        update: (ref: any, updates: any) => {
          return ref.update(updates);
        },
        set: (ref: any, data: any) => {
          return ref.set(data);
        },
      };
      return await fn(transaction);
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
                    ref: defaultDoc(id),
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
      if (token === 'valid-user-token') {
        return { uid: 'user_123', email: 'commuter@example.com' };
      }
      if (token === 'other-user-token') {
        return { uid: 'user_other_456', email: 'other@example.com' };
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
      message: err?.message || 'Error',
    }),
    FieldValue: {
      serverTimestamp: () => 'MOCK_SERVER_TIMESTAMP',
      arrayUnion: (...items: any[]) => items,
    },
  };
});

// Mock Razorpay SDK QR calls
vi.mock('./_lib/razorpay.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_lib/razorpay.js')>();
  return {
    ...actual,
    createDynamicUpiQr: vi.fn(async (amountInPaise: number, bookingId: string, notes: any) => ({
      id: `qr_${Math.random().toString(36).substring(2, 10)}`,
      entity: 'qr_code',
      usage: 'single_use',
      type: 'upi_qr',
      image_url: 'https://api.razorpay.com/v1/qr_codes/mock_qr.png',
      payment_amount: amountInPaise,
      status: 'active',
      fixed_amount: true,
      payments_amount_received: 0,
      payments_count_received: 0,
      notes: { ...notes, bookingId },
      close_by: Math.floor(Date.now() / 1000) + 900,
    })),
    fetchRazorpayQrCode: vi.fn(async (qrId: string) => {
      if (qrId === 'qr_closed_mock' || qrId === 'qr_race_late_capture_mock') {
        return { id: qrId, type: 'upi_qr', usage: 'single_use', fixed_amount: true, payment_amount: 4000, status: 'closed', payments_count_received: 0 };
      }
      if (qrId === 'qr_invalid_entity_mock') {
        return { id: qrId, type: 'bharat_qr', usage: 'multiple_use', fixed_amount: false, payment_amount: 1000, status: 'active', payments_count_received: 0 };
      }
      if (qrId === 'qr_fixed_false_mock') {
        return { id: qrId, type: 'upi_qr', usage: 'single_use', fixed_amount: false, payment_amount: 4000, status: 'active', payments_count_received: 0 };
      }
      if (
        qrId === 'qr_closed_mock' ||
        qrId === 'qr_race_late_capture_mock' ||
        qrId === 'qr_race_late_amount_mismatch_mock' ||
        qrId === 'qr_race_late_currency_mismatch_mock' ||
        qrId === 'qr_race_late_mixed_mock'
      ) {
        return { id: qrId, type: 'upi_qr', usage: 'single_use', fixed_amount: true, payment_amount: 4000, status: 'closed', payments_count_received: 0 };
      }
      return { id: qrId, type: 'upi_qr', usage: 'single_use', fixed_amount: true, payment_amount: 4000, status: 'active', payments_count_received: 1 };
    }),
    fetchRazorpayPayment: vi.fn(async (paymentId: string) => {
      if (paymentId === 'pay_not_captured') {
        return { id: paymentId, status: 'authorized', amount: 4000, currency: 'INR', qr_code_id: (globalThis as any).__mockPaymentQrId || 'qr_webhook_credited_1' };
      }
      if (paymentId === 'pay_mismatch_amt') {
        return { id: paymentId, status: 'captured', amount: 2000, currency: 'INR', qr_code_id: (globalThis as any).__mockPaymentQrId || 'qr_webhook_credited_1' };
      }
      if (paymentId === 'pay_mismatch_curr') {
        return { id: paymentId, status: 'captured', amount: 4000, currency: 'USD', qr_code_id: (globalThis as any).__mockPaymentQrId || 'qr_webhook_credited_1' };
      }
      if (paymentId === 'pay_missing_curr') {
        return { id: paymentId, status: 'captured', amount: 4000, qr_code_id: (globalThis as any).__mockPaymentQrId || 'qr_webhook_credited_1' };
      }
      if (paymentId === 'pay_mismatch_qr_id') {
        return { id: paymentId, status: 'captured', amount: 4000, currency: 'INR', qr_code_id: 'qr_DIFFERENT_ASSOCIATION' };
      }
      if (paymentId === 'pay_lookup_fails_mock') {
        throw new Error('Razorpay API network failure during payment lookup');
      }
      return {
        id: paymentId,
        status: 'captured',
        amount: 4000,
        currency: 'INR',
        qr_code_id: (globalThis as any).__mockPaymentQrId || 'qr_webhook_credited_1',
        created_at: 1700000000,
      };
    }),
    fetchAllPaymentsPaginated: vi.fn(async (qrId: string) => {
      if (qrId === 'qr_fetch_payments_fail_mock') {
        throw new Error('Razorpay API error: provider payments list unavailable');
      }
      if (qrId === 'qr_multi_page') {
        return actual.fetchAllPaymentsPaginated(qrId);
      }
      if (qrId === 'qr_pending_mock' || qrId === 'qr_closed_mock') {
        return [];
      }
      if (qrId === 'qr_race_late_capture_mock') {
        // First call returns empty, second call returns captured payment
        const count = ((globalThis as any).__qrRaceCallCount = ((globalThis as any).__qrRaceCallCount || 0) + 1);
        if (count === 1) {
          return [];
        }
        return [
          {
            id: 'pay_late_captured_in_race',
            status: 'captured',
            amount: 4000,
            currency: 'INR',
            qr_code_id: qrId,
            created_at: 1700000010,
          },
        ];
      }
      if (qrId === 'qr_race_late_amount_mismatch_mock') {
        const count = ((globalThis as any).__qrRaceLateAmtCount = ((globalThis as any).__qrRaceLateAmtCount || 0) + 1);
        if (count === 1) {
          return [];
        }
        return [
          {
            id: 'pay_late_mismatch_amt',
            status: 'captured',
            amount: 2500, // Expected 4000
            currency: 'INR',
            qr_code_id: qrId,
            created_at: 1700000010,
          },
        ];
      }
      if (qrId === 'qr_race_late_currency_mismatch_mock') {
        const count = ((globalThis as any).__qrRaceLateCurrCount = ((globalThis as any).__qrRaceLateCurrCount || 0) + 1);
        if (count === 1) {
          return [];
        }
        return [
          {
            id: 'pay_late_mismatch_curr',
            status: 'captured',
            amount: 4000,
            currency: 'EUR', // Expected INR
            qr_code_id: qrId,
            created_at: 1700000010,
          },
        ];
      }
      if (qrId === 'qr_initial_amt_mismatch_mock') {
        return [{ id: 'pay_init_bad_amt', status: 'captured', amount: 3000, currency: 'INR', qr_code_id: qrId, created_at: 1700000000 }];
      }
      if (qrId === 'qr_initial_curr_mismatch_mock') {
        return [{ id: 'pay_init_bad_curr', status: 'captured', amount: 4000, currency: 'USD', qr_code_id: qrId, created_at: 1700000000 }];
      }
      if (qrId === 'qr_mixed_valid_and_mismatch_mock') {
        return [
          { id: 'pay_valid_one', status: 'captured', amount: 4000, currency: 'INR', qr_code_id: qrId, created_at: 1700000000 },
          { id: 'pay_mismatch_bad_amt', status: 'captured', amount: 2000, currency: 'INR', qr_code_id: qrId, created_at: 1700000002 },
        ];
      }
      if (qrId === 'qr_multiple_mismatch_mock') {
        return [
          { id: 'pay_mult_mismatch_1', status: 'captured', amount: 1500, currency: 'INR', qr_code_id: qrId, created_at: 1700000000 },
          { id: 'pay_mult_mismatch_2', status: 'captured', amount: 4000, currency: 'GBP', qr_code_id: qrId, created_at: 1700000003 },
        ];
      }
      if (qrId === 'qr_race_late_mixed_mock') {
        const count = ((globalThis as any).__qrRaceLateMixedCount = ((globalThis as any).__qrRaceLateMixedCount || 0) + 1);
        if (count === 1) {
          return [];
        }
        return [
          { id: 'pay_late_valid', status: 'captured', amount: 4000, currency: 'INR', qr_code_id: qrId, created_at: 1700000010 },
          { id: 'pay_late_mismatch', status: 'captured', amount: 1200, currency: 'INR', qr_code_id: qrId, created_at: 1700000011 },
        ];
      }
      if (qrId === 'qr_auth_pending_mock') {
        return [{ id: 'pay_qr_auth_1', status: 'authorized', amount: 4000, currency: 'INR', qr_code_id: qrId, created_at: 1700000000 }];
      }
      if (qrId === 'pay_missing_curr_mock') {
        return [{ id: 'pay_no_curr', status: 'captured', amount: 4000, qr_code_id: qrId, created_at: 1700000000 }];
      }
      if (qrId === 'pay_wrong_qr_assoc_mock') {
        return [{ id: 'pay_wrong_qr', status: 'captured', amount: 4000, currency: 'INR', qr_code_id: 'qr_SOME_OTHER_QR', created_at: 1700000000 }];
      }
      if (qrId === 'qr_duplicate_mock') {
        return [
          { id: 'pay_qr_first', status: 'captured', amount: 4000, currency: 'INR', qr_code_id: qrId, created_at: 1700000001 },
          { id: 'pay_qr_second', status: 'captured', amount: 4000, currency: 'INR', qr_code_id: qrId, created_at: 1700000005 },
        ];
      }
      return [{ id: 'pay_qr_captured_1', status: 'captured', amount: 4000, currency: 'INR', qr_code_id: qrId, created_at: 1700000000 }];
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
    setHeader: (k: string, v: string) => {
      responseHeaders[k.toLowerCase()] = v;
      return res;
    },
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      responseData = data;
      ended = true;
      return res;
    },
    end: () => {
      ended = true;
      return res;
    },
  };

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getData: () => responseData,
    getHeaders: () => responseHeaders,
    isEnded: () => ended,
  };
}

describe('Razorpay Dynamic UPI QR Security Suite (Comprehensive Hardened Audit)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      RAZORPAY_KEY_ID: TEST_KEY_ID,
      RAZORPAY_KEY_SECRET: TEST_KEY_SECRET,
      RAZORPAY_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
      TICKET_SIGNING_SECRET: TEST_TICKET_SECRET,
      NODE_ENV: 'test',
    };
    bookingsStore.clear();
    eventsStore.clear();
    resetRateLimitForTesting();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('1. Webhook Association, Currency & State Transitions', () => {
    it('fails closed when RAZORPAY_WEBHOOK_SECRET is missing from backend environment', async () => {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-razorpay-signature': 'mock_sig' },
        body: Buffer.from(JSON.stringify({ event: 'payment.captured' })),
      });

      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(500);
      expect(getData().error).toContain('Webhook secret is not configured');
    });

    it('rejects webhooks with invalid signatures (HTTP 400)', async () => {
      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-razorpay-signature': 'tampered_or_invalid_signature' },
        body: Buffer.from(JSON.stringify({ event: 'payment.captured' })),
      });

      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(400);
      expect(getData().error).toContain('Invalid webhook signature');
    });

    it('verifies payment with provider API and fulfills booking', async () => {
      const bookingId = 'DMRC-DEMO-QR-WEBHOOK-1';
      const qrId = 'qr_webhook_credited_1';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayQrId: qrId,
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      const eventPayload = {
        event: 'qr_code.credited',
        payload: {
          qr_code: { entity: { id: qrId } },
          payment: { entity: { id: 'pay_valid_123', amount: 4000, currency: 'INR', qr_code_id: qrId, status: 'captured' } },
        },
      };

      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      const { req, res, getStatusCode } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });

      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(200);

      const record = bookingsStore.get(bookingId);
      expect(record.status).toBe('PAID');
      expect(record.razorpayPaymentId).toBe('pay_valid_123');
      expect(record.ticketSignature).toBeDefined();
    });

    it('rejects webhook when provider QR association does not match booking QR ID', async () => {
      const bookingId = 'DMRC-DEMO-QR-MISMATCH-QRID';
      const qrId = 'qr_webhook_credited_1';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayQrId: qrId,
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      const eventPayload = {
        event: 'qr_code.credited',
        payload: {
          qr_code: { entity: { id: qrId } },
          payment: { entity: { id: 'pay_mismatch_qr_id', amount: 4000, currency: 'INR', qr_code_id: 'qr_OTHER', status: 'captured' } },
        },
      };

      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      const { req, res, getStatusCode, getData } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });

      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(400);
      expect(getData().error).toContain('QR ID association');
    });

    it('rejects webhook when currency is missing or non-INR (fails closed, flags reconciliation)', async () => {
      const bookingId = 'DMRC-DEMO-QR-MISSING-CURR';
      const qrId = 'qr_webhook_credited_1';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayQrId: qrId,
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      const eventPayload = {
        event: 'qr_code.credited',
        payload: {
          qr_code: { entity: { id: qrId } },
          payment: { entity: { id: 'pay_missing_curr', amount: 4000, status: 'captured' } }, // Missing currency!
        },
      };

      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      const { req, res, getStatusCode, getData } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });

      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(200);
      expect(getData().note).toContain('Payment parameter mismatch detected');

      // Booking MUST remain PENDING; must NOT be marked PAID
      const record = bookingsStore.get(bookingId);
      expect(record.status).toBe('PENDING');
      expect(record.reconciliationNeeded).toBe(true);
      expect(record.razorpayPaymentId).toBeUndefined();
      expect(record.reconciliationCapturedPayments).toBeDefined();
      expect(record.reconciliationCapturedPayments[0].paymentId).toBe('pay_missing_curr');
      expect(record.reconciliationCapturedPayments[0].reason).toBe('CURRENCY_MISMATCH');
    });

    it('state machine: rejects webhook transition to PAID if booking is already EXPIRED or FAILED', async () => {
      const bookingId = 'DMRC-DEMO-QR-ALREADY-EXPIRED';
      const qrId = 'qr_webhook_credited_1';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayQrId: qrId,
        amountInPaise: 4000,
        currency: 'INR',
        status: 'EXPIRED',
      });

      const eventPayload = {
        event: 'qr_code.credited',
        payload: {
          qr_code: { entity: { id: qrId } },
          payment: { entity: { id: 'pay_late_123', amount: 4000, currency: 'INR', qr_code_id: qrId, status: 'captured' } },
        },
      };

      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      const { req, res, getStatusCode, getData } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });

      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(409);
      expect(getData().error).toContain('EXPIRED');
      expect(bookingsStore.get(bookingId).status).toBe('EXPIRED');
    });

    it('safely acknowledges (HTTP 200) webhook events lacking specific payment ID without marking booking PAID', async () => {
      const bookingId = 'DMRC-DEMO-QR-NO-PAYID';
      const qrId = 'qr_webhook_credited_1';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayQrId: qrId,
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      // Event lacks payment.entity.id
      const eventPayload = {
        event: 'qr_code.credited',
        payload: {
          qr_code: { entity: { id: qrId } },
          // payment entity missing or lacks id
        },
      };

      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      const { req, res, getStatusCode, getData } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });

      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(200);
      expect(getData().received).toBe(true);
      expect(getData().note).toContain('def');
      // Booking remains PENDING! Never marked PAID via unverified notes or aggregate counters
      expect(bookingsStore.get(bookingId).status).toBe('PENDING');
    });

    it('handles payment.captured event with full official payload structure', async () => {
      const bookingId = 'DMRC-DEMO-PAY-CAPTURED-EVENT';
      const qrId = 'qr_webhook_credited_1';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayQrId: qrId,
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      const eventPayload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_official_captured_1',
              amount: 4000,
              currency: 'INR',
              status: 'captured',
              qr_code_id: qrId,
            },
          },
        },
      };

      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      const { req, res, getStatusCode } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });

      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(200);
      expect(bookingsStore.get(bookingId).status).toBe('PAID');
      expect(bookingsStore.get(bookingId).razorpayPaymentId).toBe('pay_official_captured_1');
    });

    it('handles order.paid event safely when payment entity is present', async () => {
      const bookingId = 'DMRC-DEMO-ORDER-PAID-EVENT';
      const orderId = 'order_test_12345';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayOrderId: orderId,
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      const eventPayload = {
        event: 'order.paid',
        payload: {
          order: { entity: { id: orderId } },
          payment: {
            entity: {
              id: 'pay_order_paid_1',
              amount: 4000,
              currency: 'INR',
              status: 'captured',
              order_id: orderId,
            },
          },
        },
      };

      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      const { req, res, getStatusCode } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });

      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(200);
      expect(bookingsStore.get(bookingId).status).toBe('PAID');
    });

    it('preserves original Firestore creation timestamp on webhook-generated tickets across repeated deliveries', async () => {
      const bookingId = 'DMRC-DEMO-WEBHOOK-TIME-STABILITY';
      const qrId = 'qr_webhook_credited_1';
      const fixedEpochMs = Date.parse('2026-11-01T10:15:30.000Z');

      // Booking stores a Firestore Timestamp object with .toDate()
      bookingsStore.set(bookingId, {
        bookingId,
        razorpayQrId: qrId,
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
        expiresAt: '2026-11-02T10:15:30.000Z',
        createdAt: {
          toDate: () => new Date(fixedEpochMs),
        },
      });

      const eventPayload = {
        event: 'qr_code.credited',
        payload: {
          qr_code: { entity: { id: qrId } },
          payment: { entity: { id: 'pay_webhook_stable_time', amount: 4000, currency: 'INR', qr_code_id: qrId, status: 'captured' } },
        },
      };

      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      // First webhook delivery
      const { req: req1, res: res1, getStatusCode: getStatus1 } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });

      await webhookHandler(req1, res1);
      expect(getStatus1()).toBe(200);

      const record1 = bookingsStore.get(bookingId);
      expect(record1.status).toBe('PAID');
      const ticketPayload1 = JSON.parse(record1.qrPayload);
      const signature1 = record1.ticketSignature;
      expect(signature1).toBeDefined();

      // Second webhook delivery (idempotency & signature stability check)
      const { req: req2, res: res2, getStatusCode: getStatus2 } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });

      await webhookHandler(req2, res2);
      expect(getStatus2()).toBe(200);

      const record2 = bookingsStore.get(bookingId);
      expect(record2.status).toBe('PAID');
      const ticketPayload2 = JSON.parse(record2.qrPayload);
      const signature2 = record2.ticketSignature;

      // Both tickets must match identically in signature and qrPayload
      expect(signature2).toBe(signature1);
      expect(ticketPayload2.signature).toBe(ticketPayload1.signature);
      expect(ticketPayload2.bookingId).toBe(ticketPayload1.bookingId);
      expect(ticketPayload2.totalFare).toBe(ticketPayload1.totalFare);

      // Reformatting the booking object directly produces identical signature and createdAt
      const reformatted = formatVerifiedTicket(record1);
      expect(reformatted.signature).toBe(signature1);
      expect(reformatted.createdAt).toBe('2026-11-01T10:15:30.000Z');
    });

    it('returns HTTP 502 when independent Razorpay payment lookup fails during webhook processing', async () => {
      const bookingId = 'DMRC-DEMO-FETCH-FAIL-WEBHOOK';
      const qrId = 'qr_webhook_credited_1';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayQrId: qrId,
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      const eventPayload = {
        event: 'qr_code.credited',
        payload: {
          qr_code: { entity: { id: qrId } },
          payment: { entity: { id: 'pay_lookup_fails_mock', amount: 4000, currency: 'INR', status: 'captured', qr_code_id: qrId } },
        },
      };

      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      const { req, res, getStatusCode, getData } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });

      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(502);
      expect(getData().error).toContain('Failed to verify payment with provider');
      expect(bookingsStore.get(bookingId).status).toBe('PENDING');
    });
  });

  describe('2. Strict Authorization & Guest Tokens', () => {
    it('allows guest mode when Authorization header is completely absent (undefined)', async () => {
      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: {},
        body: {
          sourceId: 'HUDA_CITY_CENTRE',
          destinationId: 'SAMAYPUR_BADLI',
        },
      });

      await createQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      expect(getData().guestAccessToken).toBeDefined();
      expect(getData().paymentMode).toBe('TEST');
    });

    it('rejects empty string Authorization header with HTTP 401', async () => {
      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: {
          authorization: '',
        },
        body: {
          sourceId: 'HUDA_CITY_CENTRE',
          destinationId: 'SAMAYPUR_BADLI',
        },
      });

      await createQrHandler(req, res);
      expect(getStatusCode()).toBe(401);
      expect(getData().code).toBe('AUTH_HEADER_EMPTY');
    });

    it('rejects whitespace-only Authorization header with HTTP 401', async () => {
      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: {
          authorization: '    ',
        },
        body: {
          sourceId: 'HUDA_CITY_CENTRE',
          destinationId: 'SAMAYPUR_BADLI',
        },
      });

      await createQrHandler(req, res);
      expect(getStatusCode()).toBe(401);
      expect(getData().code).toBe('AUTH_HEADER_EMPTY');
    });

    it('rejects malformed Authorization header with HTTP 401 (never silent downgrade)', async () => {
      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: {
          authorization: 'Basic dXNlcjpwYXNz', // Not Bearer
        },
        body: {
          sourceId: 'HUDA_CITY_CENTRE',
          destinationId: 'SAMAYPUR_BADLI',
        },
      });

      await createQrHandler(req, res);
      expect(getStatusCode()).toBe(401);
      expect(getData().code).toBe('AUTH_HEADER_MALFORMED');
    });

    it('rejects empty Bearer token with HTTP 401 (Bearer with trailing space)', async () => {
      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: {
          authorization: 'Bearer ',
        },
        body: {
          sourceId: 'HUDA_CITY_CENTRE',
          destinationId: 'SAMAYPUR_BADLI',
        },
      });

      await createQrHandler(req, res);
      expect(getStatusCode()).toBe(401);
      expect(getData().code).toBe('AUTH_TOKEN_EMPTY');
    });

    it('rejects empty Bearer token with HTTP 401 (Bearer with multiple spaces)', async () => {
      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: {
          authorization: 'Bearer   ',
        },
        body: {
          sourceId: 'HUDA_CITY_CENTRE',
          destinationId: 'SAMAYPUR_BADLI',
        },
      });

      await createQrHandler(req, res);
      expect(getStatusCode()).toBe(401);
      expect(getData().code).toBe('AUTH_TOKEN_EMPTY');
    });

    it('rejects invalid or expired Firebase token with HTTP 401', async () => {
      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: {
          authorization: 'Bearer expired-or-invalid-token',
        },
        body: {
          sourceId: 'HUDA_CITY_CENTRE',
          destinationId: 'SAMAYPUR_BADLI',
        },
      });

      await createQrHandler(req, res);
      expect(getStatusCode()).toBe(401);
      expect(getData().code).toBe('AUTH_TOKEN_INVALID');
    });

    it('creates guest booking with 32-byte guest token and stores SHA-256 hash', async () => {
      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        body: {
          sourceId: 'HUDA_CITY_CENTRE',
          destinationId: 'SAMAYPUR_BADLI',
        },
      });

      await createQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      const data = getData();
      expect(data.guestAccessToken).toBeDefined();
      expect(data.guestAccessToken).toHaveLength(64); // 32 bytes hex

      const record = bookingsStore.get(data.bookingId);
      expect(record.guestAccessHash).toBeDefined();
      const expectedHash = crypto.createHash('sha256').update(data.guestAccessToken).digest('hex');
      expect(record.guestAccessHash).toBe(expectedHash);
    });

    it('rejects verification if booking has neither userId nor guestAccessHash (unowned booking, HTTP 403)', async () => {
      const bookingId = 'DMRC-DEMO-UNOWNED-BOOKING';
      bookingsStore.set(bookingId, {
        bookingId,
        razorpayQrId: 'qr_captured_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
        // Neither userId nor guestAccessHash exists!
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(403);
      expect(getData().code).toBe('UNOWNED_BOOKING');
    });

    it('rejects verification when guest token is supplied ONLY in request body and not in header (HTTP 401)', async () => {
      const bookingId = 'DMRC-DEMO-BODY-TOKEN-REJECTED';
      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('token_in_body_only').digest('hex'),
        razorpayQrId: 'qr_captured_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        body: {
          bookingId,
          guestAccessToken: 'token_in_body_only', // Body fallback removed!
        },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(401);
      expect(getData().code).toBe('GUEST_TOKEN_REQUIRED');
    });

    it('verifies guest booking when x-guest-access-token header is properly supplied', async () => {
      const bookingId = 'DMRC-DEMO-HEADER-TOKEN-VALID';
      const token = 'valid_hex_token_1234567890';
      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update(token).digest('hex'),
        razorpayQrId: 'qr_captured_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: {
          'x-guest-access-token': token,
        },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      expect(getData().status).toBe('PAID');
    });
  });

  describe('3. CORS Policy & Rate Limiting Protection', () => {
    it('blocks preflight OPTIONS requests from untrusted origins with 403', async () => {
      const { req, res, getStatusCode } = createMockReqRes({
        method: 'OPTIONS',
        headers: {
          origin: 'https://evil-spoof-site.com',
        },
      });

      await createQrHandler(req, res);
      expect(getStatusCode()).toBe(403);
    });

    it('does not set Access-Control-Allow-Origin header for untrusted origins on POST requests', async () => {
      const { req, res, getHeaders } = createMockReqRes({
        method: 'POST',
        headers: {
          origin: 'https://attacker-origin.example.com',
        },
        body: {
          sourceId: 'HUDA_CITY_CENTRE',
          destinationId: 'SAMAYPUR_BADLI',
        },
      });

      await createQrHandler(req, res);
      // Origin must NOT be reflected
      expect(getHeaders()['access-control-allow-origin']).toBeUndefined();
    });

    it('allows preflight OPTIONS requests from trusted production and localhost origins', async () => {
      const { req, res, getStatusCode, getHeaders } = createMockReqRes({
        method: 'OPTIONS',
        headers: {
          origin: 'https://metro-navigation-system-red.vercel.app',
        },
      });

      await createQrHandler(req, res);
      expect(getStatusCode()).toBe(204);
      expect(getHeaders()['access-control-allow-origin']).toBe('https://metro-navigation-system-red.vercel.app');
    });

    it('rejects localhost origins when NODE_ENV is production', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const { req, res, getStatusCode, getHeaders } = createMockReqRes({
          method: 'OPTIONS',
          headers: {
            origin: 'http://localhost:5173',
          },
        });

        await createQrHandler(req, res);
        expect(getStatusCode()).toBe(403);
        expect(getHeaders()['access-control-allow-origin']).toBeUndefined();
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    it('enforces abuse protection rate limit after threshold', async () => {
      // Send 20 requests
      for (let i = 0; i < 20; i++) {
        const { req, res } = createMockReqRes({
          method: 'POST',
          headers: { 'x-forwarded-for': '203.0.113.195' },
          body: { sourceId: 'HUDA_CITY_CENTRE', destinationId: 'SAMAYPUR_BADLI' },
        });
        await createQrHandler(req, res);
      }

      // 21st request should be rate limited with HTTP 429
      const { req: limitedReq, res: limitedRes, getStatusCode, getData, getHeaders } = createMockReqRes({
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.195' },
        body: { sourceId: 'HUDA_CITY_CENTRE', destinationId: 'SAMAYPUR_BADLI' },
      });

      await createQrHandler(limitedReq, limitedRes);
      expect(getStatusCode()).toBe(429);
      expect(getData().code).toBe('RATE_LIMIT_EXCEEDED');
      expect(getHeaders()['retry-after']).toBeDefined();
    });
  });

  describe('4. QR Invariants, Currency & Association Validation', () => {
    it('rejects verification if provider fixed_amount is false or missing', async () => {
      const bookingId = 'DMRC-DEMO-NOT-FIXED-AMOUNT';
      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('tok').digest('hex'),
        razorpayQrId: 'qr_fixed_false_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(400);
      expect(getData().code).toBe('QR_ENTITY_MISMATCH');
    });

    it('fails closed when payment currency is missing or non-INR (never defaults to INR)', async () => {
      const bookingId = 'DMRC-DEMO-PAY-MISSING-CURR';
      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('tok').digest('hex'),
        razorpayQrId: 'pay_missing_curr_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      // Captured payment without INR currency is rejected; status remains PENDING and reconciliationNeeded is flagged
      expect(getData().status).toBe('PENDING');
      expect(getData().reconciliationNeeded).toBe(true);
      expect(getData().ticket).toBeUndefined();
    });

    it('handles captured payment amount mismatch during initial fetch: preserves PENDING, flags reconciliation, issues no ticket', async () => {
      const bookingId = 'DMRC-DEMO-INIT-AMT-MISMATCH';
      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('tok').digest('hex'),
        razorpayQrId: 'qr_initial_amt_mismatch_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      expect(getData().status).toBe('PENDING');
      expect(getData().reconciliationNeeded).toBe(true);
      expect(getData().code).toBe('PAYMENT_PARAMETER_MISMATCH_RECONCILIATION_REQUIRED');
      expect(getData().ticket).toBeUndefined();

      const record = bookingsStore.get(bookingId);
      expect(record.status).toBe('PENDING');
      expect(record.reconciliationNeeded).toBe(true);
      expect(record.reconciliationCapturedPayments).toBeDefined();
      expect(record.reconciliationCapturedPayments[0].paymentId).toBe('pay_init_bad_amt');
      expect(record.reconciliationCapturedPayments[0].reason).toBe('AMOUNT_MISMATCH');
      expect(record.reconciliationCapturedPayments[0].amount).toBe(3000);
      expect(record.reconciliationCapturedPayments[0].expectedAmount).toBe(4000);
      expect(record.reconciliationCapturedPayments[0].currency).toBe('INR');
      expect(record.reconciliationCapturedPayments[0].expectedCurrency).toBe('INR');
      expect(record.reconciliationCapturedPayments[0].qrCodeId).toBe('qr_initial_amt_mismatch_mock');
    });

    it('handles captured payment currency mismatch during initial fetch: preserves PENDING, flags reconciliation, issues no ticket', async () => {
      const bookingId = 'DMRC-DEMO-INIT-CURR-MISMATCH';
      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('tok').digest('hex'),
        razorpayQrId: 'qr_initial_curr_mismatch_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      expect(getData().status).toBe('PENDING');
      expect(getData().reconciliationNeeded).toBe(true);
      expect(getData().code).toBe('PAYMENT_PARAMETER_MISMATCH_RECONCILIATION_REQUIRED');
      expect(getData().ticket).toBeUndefined();

      const record = bookingsStore.get(bookingId);
      expect(record.status).toBe('PENDING');
      expect(record.reconciliationNeeded).toBe(true);
      expect(record.reconciliationCapturedPayments).toBeDefined();
      expect(record.reconciliationCapturedPayments[0].paymentId).toBe('pay_init_bad_curr');
      expect(record.reconciliationCapturedPayments[0].reason).toBe('CURRENCY_MISMATCH');
      expect(record.reconciliationCapturedPayments[0].amount).toBe(4000);
      expect(record.reconciliationCapturedPayments[0].expectedAmount).toBe(4000);
      expect(record.reconciliationCapturedPayments[0].currency).toBe('USD');
      expect(record.reconciliationCapturedPayments[0].expectedCurrency).toBe('INR');
      expect(record.reconciliationCapturedPayments[0].qrCodeId).toBe('qr_initial_curr_mismatch_mock');
    });

    it('handles mixed captures (one valid, one mismatched) during initial fetch: strictly rejects PAID, flags reconciliation, issues no ticket', async () => {
      const bookingId = 'DMRC-DEMO-INIT-MIXED-CAPTURES';
      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('tok').digest('hex'),
        razorpayQrId: 'qr_mixed_valid_and_mismatch_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      // STRICT: Must NOT be PAID despite pay_valid_one being valid!
      expect(getData().status).toBe('PENDING');
      expect(getData().reconciliationNeeded).toBe(true);
      expect(getData().code).toBe('PAYMENT_PARAMETER_MISMATCH_RECONCILIATION_REQUIRED');
      expect(getData().ticket).toBeUndefined();

      const record = bookingsStore.get(bookingId);
      expect(record.status).toBe('PENDING');
      expect(record.reconciliationNeeded).toBe(true);
      // Mismatched payment recorded
      expect(record.reconciliationCapturedPayments).toBeDefined();
      expect(record.reconciliationCapturedPayments).toHaveLength(1);
      expect(record.reconciliationCapturedPayments[0].paymentId).toBe('pay_mismatch_bad_amt');
      expect(record.reconciliationCapturedPayments[0].reason).toBe('AMOUNT_MISMATCH');
      expect(record.razorpayPaymentId).toBeUndefined(); // Never marked as paid
    });

    it('handles multiple mismatched captures during initial fetch: records all mismatches, preserves PENDING', async () => {
      const bookingId = 'DMRC-DEMO-INIT-MULTIPLE-MISMATCH';
      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('tok').digest('hex'),
        razorpayQrId: 'qr_multiple_mismatch_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      expect(getData().status).toBe('PENDING');
      expect(getData().reconciliationNeeded).toBe(true);
      expect(getData().code).toBe('PAYMENT_PARAMETER_MISMATCH_RECONCILIATION_REQUIRED');
      expect(getData().ticket).toBeUndefined();

      const record = bookingsStore.get(bookingId);
      expect(record.status).toBe('PENDING');
      expect(record.reconciliationNeeded).toBe(true);
      expect(record.reconciliationCapturedPayments).toHaveLength(2);
      const ids = record.reconciliationCapturedPayments.map((p: any) => p.paymentId);
      expect(ids).toContain('pay_mult_mismatch_1');
      expect(ids).toContain('pay_mult_mismatch_2');
    });

    it('idempotently handles repeated polling of mismatched payments without duplicating reconciliation records', async () => {
      const bookingId = 'DMRC-DEMO-INIT-IDEMPOTENT-MISMATCH';
      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('tok').digest('hex'),
        razorpayQrId: 'qr_initial_amt_mismatch_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      // First verification call
      const { req: req1, res: res1, getStatusCode: getStatus1 } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });
      await verifyQrHandler(req1, res1);
      expect(getStatus1()).toBe(200);

      const recordAfterFirst = bookingsStore.get(bookingId);
      expect(recordAfterFirst.reconciliationCapturedPayments).toHaveLength(1);

      // Second verification call (simulating polling interval)
      const { req: req2, res: res2, getStatusCode: getStatus2, getData: getData2 } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });
      await verifyQrHandler(req2, res2);
      expect(getStatus2()).toBe(200);
      expect(getData2().status).toBe('PENDING');
      expect(getData2().reconciliationNeeded).toBe(true);

      const recordAfterSecond = bookingsStore.get(bookingId);
      // Must NOT append duplicate record for the same paymentId
      expect(recordAfterSecond.reconciliationCapturedPayments).toHaveLength(1);
      expect(recordAfterSecond.reconciliationCapturedPayments[0].paymentId).toBe('pay_init_bad_amt');
    });

    it('rejects consideration of payment if payment.qr_code_id does not match booking.razorpayQrId', async () => {
      const bookingId = 'DMRC-DEMO-PAY-WRONG-QR-ASSOC';
      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('tok').digest('hex'),
        razorpayQrId: 'pay_wrong_qr_assoc_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      // Mismatched payment ignored; remains PENDING
      expect(getData().status).toBe('PENDING');
    });
  });

  describe('5. State Machine Invariants (EXPIRED/FAILED -> PAID Rejection)', () => {
    it('rejects transitioning EXPIRED booking to PAID (HTTP 409)', async () => {
      const bookingId = 'DMRC-DEMO-EXPIRED-NO-REOPEN';
      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('tok').digest('hex'),
        razorpayQrId: 'qr_captured_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'EXPIRED',
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(409);
      expect(getData().code).toBe('BOOKING_ALREADY_EXPIRED');
    });

    it('records late-captured payment on EXPIRED booking into reconciliationCapturedPayments with reconciliationNeeded flag', async () => {
      const bookingId = 'DMRC-DEMO-EXPIRED-LATE-CAPTURE';
      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('tok').digest('hex'),
        razorpayQrId: 'qr_duplicate_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'EXPIRED',
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(409);
      expect(getData().code).toBe('BOOKING_ALREADY_EXPIRED');
      expect(getData().reconciliationNeeded).toBe(true);

      const record = bookingsStore.get(bookingId);
      expect(record.status).toBe('EXPIRED'); // Terminal status unchanged!
      expect(record.reconciliationCapturedPayments).toBeDefined();
      expect(record.reconciliationCapturedPayments.length).toBeGreaterThan(0);
      expect(record.reconciliationCapturedPayments[0].paymentId).toBe('pay_qr_first');
    });

    it('keeps status PENDING during 15-second grace window past close_by', async () => {
      const bookingId = 'DMRC-DEMO-GRACE-WINDOW';
      const recentCloseBy = Math.floor(Date.now() / 1000) - 5; // 5 seconds ago (within 15s grace)

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('tok').digest('hex'),
        razorpayQrId: 'qr_pending_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
        qrCloseBy: recentCloseBy,
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      expect(getData().status).toBe('PENDING'); // Not expired because within grace buffer
    });

    it('marks booking EXPIRED only after close_by + 15s grace period and QR closed by provider', async () => {
      const bookingId = 'DMRC-DEMO-CLOSED-AFTER-GRACE';
      const expiredCloseBy = Math.floor(Date.now() / 1000) - 25; // 25 seconds ago (outside 15s grace)

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('tok').digest('hex'),
        razorpayQrId: 'qr_closed_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
        qrCloseBy: expiredCloseBy,
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      expect(getData().status).toBe('EXPIRED');
      expect(getData().code).toBe('QR_EXPIRED');
      expect(bookingsStore.get(bookingId).status).toBe('EXPIRED');
    });

    it('keeps booking PENDING if QR is closed before expiry grace period has elapsed', async () => {
      const bookingId = 'DMRC-DEMO-CLOSED-BEFORE-GRACE';
      const futureCloseBy = Math.floor(Date.now() / 1000) + 300; // Still 5 mins in future

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('tok').digest('hex'),
        razorpayQrId: 'qr_closed_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
        qrCloseBy: futureCloseBy,
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      // Closed QR must NOT automatically mean expired before configured close_by + grace period
      expect(getData().status).toBe('PENDING');
      expect(bookingsStore.get(bookingId).status).toBe('PENDING');
    });

    it('returns HTTP 503 when Firestore transaction fails and booking state cannot be re-read', async () => {
      const bookingId = 'DMRC-DEMO-TX-FAIL-UNREADABLE';
      const expiredCloseBy = Math.floor(Date.now() / 1000) - 25;

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('tok').digest('hex'),
        razorpayQrId: 'qr_closed_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
        qrCloseBy: expiredCloseBy,
        forceTransactionFailure: true,
        forceGetFailure: true,
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(503);
      expect(getData().code).toBe('STATE_TRANSITION_UNAVAILABLE');
    });

    it('preserves PAID status when payment is captured during concurrent expiry processing', async () => {
      const bookingId = 'DMRC-DEMO-RACE-CAPTURED-DURING-EXPIRY';
      const expiredCloseBy = Math.floor(Date.now() / 1000) - 25;

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('tok').digest('hex'),
        razorpayQrId: 'qr_closed_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
        qrCloseBy: expiredCloseBy,
        simulateConcurrentPaymentCapture: true, // During transaction, another worker sets PAID
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      expect(getData().status).toBe('PAID');
      expect(getData().ticket).toBeDefined();
    });

    it('handles race condition where payment is captured on Razorpay between initial fetch and expiry commit', async () => {
      const bookingId = 'DMRC-DEMO-RACE-LATE-CAPTURE-PROVIDER';
      const expiredCloseBy = Math.floor(Date.now() / 1000) - 25;
      (globalThis as any).__qrRaceCallCount = 0; // Reset counter

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('tok').digest('hex'),
        razorpayQrId: 'qr_race_late_capture_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
        qrCloseBy: expiredCloseBy,
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      // Must NOT be marked EXPIRED! Late payment was discovered and honored
      expect(getData().status).toBe('PAID');
      expect(getData().ticket).toBeDefined();

      const record = bookingsStore.get(bookingId);
      expect(record.status).toBe('PAID');
      expect(record.razorpayPaymentId).toBe('pay_late_captured_in_race');
    });

    it('handles captured payment amount mismatch during second expiry fetch: prevents EXPIRED, flags reconciliation, issues no ticket', async () => {
      const bookingId = 'DMRC-DEMO-SECOND-FETCH-AMT-MISMATCH';
      const expiredCloseBy = Math.floor(Date.now() / 1000) - 25;
      (globalThis as any).__qrRaceLateAmtCount = 0; // Reset counter

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('tok').digest('hex'),
        razorpayQrId: 'qr_race_late_amount_mismatch_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
        qrCloseBy: expiredCloseBy,
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      // Must NOT be marked EXPIRED, must NOT be PAID
      expect(getData().status).toBe('PENDING');
      expect(getData().reconciliationNeeded).toBe(true);
      expect(getData().code).toBe('PAYMENT_PARAMETER_MISMATCH_RECONCILIATION_REQUIRED');
      expect(getData().ticket).toBeUndefined();

      const record = bookingsStore.get(bookingId);
      expect(record.status).toBe('PENDING'); // Kept in retryable/pending state!
      expect(record.reconciliationNeeded).toBe(true);
      expect(record.reconciliationCapturedPayments).toBeDefined();
      expect(record.reconciliationCapturedPayments[0].paymentId).toBe('pay_late_mismatch_amt');
      expect(record.reconciliationCapturedPayments[0].reason).toBe('AMOUNT_MISMATCH');
      expect(record.reconciliationCapturedPayments[0].amount).toBe(2500);
      expect(record.reconciliationCapturedPayments[0].expectedAmount).toBe(4000);
      expect(record.reconciliationCapturedPayments[0].currency).toBe('INR');
      expect(record.reconciliationCapturedPayments[0].expectedCurrency).toBe('INR');
      expect(record.reconciliationCapturedPayments[0].qrCodeId).toBe('qr_race_late_amount_mismatch_mock');
    });

    it('handles captured payment currency mismatch during second expiry fetch: prevents EXPIRED, flags reconciliation, issues no ticket', async () => {
      const bookingId = 'DMRC-DEMO-SECOND-FETCH-CURR-MISMATCH';
      const expiredCloseBy = Math.floor(Date.now() / 1000) - 25;
      (globalThis as any).__qrRaceLateCurrCount = 0; // Reset counter

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('tok').digest('hex'),
        razorpayQrId: 'qr_race_late_currency_mismatch_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
        qrCloseBy: expiredCloseBy,
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      // Must NOT be marked EXPIRED, must NOT be PAID
      expect(getData().status).toBe('PENDING');
      expect(getData().reconciliationNeeded).toBe(true);
      expect(getData().code).toBe('PAYMENT_PARAMETER_MISMATCH_RECONCILIATION_REQUIRED');
      expect(getData().ticket).toBeUndefined();

      const record = bookingsStore.get(bookingId);
      expect(record.status).toBe('PENDING'); // Kept in retryable/pending state!
      expect(record.reconciliationNeeded).toBe(true);
      expect(record.reconciliationCapturedPayments).toBeDefined();
      expect(record.reconciliationCapturedPayments[0].paymentId).toBe('pay_late_mismatch_curr');
      expect(record.reconciliationCapturedPayments[0].reason).toBe('CURRENCY_MISMATCH');
      expect(record.reconciliationCapturedPayments[0].amount).toBe(4000);
      expect(record.reconciliationCapturedPayments[0].expectedAmount).toBe(4000);
      expect(record.reconciliationCapturedPayments[0].currency).toBe('EUR');
      expect(record.reconciliationCapturedPayments[0].expectedCurrency).toBe('INR');
      expect(record.reconciliationCapturedPayments[0].qrCodeId).toBe('qr_race_late_currency_mismatch_mock');
    });

    it('handles mixed captures (one valid, one mismatched) during second expiry fetch: aborts expiry, strictly rejects PAID, flags reconciliation', async () => {
      const bookingId = 'DMRC-DEMO-SECOND-FETCH-MIXED-CAPTURES';
      const expiredCloseBy = Math.floor(Date.now() / 1000) - 25;
      (globalThis as any).__qrRaceLateMixedCount = 0; // Reset counter

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('tok').digest('hex'),
        razorpayQrId: 'qr_race_late_mixed_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
        qrCloseBy: expiredCloseBy,
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      // STRICT: Must NOT be marked EXPIRED and must NOT be marked PAID despite pay_late_valid being valid
      expect(getData().status).toBe('PENDING');
      expect(getData().reconciliationNeeded).toBe(true);
      expect(getData().code).toBe('PAYMENT_PARAMETER_MISMATCH_RECONCILIATION_REQUIRED');
      expect(getData().ticket).toBeUndefined();

      const record = bookingsStore.get(bookingId);
      expect(record.status).toBe('PENDING');
      expect(record.reconciliationNeeded).toBe(true);
      expect(record.reconciliationCapturedPayments).toBeDefined();
      expect(record.reconciliationCapturedPayments[0].paymentId).toBe('pay_late_mismatch');
      expect(record.reconciliationCapturedPayments[0].reason).toBe('AMOUNT_MISMATCH');
      expect(record.razorpayPaymentId).toBeUndefined(); // Never marked as paid
    });
  });

  describe('6. Duplicate Payments & Concurrency Reconciliation', () => {
    it('selects earliest capture as primary and flags duplicates for reconciliation', async () => {
      const bookingId = 'DMRC-DEMO-DUP-TEST';
      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('dup_tok').digest('hex'),
        razorpayQrId: 'qr_duplicate_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'dup_tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      expect(getData().status).toBe('PAID');

      const record = bookingsStore.get(bookingId);
      expect(record.razorpayPaymentId).toBe('pay_qr_first');
      expect(record.duplicateCapturedPayments).toHaveLength(1);
      expect(record.duplicateCapturedPayments[0].paymentId).toBe('pay_qr_second');
      expect(record.reconciliationNeeded).toBe(true);
    });

    it('ensures primary payment is NEVER recorded as a duplicate during concurrent reconciliation', async () => {
      const bookingId = 'DMRC-DEMO-DUP-RACE';
      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('dup_tok').digest('hex'),
        razorpayQrId: 'qr_duplicate_mock',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'dup_tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      expect(getData().status).toBe('PAID');

      const record = bookingsStore.get(bookingId);
      // pay_qr_first must be primary and NEVER appear in duplicateCapturedPayments
      expect(record.razorpayPaymentId).toBe('pay_qr_first');
      const dupIds = (record.duplicateCapturedPayments || []).map((d: any) => d.paymentId);
      expect(dupIds).not.toContain('pay_qr_first');
      expect(dupIds).toContain('pay_qr_second');
    });

    it('preserves existing primary payment even if later reconciliation returns an earlier payment', async () => {
      const bookingId = 'DMRC-DEMO-PRIMARY-PRESERVED';
      // Booking already marked PAID with primary payment 'pay_existing_primary'
      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('dup_tok').digest('hex'),
        razorpayQrId: 'qr_duplicate_mock',
        razorpayPaymentId: 'pay_existing_primary',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PAID',
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'dup_tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(200);
      expect(getData().status).toBe('PAID');

      const record = bookingsStore.get(bookingId);
      // Primary payment MUST NOT be overwritten
      expect(record.razorpayPaymentId).toBe('pay_existing_primary');
    });

    it('deduplicates duplicate payments idempotently when discovered repeatedly', async () => {
      const bookingId = 'DMRC-DEMO-DUP-IDEMPOTENT';
      const existingDup = {
        paymentId: 'pay_qr_second',
        amount: 4000,
        currency: 'INR',
        capturedAt: 1700000005,
        recordedAt: '2026-11-02T12:00:00.000Z',
      };

      // Booking already has pay_qr_second in duplicateCapturedPayments
      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('dup_tok').digest('hex'),
        razorpayQrId: 'qr_duplicate_mock',
        razorpayPaymentId: 'pay_qr_first',
        duplicateCapturedPayments: [existingDup],
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PAID',
      });

      // Poll again: qr_duplicate_mock returns pay_qr_first and pay_qr_second
      const { req, res, getStatusCode } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'dup_tok' },
        body: { bookingId },
      });

      await verifyQrHandler(req, res);
      expect(getStatusCode()).toBe(200);

      const record = bookingsStore.get(bookingId);
      expect(record.razorpayPaymentId).toBe('pay_qr_first');
      // duplicateCapturedPayments must NOT contain duplicate entries of pay_qr_second
      const duplicatesOfSecond = record.duplicateCapturedPayments.filter(
        (d: any) => d.paymentId === 'pay_qr_second'
      );
      expect(duplicatesOfSecond).toHaveLength(1);
    });

    it('ensures repeated webhook delivery of duplicate payment remains idempotent and never issues multiple tickets', async () => {
      const bookingId = 'DMRC-DEMO-WEBHOOK-DUP-IDEMPOTENT';
      const qrId = 'qr_webhook_credited_1';

      bookingsStore.set(bookingId, {
        bookingId,
        razorpayQrId: qrId,
        razorpayPaymentId: 'pay_primary_orig',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PAID',
      });

      const eventPayload = {
        event: 'qr_code.credited',
        payload: {
          qr_code: { entity: { id: qrId } },
          payment: { entity: { id: 'pay_dup_event', amount: 4000, currency: 'INR', qr_code_id: qrId, status: 'captured' } },
        },
      };

      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      // First webhook delivery of duplicate
      const { req: req1, res: res1, getStatusCode: getStatus1 } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });
      await webhookHandler(req1, res1);
      expect(getStatus1()).toBe(200);

      const recordAfterFirst = bookingsStore.get(bookingId);
      expect(recordAfterFirst.razorpayPaymentId).toBe('pay_primary_orig'); // Never overwritten!
      expect(recordAfterFirst.duplicateCapturedPayments).toHaveLength(1);
      expect(recordAfterFirst.duplicateCapturedPayments[0].paymentId).toBe('pay_dup_event');

      // Second webhook delivery of identical duplicate event
      const { req: req2, res: res2, getStatusCode: getStatus2 } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });
      await webhookHandler(req2, res2);
      expect(getStatus2()).toBe(200);

      const recordAfterSecond = bookingsStore.get(bookingId);
      expect(recordAfterSecond.razorpayPaymentId).toBe('pay_primary_orig');
      // Must not append pay_dup_event twice
      expect(recordAfterSecond.duplicateCapturedPayments).toHaveLength(1);
    });

    it('webhook-first duplicate capture: webhook sets PAID with pay_webhook_first, polling discovers pay_qr_first and records it as duplicate without loss', async () => {
      const bookingId = 'DMRC-DEMO-WEBHOOK-FIRST-RACE';
      const qrId = 'qr_duplicate_mock';
      (globalThis as any).__mockPaymentQrId = qrId;

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('race_tok').digest('hex'),
        razorpayQrId: qrId,
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      // 1. Webhook arrives first with payment pay_webhook_first
      const eventPayload = {
        event: 'qr_code.credited',
        payload: {
          qr_code: { entity: { id: qrId } },
          payment: { entity: { id: 'pay_webhook_first', amount: 4000, currency: 'INR', qr_code_id: qrId, status: 'captured' } },
        },
      };
      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      const { req: whReq, res: whRes, getStatusCode: whStatus } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });
      await webhookHandler(whReq, whRes);
      expect(whStatus()).toBe(200);

      const recordAfterWebhook = bookingsStore.get(bookingId);
      expect(recordAfterWebhook.status).toBe('PAID');
      expect(recordAfterWebhook.razorpayPaymentId).toBe('pay_webhook_first');

      // 2. Client polling verification runs subsequent to webhook.
      // fetchAllPaymentsPaginated for qr_duplicate_mock returns pay_qr_first and pay_qr_second.
      // Polling must NOT overwrite pay_webhook_first and must record BOTH pay_qr_first and pay_qr_second as duplicates!
      const { req: pollReq, res: pollRes, getStatusCode: pollStatus, getData: pollData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'race_tok' },
        body: { bookingId },
      });
      await verifyQrHandler(pollReq, pollRes);
      expect(pollStatus()).toBe(200);
      expect(pollData().status).toBe('PAID');

      const finalRecord = bookingsStore.get(bookingId);
      expect(finalRecord.status).toBe('PAID');
      expect(finalRecord.razorpayPaymentId).toBe('pay_webhook_first'); // Primary payment never overwritten!
      expect(finalRecord.reconciliationNeeded).toBe(true);

      const dupIds = (finalRecord.duplicateCapturedPayments || []).map((d: any) => d.paymentId);
      // Both payments discovered during polling must be recorded as duplicates (neither lost!)
      expect(dupIds).toContain('pay_qr_first');
      expect(dupIds).toContain('pay_qr_second');
      expect(dupIds).not.toContain('pay_webhook_first');
    });

    it('polling-first duplicate capture: polling sets PAID with pay_qr_first, webhook arrives later with pay_qr_second and records it as duplicate', async () => {
      const bookingId = 'DMRC-DEMO-POLLING-FIRST-RACE';
      const qrId = 'qr_duplicate_mock';
      (globalThis as any).__mockPaymentQrId = qrId;

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('race_tok').digest('hex'),
        razorpayQrId: qrId,
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      // 1. Polling verification runs first
      const { req: pollReq, res: pollRes, getStatusCode: pollStatus, getData: pollData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'race_tok' },
        body: { bookingId },
      });
      await verifyQrHandler(pollReq, pollRes);
      expect(pollStatus()).toBe(200);
      expect(pollData().status).toBe('PAID');

      const recordAfterPoll = bookingsStore.get(bookingId);
      expect(recordAfterPoll.status).toBe('PAID');
      expect(recordAfterPoll.razorpayPaymentId).toBe('pay_qr_first');
      expect(recordAfterPoll.duplicateCapturedPayments).toHaveLength(1);
      expect(recordAfterPoll.duplicateCapturedPayments[0].paymentId).toBe('pay_qr_second');

      // 2. Webhook arrives second with pay_qr_second
      const eventPayload = {
        event: 'qr_code.credited',
        payload: {
          qr_code: { entity: { id: qrId } },
          payment: { entity: { id: 'pay_qr_second', amount: 4000, currency: 'INR', qr_code_id: qrId, status: 'captured' } },
        },
      };
      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      const { req: whReq, res: whRes, getStatusCode: whStatus } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });
      await webhookHandler(whReq, whRes);
      expect(whStatus()).toBe(200);

      const finalRecord = bookingsStore.get(bookingId);
      expect(finalRecord.status).toBe('PAID');
      expect(finalRecord.razorpayPaymentId).toBe('pay_qr_first'); // Primary payment never overwritten!
      // Must not append pay_qr_second twice
      expect(finalRecord.duplicateCapturedPayments).toHaveLength(1);
      expect(finalRecord.duplicateCapturedPayments[0].paymentId).toBe('pay_qr_second');
    });

    it('mismatched payment coordination: valid webhook arrives for QR with a mismatched captured payment; strictly blocks PAID and flags reconciliation', async () => {
      const bookingId = 'DMRC-DEMO-WEBHOOK-MISMATCH-BLOCK';
      const qrId = 'qr_mixed_valid_and_mismatch_mock';
      (globalThis as any).__mockPaymentQrId = qrId;

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('mismatch_tok').digest('hex'),
        razorpayQrId: qrId,
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      // Webhook payload carries the valid payment entity pay_valid_one
      const eventPayload = {
        event: 'payment.captured',
        payload: {
          payment: { entity: { id: 'pay_valid_one', amount: 4000, currency: 'INR', qr_code_id: qrId, status: 'captured' } },
        },
      };
      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      const { req, res, getStatusCode, getData } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });
      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(200);
      expect(getData().note).toContain('Payment parameter mismatch detected');

      // Booking MUST remain PENDING; must NOT be marked PAID
      const record = bookingsStore.get(bookingId);
      expect(record.status).toBe('PENDING');
      expect(record.reconciliationNeeded).toBe(true);
      expect(record.razorpayPaymentId).toBeUndefined();
      expect(record.reconciliationCapturedPayments).toBeDefined();
      expect(record.reconciliationCapturedPayments[0].paymentId).toBe('pay_mismatch_bad_amt');
      expect(record.reconciliationCapturedPayments[0].reason).toBe('AMOUNT_MISMATCH');
    });

    it('mismatched payment coordination: polling first flags mismatch, then valid webhook arrives; webhook honors stored mismatch and blocks PAID', async () => {
      const bookingId = 'DMRC-DEMO-POLL-FIRST-MISMATCH-BLOCK';
      const qrId = 'qr_mixed_valid_and_mismatch_mock';
      (globalThis as any).__mockPaymentQrId = qrId;

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('mismatch_tok').digest('hex'),
        razorpayQrId: qrId,
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      // 1. Polling runs first and detects pay_mismatch_bad_amt, leaving booking PENDING with reconciliationNeeded: true
      const { req: pollReq, res: pollRes, getStatusCode: pollStatus } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'mismatch_tok' },
        body: { bookingId },
      });
      await verifyQrHandler(pollReq, pollRes);
      expect(pollStatus()).toBe(200);

      const recordAfterPoll = bookingsStore.get(bookingId);
      expect(recordAfterPoll.status).toBe('PENDING');
      expect(recordAfterPoll.reconciliationNeeded).toBe(true);

      // 2. Webhook arrives second with pay_valid_one
      const eventPayload = {
        event: 'payment.captured',
        payload: {
          payment: { entity: { id: 'pay_valid_one', amount: 4000, currency: 'INR', qr_code_id: qrId, status: 'captured' } },
        },
      };
      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      const { req: whReq, res: whRes, getStatusCode: whStatus } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });
      await webhookHandler(whReq, whRes);
      expect(whStatus()).toBe(200);

      // Booking MUST NOT be marked PAID
      const finalRecord = bookingsStore.get(bookingId);
      expect(finalRecord.status).toBe('PENDING');
      expect(finalRecord.reconciliationNeeded).toBe(true);
      expect(finalRecord.razorpayPaymentId).toBeUndefined();
    });

    it('Fix 1 Regression: mismatched payment\'s own webhook arriving first records mismatch, preserves PENDING, and sets reconciliationNeeded: true', async () => {
      const bookingId = 'DMRC-REG-WEBHOOK-FIRST-MISMATCH';
      const qrId = 'qr_initial_amt_mismatch_mock'; // Provider returns pay_init_bad_amt (3000 paise vs expected 4000)
      (globalThis as any).__mockPaymentQrId = qrId;

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('reg_tok').digest('hex'),
        razorpayQrId: qrId,
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      // Webhook delivers pay_init_bad_amt
      const eventPayload = {
        event: 'payment.captured',
        payload: {
          payment: { entity: { id: 'pay_init_bad_amt', amount: 3000, currency: 'INR', qr_code_id: qrId, status: 'captured' } },
        },
      };
      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      const { req, res, getStatusCode, getData } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });
      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(200);
      expect(getData().note).toContain('Payment parameter mismatch detected');

      const record = bookingsStore.get(bookingId);
      expect(record.status).toBe('PENDING');
      expect(record.reconciliationNeeded).toBe(true);
      expect(record.razorpayPaymentId).toBeUndefined();
      expect(record.reconciliationCapturedPayments).toBeDefined();
      expect(record.reconciliationCapturedPayments).toHaveLength(1);
      expect(record.reconciliationCapturedPayments[0].paymentId).toBe('pay_init_bad_amt');
      expect(record.reconciliationCapturedPayments[0].reason).toBe('AMOUNT_MISMATCH');
      expect(record.reconciliationCapturedPayments[0].amount).toBe(3000);
      expect(record.reconciliationCapturedPayments[0].expectedAmount).toBe(4000);
    });

    it('Fix 1 Regression: valid webhook arriving first while another captured payment is mismatched records mismatch, preserves PENDING, and blocks PAID', async () => {
      const bookingId = 'DMRC-REG-VALID-WH-WITH-MISMATCH';
      const qrId = 'qr_mixed_valid_and_mismatch_mock'; // Provider returns pay_valid_one (4000) and pay_mismatch_bad_amt (2000)
      (globalThis as any).__mockPaymentQrId = qrId;

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('reg_tok').digest('hex'),
        razorpayQrId: qrId,
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      // Webhook delivers the VALID payment pay_valid_one
      const eventPayload = {
        event: 'payment.captured',
        payload: {
          payment: { entity: { id: 'pay_valid_one', amount: 4000, currency: 'INR', qr_code_id: qrId, status: 'captured' } },
        },
      };
      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      const { req, res, getStatusCode, getData } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });
      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(200);
      expect(getData().note).toContain('Payment parameter mismatch detected');

      // Despite pay_valid_one being valid, booking MUST remain PENDING and NOT become PAID
      const record = bookingsStore.get(bookingId);
      expect(record.status).toBe('PENDING');
      expect(record.reconciliationNeeded).toBe(true);
      expect(record.razorpayPaymentId).toBeUndefined();
      expect(record.reconciliationCapturedPayments).toBeDefined();
      expect(record.reconciliationCapturedPayments[0].paymentId).toBe('pay_mismatch_bad_amt');
      expect(record.reconciliationCapturedPayments[0].reason).toBe('AMOUNT_MISMATCH');
    });

    it('Fix 2 Regression: mismatched payment discovered after booking is already PAID preserves PAID status, primary payment ID, and ticket; records mismatch in reconciliationCapturedPayments', async () => {
      const bookingId = 'DMRC-REG-MISMATCH-AFTER-PAID';
      const qrId = 'qr_mixed_valid_and_mismatch_mock'; // Contains pay_valid_one (4000) and pay_mismatch_bad_amt (2000)
      (globalThis as any).__mockPaymentQrId = qrId;

      // Booking was already marked PAID earlier by valid payment
      const existingTicketSignature = 'v2.mock_signature_already_signed_valid';
      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('reg_tok').digest('hex'),
        razorpayQrId: qrId,
        razorpayPaymentId: 'pay_valid_one',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PAID',
        qrPayload: 'mock_qr_payload',
        ticketSignature: existingTicketSignature,
        createdAt: '2026-11-02T10:00:00.000Z',
      });

      // A late webhook arrives for pay_mismatch_bad_amt
      const eventPayload = {
        event: 'payment.captured',
        payload: {
          payment: { entity: { id: 'pay_mismatch_bad_amt', amount: 2000, currency: 'INR', qr_code_id: qrId, status: 'captured' } },
        },
      };
      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      const { req: whReq, res: whRes, getStatusCode: whStatus } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });
      await webhookHandler(whReq, whRes);
      expect(whStatus()).toBe(200);

      // Verify booking state in Firestore:
      const recordAfterWebhook = bookingsStore.get(bookingId);
      expect(recordAfterWebhook.status).toBe('PAID'); // Immutable PAID preserved!
      expect(recordAfterWebhook.razorpayPaymentId).toBe('pay_valid_one'); // Primary payment never overwritten!
      expect(recordAfterWebhook.ticketSignature).toBe(existingTicketSignature); // Ticket signature unchanged!
      expect(recordAfterWebhook.reconciliationNeeded).toBe(true);
      expect(recordAfterWebhook.reconciliationCapturedPayments).toBeDefined();
      expect(recordAfterWebhook.reconciliationCapturedPayments[0].paymentId).toBe('pay_mismatch_bad_amt');

      // Now verify that polling verifyRazorpayQr also preserves PAID and returns verified ticket with reconciliationNeeded: true
      const { req: pollReq, res: pollRes, getStatusCode: pollStatus, getData: pollData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'reg_tok' },
        body: { bookingId },
      });
      await verifyQrHandler(pollReq, pollRes);
      expect(pollStatus()).toBe(200);
      expect(pollData().status).toBe('PAID');
      expect(pollData().success).toBe(true);
      expect(pollData().ticket).toBeDefined();
      expect(pollData().reconciliationNeeded).toBe(true);
    });

    it('Fix 2 Regression: repeated webhook and polling requests do not create duplicate records for the same payment ID', async () => {
      const bookingId = 'DMRC-REG-IDEMPOTENT-RECORDING';
      const qrId = 'qr_mixed_valid_and_mismatch_mock';
      (globalThis as any).__mockPaymentQrId = qrId;

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('reg_tok').digest('hex'),
        razorpayQrId: qrId,
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      const eventPayload = {
        event: 'payment.captured',
        payload: {
          payment: { entity: { id: 'pay_mismatch_bad_amt', amount: 2000, currency: 'INR', qr_code_id: qrId, status: 'captured' } },
        },
      };
      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      // 1. First webhook delivery
      const { req: req1, res: res1 } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });
      await webhookHandler(req1, res1);

      // 2. Second webhook delivery (duplicate webhook)
      const { req: req2, res: res2 } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });
      await webhookHandler(req2, res2);

      // 3. Client polling run 1
      const { req: pReq1, res: pRes1 } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'reg_tok' },
        body: { bookingId },
      });
      await verifyQrHandler(pReq1, pRes1);

      // 4. Client polling run 2
      const { req: pReq2, res: pRes2 } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'reg_tok' },
        body: { bookingId },
      });
      await verifyQrHandler(pReq2, pRes2);

      // Verify that reconciliationCapturedPayments contains pay_mismatch_bad_amt EXACTLY ONCE
      const finalRecord = bookingsStore.get(bookingId);
      expect(finalRecord.reconciliationCapturedPayments).toBeDefined();
      const occurrences = finalRecord.reconciliationCapturedPayments.filter(
        (p: any) => p.paymentId === 'pay_mismatch_bad_amt'
      );
      expect(occurrences).toHaveLength(1);
    });

    it('Fix 1 Regression: provider payment-list fetch failure never allows an unverified PAID transition (fails closed with retryable HTTP 502)', async () => {
      const bookingId = 'DMRC-REG-FAIL-CLOSED-PROVIDER';
      const qrId = 'qr_fetch_payments_fail_mock';
      (globalThis as any).__mockPaymentQrId = qrId;

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('reg_tok').digest('hex'),
        razorpayQrId: qrId,
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
      });

      // Webhook arrives with a payment that appears valid, but provider payment list lookup fails
      const eventPayload = {
        event: 'payment.captured',
        payload: {
          payment: { entity: { id: 'pay_valid_probe', amount: 4000, currency: 'INR', qr_code_id: qrId, status: 'captured' } },
        },
      };
      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      const { req, res, getStatusCode, getData } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });
      await webhookHandler(req, res);

      // MUST fail closed with HTTP 502 and must NOT mark booking PAID
      expect(getStatusCode()).toBe(502);
      expect(getData().error).toContain('Failed to verify complete QR payment set');

      const record = bookingsStore.get(bookingId);
      expect(record.status).toBe('PENDING'); // NEVER transitioned to PAID!
      expect(record.razorpayPaymentId).toBeUndefined();
    });

    it('v11 Regression 1: webhook mismatch-recording transaction failure returns a retryable 5xx and never acknowledges with 200', async () => {
      const bookingId = 'DMRC-REG-WH-WRITE-FAIL';
      const qrId = 'qr_initial_amt_mismatch_mock';
      (globalThis as any).__mockPaymentQrId = qrId;

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('reg_tok').digest('hex'),
        razorpayQrId: qrId,
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
        forceTransactionFailure: true, // Forces Firestore transaction to fail
      });

      const eventPayload = {
        event: 'payment.captured',
        payload: {
          payment: { entity: { id: 'pay_init_bad_amt', amount: 3000, currency: 'INR', qr_code_id: qrId, status: 'captured' } },
        },
      };
      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

      const { req, res, getStatusCode, getData } = createMockReqRes({
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(rawBody, 'utf8'),
      });
      await webhookHandler(req, res);

      // Must NOT return 200; must return retryable 500
      expect(getStatusCode()).toBe(500);
      expect(getData().error).toContain('Failed to record mismatched payment reconciliation');

      // Booking state must NOT be marked PAID
      const record = bookingsStore.get(bookingId);
      expect(record.status).toBe('PENDING');
      expect(record.razorpayPaymentId).toBeUndefined();
    });

    it('v11 Regression 2: polling mismatch-recording transaction failure does not return a false successful reconciliation response', async () => {
      const bookingId = 'DMRC-REG-POLL-WRITE-FAIL';
      const qrId = 'qr_initial_amt_mismatch_mock';

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('reg_tok').digest('hex'),
        razorpayQrId: qrId,
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PENDING',
        forceTransactionFailure: true, // Forces Firestore transaction to fail
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'reg_tok' },
        body: { bookingId },
      });
      await verifyQrHandler(req, res);

      // Must NOT return 200 false success; must return retryable HTTP 503
      expect(getStatusCode()).toBe(503);
      expect(getData().code).toBe('RECONCILIATION_WRITE_FAILED');
      expect(getData().error).toContain('Failed to record payment parameter mismatch reconciliation');

      const record = bookingsStore.get(bookingId);
      expect(record.status).toBe('PENDING');
      expect(record.razorpayPaymentId).toBeUndefined();
    });

    it('v11 Regression 3: two concurrent polling requests discovering the same additional captured payment result in only one persisted record', async () => {
      const bookingId = 'DMRC-REG-CONCURRENT-POLL-DUP';
      const qrId = 'qr_duplicate_mock'; // Returns pay_qr_first and pay_qr_second

      // Booking is already PAID with pay_qr_first as primary payment
      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('reg_tok').digest('hex'),
        razorpayQrId: qrId,
        razorpayPaymentId: 'pay_qr_first',
        duplicateCapturedPayments: [],
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PAID',
        createdAt: '2026-11-02T10:00:00.000Z',
      });

      // Two polling requests run concurrently discovering pay_qr_second
      const { req: req1, res: res1, getStatusCode: status1, getData: data1 } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'reg_tok' },
        body: { bookingId },
      });
      const { req: req2, res: res2, getStatusCode: status2, getData: data2 } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'reg_tok' },
        body: { bookingId },
      });

      await Promise.all([
        verifyQrHandler(req1, res1),
        verifyQrHandler(req2, res2),
      ]);

      expect(status1()).toBe(200);
      expect(status2()).toBe(200);
      expect(data1().status).toBe('PAID');
      expect(data2().status).toBe('PAID');

      // Verify that duplicateCapturedPayments has pay_qr_second EXACTLY ONCE
      const finalRecord = bookingsStore.get(bookingId);
      expect(finalRecord.duplicateCapturedPayments).toBeDefined();
      const occurrences = finalRecord.duplicateCapturedPayments.filter(
        (p: any) => p.paymentId === 'pay_qr_second'
      );
      expect(occurrences).toHaveLength(1);
    });

    it('v11 Regression 4: existing PAID status, primary payment ID, and ticket remain unchanged after concurrent duplicate discovery and mismatch polling', async () => {
      const bookingId = 'DMRC-REG-PAID-IMMUTABILITY';
      const qrId = 'qr_duplicate_mock';

      const initialTicket = formatVerifiedTicket({
        bookingId,
        razorpayPaymentId: 'pay_qr_first',
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PAID',
        createdAt: '2026-11-02T10:00:00.000Z',
        expiresAt: '2026-11-03T10:00:00.000Z',
        sourceId: 'HUDA_CITY_CENTRE',
        sourceName: 'HUDA City Centre',
        destinationId: 'SAMAYPUR_BADLI',
        destinationName: 'Samaypur Badli',
        passengerCount: 1,
        totalFare: 40,
        baseFare: 40,
        ticketType: 'SINGLE',
      });

      bookingsStore.set(bookingId, {
        bookingId,
        guestAccessHash: crypto.createHash('sha256').update('reg_tok').digest('hex'),
        razorpayQrId: qrId,
        razorpayPaymentId: 'pay_qr_first',
        duplicateCapturedPayments: [],
        amountInPaise: 4000,
        currency: 'INR',
        status: 'PAID',
        createdAt: '2026-11-02T10:00:00.000Z',
        expiresAt: '2026-11-03T10:00:00.000Z',
        qrPayload: initialTicket.qrPayload,
        ticketSignature: initialTicket.signature,
        sourceId: 'HUDA_CITY_CENTRE',
        sourceName: 'HUDA City Centre',
        destinationId: 'SAMAYPUR_BADLI',
        destinationName: 'Samaypur Badli',
        passengerCount: 1,
        totalFare: 40,
        baseFare: 40,
        ticketType: 'SINGLE',
      });

      // Poll discovery
      const { req, res, getStatusCode, getData } = createMockReqRes({
        method: 'POST',
        headers: { 'x-guest-access-token': 'reg_tok' },
        body: { bookingId },
      });
      await verifyQrHandler(req, res);

      expect(getStatusCode()).toBe(200);
      const resData = getData();
      expect(resData.status).toBe('PAID');
      expect(resData.ticket.signature).toBe(initialTicket.signature);
      expect(resData.ticket.razorpayPaymentId).toBe('pay_qr_first');

      // State in database must remain immutable:
      const record = bookingsStore.get(bookingId);
      expect(record.status).toBe('PAID');
      expect(record.razorpayPaymentId).toBe('pay_qr_first');
      expect(record.ticketSignature).toBe(initialTicket.signature);
    });
  });

  describe('7. Ticket Cryptographic Signing, Expiry Fields & Tampering Protection', () => {
    it('throws configuration error if TICKET_SIGNING_SECRET is missing in production environment', () => {
      delete process.env.TICKET_SIGNING_SECRET;
      process.env.NODE_ENV = 'production';

      expect(() => getTicketSigningSecrets()).toThrow('CRITICAL_CONFIG_ERROR: TICKET_SIGNING_SECRET must be configured');
    });

    it('signs ticket with active secret covering all security fields (including ticketType & expiresAt)', () => {
      const ticketFields = {
        bookingId: 'BK-12345',
        ticketId: 'BK-12345',
        sourceId: 'HUDA_CITY_CENTRE',
        sourceName: 'HUDA City Centre',
        destinationId: 'SAMAYPUR_BADLI',
        destinationName: 'Samaypur Badli',
        passengerCount: 1,
        baseFare: 60,
        totalFare: 60,
        ticketType: 'RETURN',
        status: 'ACTIVE',
        paymentStatus: 'PAID',
        expiresAt: '2026-11-03T12:00:00.000Z',
        razorpayPaymentId: 'pay_9999',
        createdAt: '2026-11-02T12:00:00.000Z',
        disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
        isDemo: true,
      };

      const signature = signTicketPayload(ticketFields, TEST_TICKET_SECRET);
      expect(signature).toMatch(/^v2\.[a-f0-9]{64}$/);

      const ticketObj = {
        id: ticketFields.ticketId,
        source: { id: ticketFields.sourceId, name: 'HUDA City Centre' },
        destination: { id: ticketFields.destinationId, name: 'Samaypur Badli' },
        passengerCount: ticketFields.passengerCount,
        baseFare: ticketFields.baseFare,
        totalFare: ticketFields.totalFare,
        ticketType: ticketFields.ticketType,
        status: 'ACTIVE' as const,
        paymentStatus: 'PAID' as const,
        expiresAt: ticketFields.expiresAt,
        razorpayPaymentId: ticketFields.razorpayPaymentId,
        createdAt: ticketFields.createdAt,
        disclaimer: ticketFields.disclaimer,
        isDemo: true,
        signature,
      };

      const result = verifyTicketSignature(ticketObj, [TEST_TICKET_SECRET]);
      expect(result.valid).toBe(true);
      expect(result.cryptographicallyVerified).toBe(true);
      expect(result.signatureVersion).toBe('v2');
    });

    it('rejects tampered ticket when ticketType or expiresAt is altered', () => {
      const ticketFields = {
        bookingId: 'BK-12345',
        ticketId: 'BK-12345',
        sourceId: 'HUDA_CITY_CENTRE',
        destinationId: 'SAMAYPUR_BADLI',
        passengerCount: 1,
        totalFare: 60,
        ticketType: 'SINGLE',
        expiresAt: '2026-11-03T12:00:00.000Z',
        razorpayPaymentId: 'pay_9999',
        createdAt: '2026-11-02T12:00:00.000Z',
      };

      const signature = signTicketPayload(ticketFields, TEST_TICKET_SECRET);

      // Attacker attempts to change SINGLE ticket to RETURN ticket with same signature
      const tamperedTicket = {
        id: ticketFields.ticketId,
        source: { id: ticketFields.sourceId, name: 'HUDA City Centre' },
        destination: { id: ticketFields.destinationId, name: 'Samaypur Badli' },
        passengerCount: ticketFields.passengerCount,
        totalFare: 60,
        ticketType: 'RETURN', // Tampered!
        expiresAt: ticketFields.expiresAt,
        razorpayPaymentId: ticketFields.razorpayPaymentId,
        createdAt: ticketFields.createdAt,
        signature,
      };

      const result = verifyTicketSignature(tamperedTicket, [TEST_TICKET_SECRET]);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('SIGNATURE_MISMATCH');
    });

    it('formatVerifiedTicket always generates fresh signature and never reuses stale qrPayload', () => {
      const bookingData = {
        bookingId: 'BK-FRESH-TEST',
        sourceId: 'HUDA_CITY_CENTRE',
        sourceName: 'HUDA City Centre',
        destinationId: 'SAMAYPUR_BADLI',
        destinationName: 'Samaypur Badli',
        passengerCount: 1,
        totalFare: 60,
        ticketType: 'SINGLE',
        razorpayPaymentId: 'pay_fresh_1',
        qrPayload: 'STALE_OLD_PAYLOAD_FROM_PREVIOUS_VERSION', // Should be discarded
      };

      const ticket = formatVerifiedTicket(bookingData);
      expect(ticket.qrPayload).not.toBe('STALE_OLD_PAYLOAD_FROM_PREVIOUS_VERSION');
      expect(ticket.qrPayload).toContain('v2');
      expect(ticket.signature).toBeDefined();

      const parsedPayload = JSON.parse(ticket.qrPayload);
      expect(parsedPayload.signature).toBe(ticket.signature);
    });

    it('verifyTicketSignature reports legacy tickets as valid but cryptographically unverified', () => {
      const legacyTicket = {
        id: 'LEGACY-TICKET-001',
        source: { id: 'HUDA_CITY_CENTRE', name: 'HUDA City Centre' },
        destination: { id: 'SAMAYPUR_BADLI', name: 'Samaypur Badli' },
        passengerCount: 1,
        totalFare: 60,
        createdAt: '2026-11-01T12:00:00.000Z',
        // No signature property
      };

      const result = verifyTicketSignature(legacyTicket, [TEST_TICKET_SECRET]);
      expect(result.valid).toBe(true);
      expect(result.isLegacy).toBe(true);
      expect(result.cryptographicallyVerified).toBe(false);
      expect(result.signatureVersion).toBeUndefined();
    });

    it('verifyTicketSignature reports newly signed tickets as valid and cryptographically verified', () => {
      const ticketFields = {
        bookingId: 'BK-CRYPT-VERIFIED',
        ticketId: 'BK-CRYPT-VERIFIED',
        sourceId: 'HUDA_CITY_CENTRE',
        sourceName: 'HUDA City Centre',
        destinationId: 'SAMAYPUR_BADLI',
        destinationName: 'Samaypur Badli',
        passengerCount: 1,
        baseFare: 60,
        totalFare: 60,
        ticketType: 'SINGLE',
        status: 'ACTIVE',
        paymentStatus: 'PAID',
        expiresAt: '2026-11-03T12:00:00.000Z',
        razorpayPaymentId: 'pay_crypt_1',
        createdAt: '2026-11-02T12:00:00.000Z',
        disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
        isDemo: true,
      };

      const signature = signTicketPayload(ticketFields, TEST_TICKET_SECRET);
      const ticketObj = {
        id: ticketFields.ticketId,
        source: { id: ticketFields.sourceId, name: 'HUDA City Centre' },
        destination: { id: ticketFields.destinationId, name: 'Samaypur Badli' },
        passengerCount: ticketFields.passengerCount,
        baseFare: ticketFields.baseFare,
        totalFare: ticketFields.totalFare,
        ticketType: ticketFields.ticketType,
        status: 'ACTIVE' as const,
        paymentStatus: 'PAID' as const,
        expiresAt: ticketFields.expiresAt,
        razorpayPaymentId: ticketFields.razorpayPaymentId,
        createdAt: ticketFields.createdAt,
        disclaimer: ticketFields.disclaimer,
        isDemo: true,
        signature,
      };

      const result = verifyTicketSignature(ticketObj, [TEST_TICKET_SECRET]);
      expect(result.valid).toBe(true);
      expect(result.isLegacy).toBe(false);
      expect(result.cryptographicallyVerified).toBe(true);
      expect(result.signatureVersion).toBe('v2');
    });

    it('rejects tampered ticket when station name is altered', () => {
      const ticketFields = {
        bookingId: 'BK-STATION-NAME-TAMPER',
        ticketId: 'BK-STATION-NAME-TAMPER',
        sourceId: 'HUDA_CITY_CENTRE',
        sourceName: 'HUDA City Centre',
        destinationId: 'SAMAYPUR_BADLI',
        destinationName: 'Samaypur Badli',
        passengerCount: 1,
        baseFare: 60,
        totalFare: 60,
        ticketType: 'SINGLE',
        status: 'ACTIVE',
        paymentStatus: 'PAID',
        expiresAt: '2026-11-03T12:00:00.000Z',
        razorpayPaymentId: 'pay_crypt_1',
        createdAt: '2026-11-02T12:00:00.000Z',
        disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
        isDemo: true,
      };

      const signature = signTicketPayload(ticketFields, TEST_TICKET_SECRET);
      const tamperedTicket = {
        id: ticketFields.ticketId,
        source: { id: ticketFields.sourceId, name: 'Forged Station Name' }, // Tampered station name!
        destination: { id: ticketFields.destinationId, name: 'Samaypur Badli' },
        passengerCount: ticketFields.passengerCount,
        baseFare: ticketFields.baseFare,
        totalFare: ticketFields.totalFare,
        ticketType: ticketFields.ticketType,
        status: 'ACTIVE' as const,
        paymentStatus: 'PAID' as const,
        expiresAt: ticketFields.expiresAt,
        razorpayPaymentId: ticketFields.razorpayPaymentId,
        createdAt: ticketFields.createdAt,
        disclaimer: ticketFields.disclaimer,
        isDemo: true,
        signature,
      };

      const result = verifyTicketSignature(tamperedTicket, [TEST_TICKET_SECRET]);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('SIGNATURE_MISMATCH');
    });

    it('rejects tampered ticket when baseFare is altered', () => {
      const ticketFields = {
        bookingId: 'BK-BASEFARE-TAMPER',
        ticketId: 'BK-BASEFARE-TAMPER',
        sourceId: 'HUDA_CITY_CENTRE',
        sourceName: 'HUDA City Centre',
        destinationId: 'SAMAYPUR_BADLI',
        destinationName: 'Samaypur Badli',
        passengerCount: 1,
        baseFare: 60,
        totalFare: 60,
        ticketType: 'SINGLE',
        status: 'ACTIVE',
        paymentStatus: 'PAID',
        expiresAt: '2026-11-03T12:00:00.000Z',
        razorpayPaymentId: 'pay_crypt_1',
        createdAt: '2026-11-02T12:00:00.000Z',
        disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
        isDemo: true,
      };

      const signature = signTicketPayload(ticketFields, TEST_TICKET_SECRET);
      const tamperedTicket = {
        id: ticketFields.ticketId,
        source: { id: ticketFields.sourceId, name: 'HUDA City Centre' },
        destination: { id: ticketFields.destinationId, name: 'Samaypur Badli' },
        passengerCount: ticketFields.passengerCount,
        baseFare: 10, // Tampered baseFare!
        totalFare: 60,
        ticketType: ticketFields.ticketType,
        status: 'ACTIVE' as const,
        paymentStatus: 'PAID' as const,
        expiresAt: ticketFields.expiresAt,
        razorpayPaymentId: ticketFields.razorpayPaymentId,
        createdAt: ticketFields.createdAt,
        disclaimer: ticketFields.disclaimer,
        isDemo: true,
        signature,
      };

      const result = verifyTicketSignature(tamperedTicket, [TEST_TICKET_SECRET]);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('SIGNATURE_MISMATCH');
    });

    it('rejects tampered ticket when paymentStatus is altered', () => {
      const ticketFields = {
        bookingId: 'BK-STATUS-TAMPER',
        ticketId: 'BK-STATUS-TAMPER',
        sourceId: 'HUDA_CITY_CENTRE',
        sourceName: 'HUDA City Centre',
        destinationId: 'SAMAYPUR_BADLI',
        destinationName: 'Samaypur Badli',
        passengerCount: 1,
        baseFare: 60,
        totalFare: 60,
        ticketType: 'SINGLE',
        status: 'ACTIVE',
        paymentStatus: 'PAID',
        expiresAt: '2026-11-03T12:00:00.000Z',
        razorpayPaymentId: 'pay_crypt_1',
        createdAt: '2026-11-02T12:00:00.000Z',
        disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
        isDemo: true,
      };

      const signature = signTicketPayload(ticketFields, TEST_TICKET_SECRET);
      const tamperedTicket = {
        id: ticketFields.ticketId,
        source: { id: ticketFields.sourceId, name: 'HUDA City Centre' },
        destination: { id: ticketFields.destinationId, name: 'Samaypur Badli' },
        passengerCount: ticketFields.passengerCount,
        baseFare: 60,
        totalFare: 60,
        ticketType: ticketFields.ticketType,
        status: 'ACTIVE' as const,
        paymentStatus: 'REFUNDED' as any, // Tampered payment status!
        expiresAt: ticketFields.expiresAt,
        razorpayPaymentId: ticketFields.razorpayPaymentId,
        createdAt: ticketFields.createdAt,
        disclaimer: ticketFields.disclaimer,
        isDemo: true,
        signature,
      };

      const result = verifyTicketSignature(tamperedTicket, [TEST_TICKET_SECRET]);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('SIGNATURE_MISMATCH');
    });

    it('rejects tampered ticket when demo disclaimer is altered', () => {
      const ticketFields = {
        bookingId: 'BK-DISCLAIMER-TAMPER',
        ticketId: 'BK-DISCLAIMER-TAMPER',
        sourceId: 'HUDA_CITY_CENTRE',
        sourceName: 'HUDA City Centre',
        destinationId: 'SAMAYPUR_BADLI',
        destinationName: 'Samaypur Badli',
        passengerCount: 1,
        baseFare: 60,
        totalFare: 60,
        ticketType: 'SINGLE',
        status: 'ACTIVE',
        paymentStatus: 'PAID',
        expiresAt: '2026-11-03T12:00:00.000Z',
        razorpayPaymentId: 'pay_crypt_1',
        createdAt: '2026-11-02T12:00:00.000Z',
        disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
        isDemo: true,
      };

      const signature = signTicketPayload(ticketFields, TEST_TICKET_SECRET);
      const tamperedTicket = {
        id: ticketFields.ticketId,
        source: { id: ticketFields.sourceId, name: 'HUDA City Centre' },
        destination: { id: ticketFields.destinationId, name: 'Samaypur Badli' },
        passengerCount: ticketFields.passengerCount,
        baseFare: 60,
        totalFare: 60,
        ticketType: ticketFields.ticketType,
        status: 'ACTIVE' as const,
        paymentStatus: 'PAID' as const,
        expiresAt: ticketFields.expiresAt,
        razorpayPaymentId: ticketFields.razorpayPaymentId,
        createdAt: ticketFields.createdAt,
        disclaimer: 'OFFICIAL VALID METRO PASS', // Attacker removes demo disclaimer!
        isDemo: false,
        signature,
      };

      const result = verifyTicketSignature(tamperedTicket, [TEST_TICKET_SECRET]);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('SIGNATURE_MISMATCH');
    });

    it('deterministically normalizes Firestore Timestamp, Date object, numeric timestamp, and string to produce identical signatures', () => {
      const fixedIso = '2026-11-02T12:00:00.000Z';
      const fixedEpochMs = Date.parse(fixedIso);

      // 1. Raw ISO string
      const bookingWithString = {
        bookingId: 'BK-TIME-DETERMINISM',
        sourceId: 'HUDA_CITY_CENTRE',
        sourceName: 'HUDA City Centre',
        destinationId: 'SAMAYPUR_BADLI',
        destinationName: 'Samaypur Badli',
        passengerCount: 1,
        baseFare: 60,
        totalFare: 60,
        ticketType: 'SINGLE',
        razorpayPaymentId: 'pay_det_1',
        createdAt: fixedIso,
        expiresAt: '2026-11-03T12:00:00.000Z',
      };

      // 2. Firestore Timestamp object with .toDate()
      const bookingWithFirestoreTimestamp = {
        ...bookingWithString,
        createdAt: {
          toDate: () => new Date(fixedEpochMs),
        },
      };

      // 3. JavaScript Date object
      const bookingWithDate = {
        ...bookingWithString,
        createdAt: new Date(fixedEpochMs),
      };

      // 4. Numeric timestamp (milliseconds)
      const bookingWithNumber = {
        ...bookingWithString,
        createdAt: fixedEpochMs,
      };

      const ticket1 = formatVerifiedTicket(bookingWithString);
      const ticket2 = formatVerifiedTicket(bookingWithFirestoreTimestamp);
      const ticket3 = formatVerifiedTicket(bookingWithDate);
      const ticket4 = formatVerifiedTicket(bookingWithNumber);

      // All must produce identical createdAt
      expect(ticket1.createdAt).toBe(fixedIso);
      expect(ticket2.createdAt).toBe(fixedIso);
      expect(ticket3.createdAt).toBe(fixedIso);
      expect(ticket4.createdAt).toBe(fixedIso);

      // All must produce identical cryptographic signatures
      expect(ticket1.signature).toBe(ticket2.signature);
      expect(ticket2.signature).toBe(ticket3.signature);
      expect(ticket3.signature).toBe(ticket4.signature);

      // QR payload string must be 100% byte-for-byte identical across repeated formats
      expect(ticket1.qrPayload).toBe(ticket2.qrPayload);
      expect(ticket2.qrPayload).toBe(ticket3.qrPayload);
      expect(ticket3.qrPayload).toBe(ticket4.qrPayload);

      // QR payload signature & core fields must be identical
      const p1 = JSON.parse(ticket1.qrPayload);
      const p2 = JSON.parse(ticket2.qrPayload);
      expect(p1.signature).toBe(p2.signature);
      expect(p1.bookingId).toBe(p2.bookingId);
      expect(p1.totalFare).toBe(p2.totalFare);
      expect(p1.verifiedAt).toBe(fixedIso);
    });

    it('formats the same booking multiple times and compares complete output for byte-for-byte identity', () => {
      const fixedIso = '2026-11-02T15:30:45.123Z';
      const booking = {
        bookingId: 'BK-BYTE-IDENTITY-CHECK',
        sourceId: 'RAJIV_CHOWK',
        sourceName: 'Rajiv Chowk',
        destinationId: 'KASHMERE_GATE',
        destinationName: 'Kashmere Gate',
        passengerCount: 2,
        baseFare: 40,
        totalFare: 80,
        ticketType: 'SINGLE',
        razorpayPaymentId: 'pay_byte_identical_1',
        razorpayOrderId: 'order_byte_identical_1',
        createdAt: fixedIso,
        expiresAt: '2026-11-03T15:30:45.123Z',
      };

      const run1 = formatVerifiedTicket(booking);
      // Introduce an artificial delay to confirm no dependence on system clock
      const run2 = formatVerifiedTicket(booking);
      const run3 = formatVerifiedTicket(booking);

      // 1. createdAt must be byte-for-byte identical
      expect(run1.createdAt).toBe(fixedIso);
      expect(run2.createdAt).toBe(run1.createdAt);
      expect(run3.createdAt).toBe(run1.createdAt);

      // 2. signature must be byte-for-byte identical
      expect(run1.signature).toBe(run2.signature);
      expect(run2.signature).toBe(run3.signature);

      // 3. Complete qrPayload string must be 100% byte-for-byte identical
      expect(run1.qrPayload).toBe(run2.qrPayload);
      expect(run2.qrPayload).toBe(run3.qrPayload);

      // 4. Verify verifiedAt within payload matches createdAt
      const parsed1 = JSON.parse(run1.qrPayload);
      const parsed2 = JSON.parse(run2.qrPayload);
      expect(parsed1.verifiedAt).toBe(fixedIso);
      expect(parsed2.verifiedAt).toBe(parsed2.verifiedAt);
    });
  });

  describe('8. Test vs Live Mode Configuration & Dynamic QR Segregation', () => {
    const origEnv = process.env;

    beforeEach(() => {
      process.env = { ...origEnv };
    });

    afterEach(() => {
      process.env = origEnv;
    });

    it('accepts correct TEST credentials with rzp_test_ prefix when PAYMENT_MODE=TEST', async () => {
      process.env.PAYMENT_MODE = 'TEST';
      process.env.RAZORPAY_KEY_ID = 'rzp_test_valid12345678';
      process.env.RAZORPAY_KEY_SECRET = 'secret12345678';
      process.env.ENABLE_LIVE_DYNAMIC_QR = 'false';

      const config = getRazorpayConfig();
      expect(config).not.toBeNull();
      expect(config?.isLive).toBe(false);
      expect(config?.paymentMode).toBe('TEST');
      expect(config?.keyId).toBe('rzp_test_valid12345678');
    });

    it('accepts correct LIVE credentials with rzp_live_ prefix when PAYMENT_MODE=LIVE', async () => {
      process.env.PAYMENT_MODE = 'LIVE';
      process.env.RAZORPAY_KEY_ID = 'rzp_live_valid12345678';
      process.env.RAZORPAY_KEY_SECRET = 'secret12345678';
      process.env.ENABLE_LIVE_DYNAMIC_QR = 'true';

      const config = getRazorpayConfig();
      expect(config).not.toBeNull();
      expect(config?.isLive).toBe(true);
      expect(config?.paymentMode).toBe('LIVE');
      expect(config?.liveQrEnabled).toBe(true);
    });

    it('rejects test key used in LIVE mode (fails closed)', async () => {
      process.env.PAYMENT_MODE = 'LIVE';
      process.env.RAZORPAY_KEY_ID = 'rzp_test_cannot_be_used_in_live';
      process.env.RAZORPAY_KEY_SECRET = 'secret12345678';

      expect(() => getRazorpayConfig()).toThrow('CONFIG_MISMATCH: Test key (rzp_test_...) cannot be used when PAYMENT_MODE is LIVE');
    });

    it('rejects live key used in TEST mode (fails closed)', async () => {
      process.env.PAYMENT_MODE = 'TEST';
      process.env.RAZORPAY_KEY_ID = 'rzp_live_cannot_be_used_in_test';
      process.env.RAZORPAY_KEY_SECRET = 'secret12345678';

      expect(() => getRazorpayConfig()).toThrow('CONFIG_MISMATCH: Live key (rzp_live_...) cannot be used when PAYMENT_MODE is TEST');
    });

    it('fails closed when credentials are missing', async () => {
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;

      const config = getRazorpayConfig();
      expect(config).toBeNull();
    });

    it('fails closed when key prefix is unrecognized', async () => {
      process.env.PAYMENT_MODE = 'TEST';
      process.env.RAZORPAY_KEY_ID = 'invalid_prefix_12345';
      process.env.RAZORPAY_KEY_SECRET = 'secret12345678';

      expect(() => getRazorpayConfig()).toThrow('INVALID_KEY_PREFIX');
    });

    it('blocks Live Dynamic QR creation if ENABLE_LIVE_DYNAMIC_QR is false (HTTP 403)', async () => {
      process.env.PAYMENT_MODE = 'LIVE';
      process.env.RAZORPAY_KEY_ID = 'rzp_live_real_merchant_key';
      process.env.RAZORPAY_KEY_SECRET = 'secret12345678';
      process.env.ENABLE_LIVE_DYNAMIC_QR = 'false';

      const { req, res, getStatusCode, getData } = createMockReqRes({
        body: {
          sourceId: 'HUDA_CITY_CENTRE',
          destinationId: 'SAMAYPUR_BADLI',
          passengerCount: 1,
        },
      });

      await createQrHandler(req, res);

      expect(getStatusCode()).toBe(403);
      expect(getData().code).toBe('DYNAMIC_QR_LIVE_DISABLED');
    });

    it('allows Live Dynamic QR creation when ENABLE_LIVE_DYNAMIC_QR is true and mock Razorpay succeeds', async () => {
      process.env.PAYMENT_MODE = 'LIVE';
      process.env.RAZORPAY_KEY_ID = 'rzp_live_real_merchant_key';
      process.env.RAZORPAY_KEY_SECRET = 'secret12345678';
      process.env.ENABLE_LIVE_DYNAMIC_QR = 'true';

      const { req, res, getStatusCode, getData } = createMockReqRes({
        body: {
          sourceId: 'HUDA_CITY_CENTRE',
          destinationId: 'SAMAYPUR_BADLI',
          passengerCount: 1,
        },
      });

      await createQrHandler(req, res);

      expect(getStatusCode()).toBe(200);
      const json = getData();
      expect(json.qrId).toBeDefined();
      expect(json.paymentMode).toBe('LIVE');
      expect(json.disclaimer).toBe('DEMO — NOT VALID FOR METRO TRAVEL');
    });

    it('simulates verified live payment capture and issues DEMO ticket with disclaimer', async () => {
      process.env.PAYMENT_MODE = 'LIVE';
      process.env.RAZORPAY_KEY_ID = 'rzp_live_real_merchant_key';
      process.env.RAZORPAY_KEY_SECRET = 'secret12345678';
      process.env.ENABLE_LIVE_DYNAMIC_QR = 'true';

      const bookingId = 'DMRC-LIVE-VERIFY-TICKET-DEMO';
      const qrId = 'qr_live_sim_123';
      const _paymentId = 'pay_live_actual_captured_1';

      bookingsStore.set(bookingId, {
        bookingId,
        sourceId: 'RAJIV_CHOWK',
        sourceName: 'Rajiv Chowk',
        destinationId: 'KASHMERE_GATE',
        destinationName: 'Kashmere Gate',
        passengerCount: 1,
        baseFare: 40,
        totalFare: 40,
        amountInPaise: 4000,
        currency: 'INR',
        paymentMethod: 'UPI_QR',
        razorpayQrId: qrId,
        status: 'PENDING',
        isDemo: true,
        disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
        createdAt: '2026-11-03T00:00:00.000Z',
        expiresAt: '2026-11-04T00:00:00.000Z',
        guestAccessHash: crypto.createHash('sha256').update('guest_live_secret').digest('hex'),
      });

      const { req, res, getStatusCode, getData } = createMockReqRes({
        headers: {
          'x-guest-access-token': 'guest_live_secret',
        },
        body: {
          bookingId,
        },
      });

      await verifyQrHandler(req, res);

      expect(getStatusCode()).toBe(200);
      const json = getData();
      expect(json.status).toBe('PAID');
      expect(json.ticket).toBeDefined();
      expect(json.ticket.isDemo).toBe(true);
      expect(json.ticket.disclaimer).toBe('DEMO — NOT VALID FOR METRO TRAVEL');
      expect(json.ticket.signature).toMatch(/^v2\.[a-f0-9]{64}$/);
    });

    it('uses RAZORPAY_TEST_WEBHOOK_SECRET when PAYMENT_MODE=TEST', async () => {
      process.env.PAYMENT_MODE = 'TEST';
      process.env.RAZORPAY_KEY_ID = 'rzp_test_valid12345678';
      process.env.RAZORPAY_KEY_SECRET = 'secret12345678';
      process.env.RAZORPAY_TEST_WEBHOOK_SECRET = 'test_webhook_isolated_secret_111';
      process.env.RAZORPAY_LIVE_WEBHOOK_SECRET = 'live_webhook_isolated_secret_999';
      delete process.env.RAZORPAY_WEBHOOK_SECRET;

      const config = getRazorpayConfig();
      expect(config?.webhookSecret).toBe('test_webhook_isolated_secret_111');

      const payload = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_test_webhook_verified_1',
              order_id: 'order_test_unmatched_1',
              amount: 4000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      });

      // Signature created with TEST secret must be valid
      const validTestSig = crypto.createHmac('sha256', 'test_webhook_isolated_secret_111').update(payload).digest('hex');
      const { req, res, getStatusCode } = createMockReqRes({
        headers: {
          'x-razorpay-signature': validTestSig,
        },
        body: payload,
      });

      await webhookHandler(req, res);
      // Fails later on missing DB booking (HTTP 200 acknowledgment with note), not signature failure (HTTP 400)
      expect(getStatusCode()).toBe(200);

      // Signature created with LIVE secret must be strictly rejected
      const invalidLiveSig = crypto.createHmac('sha256', 'live_webhook_isolated_secret_999').update(payload).digest('hex');
      const { req: reqBad, res: resBad, getStatusCode: getCodeBad } = createMockReqRes({
        headers: {
          'x-razorpay-signature': invalidLiveSig,
        },
        body: payload,
      });

      await webhookHandler(reqBad, resBad);
      expect(getCodeBad()).toBe(400);
    });

    it('uses RAZORPAY_LIVE_WEBHOOK_SECRET when PAYMENT_MODE=LIVE', async () => {
      process.env.PAYMENT_MODE = 'LIVE';
      process.env.RAZORPAY_KEY_ID = 'rzp_live_valid12345678';
      process.env.RAZORPAY_KEY_SECRET = 'secret12345678';
      process.env.ENABLE_LIVE_DYNAMIC_QR = 'true';
      process.env.RAZORPAY_TEST_WEBHOOK_SECRET = 'test_webhook_isolated_secret_111';
      process.env.RAZORPAY_LIVE_WEBHOOK_SECRET = 'live_webhook_isolated_secret_999';
      delete process.env.RAZORPAY_WEBHOOK_SECRET;

      const config = getRazorpayConfig();
      expect(config?.webhookSecret).toBe('live_webhook_isolated_secret_999');

      const payload = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_live_webhook_verified_1',
              order_id: 'order_live_unmatched_1',
              amount: 4000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      });

      // Signature created with LIVE secret must be valid
      const validLiveSig = crypto.createHmac('sha256', 'live_webhook_isolated_secret_999').update(payload).digest('hex');
      const { req, res, getStatusCode } = createMockReqRes({
        headers: {
          'x-razorpay-signature': validLiveSig,
        },
        body: payload,
      });

      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(200);

      // Signature created with TEST secret must be strictly rejected
      const invalidTestSig = crypto.createHmac('sha256', 'test_webhook_isolated_secret_111').update(payload).digest('hex');
      const { req: reqBad, res: resBad, getStatusCode: getCodeBad } = createMockReqRes({
        headers: {
          'x-razorpay-signature': invalidTestSig,
        },
        body: payload,
      });

      await webhookHandler(reqBad, resBad);
      expect(getCodeBad()).toBe(400);
    });

    it('fails closed when active mode webhook secret is completely missing', async () => {
      process.env.PAYMENT_MODE = 'TEST';
      process.env.RAZORPAY_KEY_ID = 'rzp_test_valid12345678';
      process.env.RAZORPAY_KEY_SECRET = 'secret12345678';
      delete process.env.RAZORPAY_TEST_WEBHOOK_SECRET;
      delete process.env.RAZORPAY_WEBHOOK_SECRET;

      const { req, res, getStatusCode, getData } = createMockReqRes({
        headers: {
          'x-razorpay-signature': 'some_sig',
        },
        body: JSON.stringify({ event: 'payment.captured' }),
      });

      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(500);
      expect(getData().error).toBe('Webhook secret is not configured on server.');
    });
  });
});
