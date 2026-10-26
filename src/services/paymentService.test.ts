import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadRazorpayCheckoutScript,
  createPaymentOrder,
  verifyServerPayment,
} from './paymentService';

describe('paymentService (Client Razorpay Integration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete (window as any).Razorpay;
  });

  it('loadRazorpayCheckoutScript returns true immediately if window.Razorpay exists', async () => {
    (window as any).Razorpay = class DummyRazorpay {};
    const loaded = await loadRazorpayCheckoutScript();
    expect(loaded).toBe(true);
  });

  it('createPaymentOrder sends source, destination, passengerCount, and ticketType without client amount', async () => {
    const mockResponse = {
      success: true,
      bookingId: 'DMRC-DEMO-202610-ABC123',
      orderId: 'order_test_123',
      amount: 10000,
      currency: 'INR',
      keyId: 'rzp_test_public_key',
      fareInRupees: 100,
      sourceName: 'Kashmere Gate',
      destinationName: 'Botanical Garden',
      passengerCount: 2,
      ticketType: 'SINGLE',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await createPaymentOrder({
      sourceId: 'KASHMERE_GATE',
      destinationId: 'BOTANICAL_GARDEN',
      passengerCount: 2,
      ticketType: 'SINGLE',
      idToken: 'mock-firebase-token',
    });

    expect(result.orderId).toBe('order_test_123');
    expect(result.amount).toBe(10000);
    expect(result.keyId).toBe('rzp_test_public_key');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toContain('/createRazorpayOrder');
    expect(options?.method).toBe('POST');
    expect((options?.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer mock-firebase-token'
    );

    const body = JSON.parse(options?.body as string);
    // Explicitly verify client never passes fare or amount to server
    expect(body.amount).toBeUndefined();
    expect(body.fare).toBeUndefined();
    expect(body.sourceId).toBe('KASHMERE_GATE');
    expect(body.destinationId).toBe('BOTANICAL_GARDEN');
  });

  it('createPaymentOrder throws error when server returns failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid source station' }),
    } as Response);

    await expect(
      createPaymentOrder({
        sourceId: 'INVALID_ID',
        destinationId: 'BOTANICAL_GARDEN',
        passengerCount: 1,
        ticketType: 'SINGLE',
      })
    ).rejects.toThrow('Invalid source station');
  });

  it('verifyServerPayment submits bookingId, paymentId, and signature for verification', async () => {
    const mockVerifyResponse = {
      success: true,
      status: 'PAID' as const,
      bookingId: 'DMRC-DEMO-202610-ABC123',
      ticket: {
        id: 'DMRC-DEMO-202610-ABC123',
        status: 'PAID',
      },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockVerifyResponse,
    } as Response);

    const result = await verifyServerPayment({
      bookingId: 'DMRC-DEMO-202610-ABC123',
      razorpayPaymentId: 'pay_test_999',
      razorpaySignature: 'sig_test_valid',
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('PAID');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toContain('/verifyRazorpayPayment');
    const body = JSON.parse(options?.body as string);
    expect(body.bookingId).toBe('DMRC-DEMO-202610-ABC123');
    expect(body.razorpayPaymentId).toBe('pay_test_999');
    expect(body.razorpaySignature).toBe('sig_test_valid');
  });

  it('verifyServerPayment throws when signature verification fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Payment signature verification failed' }),
    } as Response);

    await expect(
      verifyServerPayment({
        bookingId: 'DMRC-DEMO-202610-ABC123',
        razorpayPaymentId: 'pay_test_999',
        razorpaySignature: 'sig_invalid',
      })
    ).rejects.toThrow('Payment signature verification failed');
  });
});
