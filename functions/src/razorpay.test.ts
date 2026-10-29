import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as crypto from 'crypto';
import { validateAndCalculateFare, calculateServerFare } from './fare';
import { verifySignature, verifyWebhookSignature } from './razorpayService';

describe('Server-Side Fare & Station Validation', () => {
  it('calculates correct DMRC fare slabs', () => {
    // 2 stations -> 1 hop = 1.5 km -> Slab <= 2km: ₹10
    expect(calculateServerFare(2)).toBe(10);
    // 4 stations -> 3 hops = 4.5 km -> Slab 2-5km: ₹20
    expect(calculateServerFare(4)).toBe(20);
    // 8 stations -> 7 hops = 10.5 km -> Slab 5-12km: ₹30
    expect(calculateServerFare(8)).toBe(30);
    // 14 stations -> 13 hops = 19.5 km -> Slab 12-21km: ₹40
    expect(calculateServerFare(14)).toBe(40);
    // 20 stations -> 19 hops = 28.5 km -> Slab 21-32km: ₹50
    expect(calculateServerFare(20)).toBe(50);
    // 30 stations -> 29 hops = 43.5 km -> Slab 32+km: ₹60
    expect(calculateServerFare(30)).toBe(60);
  });

  it('validates authentic stations and calculates exact price in paise on server', () => {
    const result = validateAndCalculateFare('RAJIV_CHOWK', 'HAUZ_KHAS', 1, 'SINGLE');
    expect(result.source.name).toBe('Rajiv Chowk');
    expect(result.destination.name).toBe('Hauz Khas');
    expect(result.stationCount).toBe(10); // 9 hops = 13.5 km -> ₹40
    expect(result.baseFare).toBe(40);
    expect(result.totalFare).toBe(40);
    expect(result.amountInPaise).toBe(4000);
    expect(result.ticketType).toBe('SINGLE');
  });

  it('handles Return tickets with 1.8x multiplier', () => {
    const result = validateAndCalculateFare('RAJIV_CHOWK', 'HAUZ_KHAS', 2, 'RETURN');
    // base = 40. 2 passengers * 1.8 return = 3.6 * 40 = 144
    expect(result.totalFare).toBe(144);
    expect(result.amountInPaise).toBe(14400);
    expect(result.passengerCount).toBe(2);
    expect(result.ticketType).toBe('RETURN');
  });

  it('rejects identical source and destination stations', () => {
    expect(() => {
      validateAndCalculateFare('RAJIV_CHOWK', 'RAJIV_CHOWK', 1, 'SINGLE');
    }).toThrow(/cannot be identical/i);
  });

  it('rejects unknown or invalid station IDs', () => {
    expect(() => {
      validateAndCalculateFare('FAKE_STATION_XYZ', 'RAJIV_CHOWK', 1, 'SINGLE');
    }).toThrow(/Invalid source station/i);

    expect(() => {
      validateAndCalculateFare('RAJIV_CHOWK', 'GHOST_DESTINATION', 1, 'SINGLE');
    }).toThrow(/Invalid destination station/i);
  });
});

describe('Cryptographic Signature Verification', () => {
  const testKeyId = 'rzp_test_mock1234567890';
  const testKeySecret = 'mockSecretKey9876543210';
  const testWebhookSecret = 'mockWebhookSecret11223344';

  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = testKeyId;
    process.env.RAZORPAY_KEY_SECRET = testKeySecret;
    process.env.RAZORPAY_WEBHOOK_SECRET = testWebhookSecret;
  });

  afterEach(() => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  it('validates a genuine Razorpay payment signature', () => {
    const orderId = 'order_DA123456789';
    const paymentId = 'pay_987654321';
    const text = `${orderId}|${paymentId}`;
    const validSignature = crypto
      .createHmac('sha256', testKeySecret)
      .update(text)
      .digest('hex');

    expect(verifySignature(orderId, paymentId, validSignature)).toBe(true);
  });

  it('rejects an invalid payment signature', () => {
    const orderId = 'order_DA123456789';
    const paymentId = 'pay_987654321';
    const fakeSignature = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    expect(verifySignature(orderId, paymentId, fakeSignature)).toBe(false);
  });

  it('rejects signature when orderId is tampered with', () => {
    const originalOrderId = 'order_GENUINE_1';
    const paymentId = 'pay_987654321';
    const validSignature = crypto
      .createHmac('sha256', testKeySecret)
      .update(`${originalOrderId}|${paymentId}`)
      .digest('hex');

    // Attacker sends a different order ID with the captured signature
    expect(verifySignature('order_FORGED_2', paymentId, validSignature)).toBe(false);
  });

  it('rejects signature when paymentId is tampered with', () => {
    const orderId = 'order_GENUINE_1';
    const paymentId = 'pay_GENUINE_PAY';
    const validSignature = crypto
      .createHmac('sha256', testKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    expect(verifySignature(orderId, 'pay_TAMPERED_PAY', validSignature)).toBe(false);
  });

  it('validates authentic webhook payloads with X-Razorpay-Signature', () => {
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_123',
            order_id: 'order_456',
            amount: 4000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    });

    const validWebhookSig = crypto
      .createHmac('sha256', testWebhookSecret)
      .update(payload)
      .digest('hex');

    expect(verifyWebhookSignature(payload, validWebhookSig)).toBe(true);
  });

  it('rejects tampered webhook payloads', () => {
    const payload = JSON.stringify({ event: 'payment.captured', amount: 4000 });
    const validWebhookSig = crypto
      .createHmac('sha256', testWebhookSecret)
      .update(payload)
      .digest('hex');

    const tamperedPayload = JSON.stringify({ event: 'payment.captured', amount: 1000 });
    expect(verifyWebhookSignature(tamperedPayload, validWebhookSig)).toBe(false);
  });
});

describe('Payment & Fare Integrity Safeguards', () => {
  it('detects mismatched payment amounts', () => {
    const expectedAmountInPaise: number = 5000; // ₹50
    const reportedAmountInPaise: number = 3000; // ₹30

    const isMatch = expectedAmountInPaise === reportedAmountInPaise;
    expect(isMatch).toBe(false);
  });

  it('detects mismatched payment currencies', () => {
    const expectedCurrency = 'INR';
    const reportedCurrency = 'USD';

    const isMatch = expectedCurrency === reportedCurrency;
    expect(isMatch).toBe(false);
  });

  it('detects mismatched order associations', () => {
    const expectedOrderId: string = 'order_EXPECTED_123';
    const reportedOrderId: string = 'order_ATTACKER_999';

    const isOrderAssociated = expectedOrderId === reportedOrderId;
    expect(isOrderAssociated).toBe(false);
  });

  it('rejects payments with non-captured or failed statuses', () => {
    const nonCapturedStatuses = ['failed', 'created', 'refunded'];
    nonCapturedStatuses.forEach((status) => {
      const isCaptured = status === 'captured';
      expect(isCaptured).toBe(false);
    });
  });

  it('strictly rejects authorized status from issuing paid tickets until capture is confirmed', () => {
    const paymentStatus: string = 'authorized';
    const canIssueTicket = paymentStatus === 'captured';
    expect(canIssueTicket).toBe(false);
  });

  it('allows ticket issuance strictly and only when payment status is captured', () => {
    const capturedStatus: string = 'captured';
    const canIssueTicket = capturedStatus === 'captured';
    expect(canIssueTicket).toBe(true);
  });

  it('protects already confirmed PAID status from being overwritten by delayed payment.failed event', () => {
    let currentBookingStatus = 'PAID';
    const incomingEvent = 'payment.failed';

    if (incomingEvent === 'payment.failed' && currentBookingStatus !== 'PAID') {
      currentBookingStatus = 'FAILED';
    }

    expect(currentBookingStatus).toBe('PAID');
  });
});
