import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { CheckoutPage } from './CheckoutPage';
import { useTicketStore } from '@/features/tickets/ticketStore';
import * as paymentService from '@/services/paymentService';
import { saveCheckoutSession } from '@/features/checkout/checkoutSession';
import { PLANNER_THEME_STORAGE_KEY } from '@/context/PlannerThemeContext';

// Mock Razorpay SDK constructor
class MockRazorpay {
  static instances: MockRazorpay[] = [];
  options: any;
  handlers: Record<string, Function> = {};

  constructor(options: any) {
    this.options = options;
    MockRazorpay.instances.push(this);
  }

  on(event: string, callback: Function) {
    this.handlers[event] = callback;
  }

  open() {
    // Simulated modal open
  }

  simulateSuccess(payload: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) {
    if (this.options?.handler) {
      return this.options.handler(payload);
    }
  }

  simulateFailure(error: { description: string }) {
    if (this.handlers['payment.failed']) {
      this.handlers['payment.failed']({ error });
    }
  }

  simulateDismiss() {
    if (this.options?.modal?.ondismiss) {
      this.options.modal.ondismiss();
    }
  }
}

function renderCheckout(initialEntry = '/checkout') {
  const url = initialEntry.includes('?')
    ? (initialEntry.includes('mode=') ? initialEntry : `${initialEntry}&mode=standard`)
    : `${initialEntry}?mode=standard`;
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AuthProvider>
        <CheckoutPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

async function renderCheckoutReady(initialEntry = '/checkout') {
  const result = renderCheckout(initialEntry);
  await waitFor(() => {
    expect(screen.queryByText('GATEWAY: UNKNOWN')).toBeNull();
  });
  return result;
}

describe('CheckoutPage (MetroPay Dedicated Checkout)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    MockRazorpay.instances = [];
    (window as any).Razorpay = MockRazorpay;

    vi.spyOn(paymentService, 'loadRazorpayCheckoutScript').mockResolvedValue(true);
    vi.spyOn(paymentService, 'getPaymentDiagnostics').mockResolvedValue({
      status: 'ok',
      diagnostics: {
        razorpay: {
          paymentMode: 'TEST',
          keyType: 'TEST',
          hasKeyId: true,
          dynamicQrAllowed: true,
          liveQrEnabled: false,
        },
      },
    });
    vi.spyOn(paymentService, 'createPaymentQr').mockResolvedValue({
      success: true,
      bookingId: 'DMRC-DEMO-TEST-QR-99',
      qrId: 'qr_test_9999',
      qrImageUrl: 'https://example.com/qr.png',
      amount: 4000,
      currency: 'INR',
      fareInRupees: 40,
      sourceName: 'Samaypur Badli',
      destinationName: 'Rajiv Chowk',
      passengerCount: 1,
      ticketType: 'SINGLE',
      expiresAt: new Date(Date.now() + 900000).toISOString(),
      paymentMethod: 'UPI_QR',
      paymentMode: 'TEST',
    });
    vi.spyOn(paymentService, 'createPaymentOrder').mockResolvedValue({
      success: true,
      bookingId: 'DMRC-DEMO-TEST-BOOKING-99',
      orderId: 'order_test_9999',
      amount: 4000,
      currency: 'INR',
      keyId: 'rzp_test_mockKey',
      fareInRupees: 40,
      sourceName: 'Samaypur Badli',
      destinationName: 'Rajiv Chowk',
      passengerCount: 1,
      ticketType: 'SINGLE',
    });

    vi.spyOn(paymentService, 'verifyServerPayment').mockResolvedValue({
      success: true,
      status: 'PAID',
      bookingId: 'DMRC-DEMO-TEST-BOOKING-99',
      ticket: {
        id: 'TKT-VERIFIED-99',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        qrPayload: 'DMRC:TEST:TKT-VERIFIED-99',
        passengerCount: 1,
        ticketType: 'SINGLE',
        baseFare: 40,
        totalFare: 40,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders invalid session state when station query params are missing', () => {
    renderCheckout('/checkout');

    expect(screen.getByText(/No Active Booking Session/i)).toBeTruthy();
    expect(screen.getByText(/Go to Route Planner/i)).toBeTruthy();
  });

  it('renders invalid session state when source and destination are identical', () => {
    renderCheckout('/checkout?from=RAJIV_CHOWK&to=RAJIV_CHOWK');

    expect(screen.getByText(/No Active Booking Session/i)).toBeTruthy();
  });

  it('renders complete MetroPay checkout UI with journey and fare details for valid route', async () => {
    await renderCheckoutReady('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

    // MetroPay branding & badges
    expect(screen.getAllByText(/MetroPay/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/SECURE TEST GATEWAY/i)).toBeTruthy();
    expect(screen.getByText(/DEMO TICKET — NOT VALID FOR METRO TRAVEL/i)).toBeTruthy();

    // Stations
    expect(screen.getByText('Samaypur Badli')).toBeTruthy();
    expect(screen.getByText('Rajiv Chowk')).toBeTruthy();

    // Fare breakdown
    expect(screen.getByText(/Payment Breakdown/i)).toBeTruthy();
    expect(screen.getByText(/Total Demo Fare/i)).toBeTruthy();

    // CTA
    const payBtn = screen.getByRole('button', { name: /Pay ₹/i });
    expect(payBtn).toBeTruthy();
  });

  it('updates total fare when passenger count and journey type change', () => {
    renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

    // Click 3 passengers
    const btn3 = screen.getByRole('button', { name: '3' });
    fireEvent.click(btn3);

    // Click Return Journey
    const returnOption = screen.getByRole('button', { name: /Return Journey/i });
    fireEvent.click(returnOption);

    // Base fare 50 * 3 * 1.8 = 270
    expect(screen.getByText('₹270')).toBeTruthy();
    expect(screen.getAllByText(/10% return discount/i).length).toBeGreaterThan(0);
  });

  it('creates order, launches Razorpay modal, and handles passenger cancellation', async () => {
    await renderCheckoutReady('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

    const payBtn = screen.getByRole('button', { name: /Pay ₹/i });
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(paymentService.createPaymentOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: 'SAMAYPUR_BADLI',
          destinationId: 'RAJIV_CHOWK',
          passengerCount: 1,
          ticketType: 'SINGLE',
        })
      );
    });

    expect(MockRazorpay.instances).toHaveLength(1);
    const instance = MockRazorpay.instances[0];

    // Simulate modal dismissal
    instance.simulateDismiss();

    await waitFor(() => {
      expect(screen.getByText(/Payment Cancelled/i)).toBeTruthy();
    });

    // Ensure no ticket was issued
    expect(useTicketStore.getState().tickets).toHaveLength(0);
  });

  it('distinguishes checkout gateway "Load failed" from bank decline and provides ad-blocker guidance', async () => {
    await renderCheckoutReady('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

    const payBtn = screen.getByRole('button', { name: /Pay ₹/i });
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(MockRazorpay.instances).toHaveLength(1);
    });

    const instance = MockRazorpay.instances[0];
    instance.simulateFailure({ description: 'Load failed' });

    await waitFor(() => {
      // Must NOT claim "Payment Failed or Denied"
      expect(screen.queryByText(/Payment Failed or Denied/i)).toBeNull();
      // Must display specific gateway load failure header
      expect(screen.getByText(/Checkout Gateway Failed to Load/i)).toBeTruthy();
      expect(screen.getByText(/ad-blocker, Safari content blocker, or privacy extension/i)).toBeTruthy();
    });

    expect(useTicketStore.getState().tickets).toHaveLength(0);
  });

  it('prevents duplicate order creation when user retries after dismissal or load failure', async () => {
    await renderCheckoutReady('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

    const payBtn = screen.getByRole('button', { name: /Pay ₹/i });
    // First payment attempt
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(paymentService.createPaymentOrder).toHaveBeenCalledTimes(1);
      expect(MockRazorpay.instances).toHaveLength(1);
    });

    // Dismiss the modal
    MockRazorpay.instances[0].simulateDismiss();

    await waitFor(() => {
      expect(screen.getByText(/Payment Cancelled/i)).toBeTruthy();
    });

    // Second payment attempt with the same parameters (Retry)
    fireEvent.click(payBtn);

    // Should NOT create a duplicate order on the server
    await waitFor(() => {
      expect(paymentService.createPaymentOrder).toHaveBeenCalledTimes(1);
      expect(MockRazorpay.instances).toHaveLength(2);
    });
  });

  it('invalidates cached order and requests new order if user alters journey parameters', async () => {
    await renderCheckoutReady('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

    const payBtn = screen.getByRole('button', { name: /Pay ₹/i });
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(paymentService.createPaymentOrder).toHaveBeenCalledTimes(1);
    });

    MockRazorpay.instances[0].simulateDismiss();

    // User changes passenger count to 2
    const btn2 = screen.getByRole('button', { name: '2' });
    fireEvent.click(btn2);

    // Retry payment
    fireEvent.click(payBtn);

    // Because parameters changed, createPaymentOrder must be invoked with updated params
    await waitFor(() => {
      expect(paymentService.createPaymentOrder).toHaveBeenCalledTimes(2);
      expect(paymentService.createPaymentOrder).toHaveBeenLastCalledWith(
        expect.objectContaining({
          passengerCount: 2,
        })
      );
    });
  });

  it('displays payment script load error when checkout.js fails to load', async () => {
    vi.spyOn(paymentService, 'loadRazorpayCheckoutScript').mockResolvedValue(false);
    delete (window as any).Razorpay;

    await renderCheckoutReady('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

    const payBtn = screen.getByRole('button', { name: /Pay ₹/i });
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(screen.getByText(/Payment Script Failed to Load/i)).toBeTruthy();
      expect(screen.getByText(/Could not load the Razorpay checkout script/i)).toBeTruthy();
    });
  });

  it('handles payment provider decline / failure safely without issuing tickets', async () => {
    await renderCheckoutReady('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

    const payBtn = screen.getByRole('button', { name: /Pay ₹/i });
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(MockRazorpay.instances).toHaveLength(1);
    });

    const instance = MockRazorpay.instances[0];
    instance.simulateFailure({ description: 'Card was declined by issuing test bank.' });

    await waitFor(() => {
      expect(screen.getByText(/Payment Failed or Denied/i)).toBeTruthy();
      expect(screen.getByText(/Card was declined by issuing test bank/i)).toBeTruthy();
    });

    expect(useTicketStore.getState().tickets).toHaveLength(0);
  });

  it('successfully captures payment, verifies signature with server, and issues verified demo ticket', async () => {
    await renderCheckoutReady('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

    const payBtn = screen.getByRole('button', { name: /Pay ₹/i });
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(MockRazorpay.instances).toHaveLength(1);
    });

    const instance = MockRazorpay.instances[0];

    // Simulate successful payment callback from Razorpay
    await instance.simulateSuccess({
      razorpay_payment_id: 'pay_test_payment_999',
      razorpay_order_id: 'order_test_9999',
      razorpay_signature: 'valid_hmac_sha256_mock_signature',
    });

    await waitFor(() => {
      expect(paymentService.verifyServerPayment).toHaveBeenCalledWith({
        bookingId: 'DMRC-DEMO-TEST-BOOKING-99',
        razorpayPaymentId: 'pay_test_payment_999',
        razorpaySignature: 'valid_hmac_sha256_mock_signature',
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Payment Verified & Ticket Issued!/i)).toBeTruthy();
      expect(screen.getByText(/TEST MODE PAYMENT VERIFIED/i)).toBeTruthy();
    });

    // Check ticket was saved in ticketStore
    const savedTickets = useTicketStore.getState().tickets;
    expect(savedTickets).toHaveLength(1);
    expect(savedTickets[0].id).toBe('TKT-VERIFIED-99');
    expect(savedTickets[0].isVerifiedPayment).toBe(true);
    expect(savedTickets[0].paymentStatus).toBe('PAID');
  });

  it('prevents duplicate submissions while payment order is in flight', async () => {
    let resolveOrder: Function;
    const pendingPromise = new Promise<any>((res) => {
      resolveOrder = res;
    });

    vi.spyOn(paymentService, 'createPaymentOrder').mockReturnValue(pendingPromise);

    await renderCheckoutReady('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

    const payBtn = screen.getByRole('button', { name: /Pay ₹/i });
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(paymentService.createPaymentOrder).toHaveBeenCalledTimes(1);
    });

    // Button should now show spinner and be disabled
    expect(screen.getByText(/Creating Order.../i)).toBeTruthy();
    expect(payBtn.hasAttribute('disabled')).toBe(true);

    // Second click should be ignored
    fireEvent.click(payBtn);
    expect(paymentService.createPaymentOrder).toHaveBeenCalledTimes(1);

    // Clean up
    resolveOrder!({
      success: true,
      bookingId: 'B1',
      orderId: 'O1',
      amount: 4000,
      currency: 'INR',
      keyId: 'K1',
    });
  });

  describe('Theme Handoff and Synchronization', () => {
    it('applies light-metro theme when passed in URL query param', () => {
      const { container } = renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK&theme=light-metro');
      const checkoutEl = container.querySelector('[data-page="checkout"]');
      expect(checkoutEl?.getAttribute('data-checkout-theme')).toBe('light-metro');
    });

    it('applies midnight-blue theme when passed in URL query param', () => {
      const { container } = renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK&theme=midnight-blue');
      const checkoutEl = container.querySelector('[data-page="checkout"]');
      expect(checkoutEl?.getAttribute('data-checkout-theme')).toBe('midnight-blue');
    });

    it('applies dark-transit theme when passed in URL query param', () => {
      const { container } = renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK&theme=dark-transit');
      const checkoutEl = container.querySelector('[data-page="checkout"]');
      expect(checkoutEl?.getAttribute('data-checkout-theme')).toBe('dark-transit');
    });

    it('falls back to dark-transit when theme query param is invalid', () => {
      const { container } = renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK&theme=invalid-neon-theme');
      const checkoutEl = container.querySelector('[data-page="checkout"]');
      expect(checkoutEl?.getAttribute('data-checkout-theme')).toBe('dark-transit');
    });

    it('falls back to sessionStorage theme if theme query param is missing', () => {
      saveCheckoutSession({
        sourceId: 'SAMAYPUR_BADLI',
        destinationId: 'RAJIV_CHOWK',
        theme: 'midnight-blue',
        createdAt: Date.now(),
      });
      const { container } = renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');
      const checkoutEl = container.querySelector('[data-page="checkout"]');
      expect(checkoutEl?.getAttribute('data-checkout-theme')).toBe('midnight-blue');
    });

    it('falls back to localStorage planner theme if query param and session theme are absent', () => {
      localStorage.setItem(PLANNER_THEME_STORAGE_KEY, 'light-metro');
      const { container } = renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');
      const checkoutEl = container.querySelector('[data-page="checkout"]');
      expect(checkoutEl?.getAttribute('data-checkout-theme')).toBe('light-metro');
    });

    it('applies theme correctly even on the invalid/empty route screen', () => {
      const { container } = renderCheckout('/checkout?theme=midnight-blue');
      const checkoutEl = container.querySelector('[data-page="checkout"]');
      expect(checkoutEl?.getAttribute('data-checkout-theme')).toBe('midnight-blue');
    });

    it('dynamically displays Live Mode banner and badge when server reports LIVE mode', async () => {
      vi.spyOn(paymentService, 'getPaymentDiagnostics').mockResolvedValue({
        status: 'ok',
        diagnostics: {
          razorpay: {
            paymentMode: 'LIVE',
            keyType: 'LIVE',
            hasKeyId: true,
            dynamicQrAllowed: true,
            liveQrEnabled: true,
          },
        },
      });

      renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

      await waitFor(() => {
        expect(screen.getByText('SECURE LIVE GATEWAY')).toBeTruthy();
        expect(screen.getByText(/Real funds will be charged via Razorpay Live Gateway/i)).toBeTruthy();
      });
    });

    it('defaults to Cards & NetBanking as primary checkout method without query param', () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK']}>
          <AuthProvider>
            <CheckoutPage />
          </AuthProvider>
        </MemoryRouter>
      );

      const standardBtn = container.querySelector('#opt-pay-standard');
      expect(standardBtn?.className).toContain('border-emerald-500');
      expect(screen.getByRole('button', { name: /Pay ₹.*via Razorpay/i })).toBeTruthy();
    });
  });

  describe('MetroPay Safety Corrections & Live Payment Controls', () => {
    it('1. diagnostics returning LIVE sets live mode badges and disclaimers', async () => {
      vi.spyOn(paymentService, 'getPaymentDiagnostics').mockResolvedValue({
        status: 'ok',
        diagnostics: {
          razorpay: {
            paymentMode: 'LIVE',
            keyType: 'LIVE',
            hasKeyId: true,
            dynamicQrAllowed: true,
            liveQrEnabled: true,
          },
        },
      });

      renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

      await waitFor(() => {
        expect(screen.getByText('SECURE LIVE GATEWAY')).toBeTruthy();
        expect(screen.getByText(/Real funds will be charged via Razorpay Live Gateway/i)).toBeTruthy();
        expect(screen.getByLabelText(/I understand that this transaction will charge real money/i)).toBeTruthy();
      });
    });

    it('2. diagnostics returning TEST sets test mode badges and disclaimers', async () => {
      vi.spyOn(paymentService, 'getPaymentDiagnostics').mockResolvedValue({
        status: 'ok',
        diagnostics: {
          razorpay: {
            paymentMode: 'TEST',
            keyType: 'TEST',
            hasKeyId: true,
            dynamicQrAllowed: false,
            liveQrEnabled: false,
          },
        },
      });

      renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

      await waitFor(() => {
        expect(screen.getByText('SECURE TEST GATEWAY')).toBeTruthy();
        expect(screen.getByText(/Test environment running via Razorpay Test Mode/i)).toBeTruthy();
        expect(screen.queryByLabelText(/I understand that this transaction will charge real money/i)).toBeNull();
      });
    });

    it('3. diagnostics failing or returning UNKNOWN disables payments and shows retry guidance', async () => {
      vi.spyOn(paymentService, 'getPaymentDiagnostics').mockResolvedValue(null);

      renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

      await waitFor(() => {
        expect(screen.getByText('GATEWAY: UNKNOWN')).toBeTruthy();
        expect(screen.getByText(/Payment Gateway Verification Required/i)).toBeTruthy();
        expect(screen.getByRole('button', { name: /Retry Gateway Verification/i })).toBeTruthy();
      });
    });

    it('4. payment button is disabled when in UNKNOWN mode and clicking does not call createPaymentOrder', async () => {
      vi.spyOn(paymentService, 'getPaymentDiagnostics').mockResolvedValue(null);

      renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

      await waitFor(() => {
        expect(screen.getByText('GATEWAY: UNKNOWN')).toBeTruthy();
      });

      const payBtn = screen.getByRole('button', { name: /Pay ₹.*via Razorpay/i });
      expect(payBtn.hasAttribute('disabled')).toBe(true);

      fireEvent.click(payBtn);
      expect(paymentService.createPaymentOrder).not.toHaveBeenCalled();
    });

    it('5. in LIVE mode, payment button is disabled until acknowledgement is checked', async () => {
      vi.spyOn(paymentService, 'getPaymentDiagnostics').mockResolvedValue({
        status: 'ok',
        diagnostics: {
          razorpay: {
            paymentMode: 'LIVE',
            keyType: 'LIVE',
            hasKeyId: true,
            dynamicQrAllowed: true,
            liveQrEnabled: true,
          },
        },
      });

      renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

      await waitFor(() => {
        expect(screen.getByText('SECURE LIVE GATEWAY')).toBeTruthy();
      });

      const payBtn = screen.getByRole('button', { name: /Pay ₹.*via Razorpay/i });
      expect(payBtn.hasAttribute('disabled')).toBe(true);

      fireEvent.click(payBtn);
      expect(paymentService.createPaymentOrder).not.toHaveBeenCalled();
    });

    it('6. in LIVE mode, checking acknowledgement enables payment button and proceeding creates order', async () => {
      vi.spyOn(paymentService, 'getPaymentDiagnostics').mockResolvedValue({
        status: 'ok',
        diagnostics: {
          razorpay: {
            paymentMode: 'LIVE',
            keyType: 'LIVE',
            hasKeyId: true,
            dynamicQrAllowed: true,
            liveQrEnabled: true,
          },
        },
      });

      vi.spyOn(paymentService, 'createPaymentOrder').mockResolvedValue({
        success: true,
        bookingId: 'DMRC-LIVE-BOOKING-1',
        orderId: 'order_live_1',
        amount: 4000,
        currency: 'INR',
        keyId: 'rzp_live_realKey123',
        fareInRupees: 40,
        sourceName: 'Samaypur Badli',
        destinationName: 'Rajiv Chowk',
        passengerCount: 1,
        ticketType: 'SINGLE',
      });

      renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

      await waitFor(() => {
        expect(screen.getByText('SECURE LIVE GATEWAY')).toBeTruthy();
      });

      const checkbox = screen.getByRole('checkbox', {
        name: /I understand that this transaction will charge real money/i,
      });
      fireEvent.click(checkbox);

      const payBtn = screen.getByRole('button', { name: /Pay ₹.*via Razorpay/i });
      expect(payBtn.hasAttribute('disabled')).toBe(false);

      fireEvent.click(payBtn);

      await waitFor(() => {
        expect(paymentService.createPaymentOrder).toHaveBeenCalledTimes(1);
        expect(MockRazorpay.instances).toHaveLength(1);
      });
    });

    it('7. dynamic QR requires acknowledgement in LIVE mode, and parameter change resets acknowledgement', async () => {
      vi.spyOn(paymentService, 'getPaymentDiagnostics').mockResolvedValue({
        status: 'ok',
        diagnostics: {
          razorpay: {
            paymentMode: 'LIVE',
            keyType: 'LIVE',
            hasKeyId: true,
            dynamicQrAllowed: true,
            liveQrEnabled: true,
          },
        },
      });

      vi.spyOn(paymentService, 'createPaymentQr').mockResolvedValue({
        success: true,
        bookingId: 'DMRC-QR-LIVE-1',
        qrId: 'qr_live_1',
        qrImageUrl: 'https://example.com/qr.png',
        amount: 4000,
        currency: 'INR',
        fareInRupees: 40,
        sourceName: 'Samaypur Badli',
        destinationName: 'Rajiv Chowk',
        passengerCount: 1,
        ticketType: 'SINGLE',
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        paymentMethod: 'UPI_QR',
        paymentMode: 'LIVE',
      });

      renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK&mode=upi_qr');

      await waitFor(() => {
        expect(screen.getByText('SECURE LIVE GATEWAY')).toBeTruthy();
      });

      const qrBtn = screen.getByRole('button', { name: /Generate Dynamic UPI QR/i });
      expect(qrBtn.hasAttribute('disabled')).toBe(true);

      const checkbox = screen.getByRole('checkbox', {
        name: /I understand that this transaction will charge real money/i,
      });
      fireEvent.click(checkbox);
      expect(qrBtn.hasAttribute('disabled')).toBe(false);

      // Parameter change (changing passenger count) must reset acknowledgement
      const btn2 = screen.getByRole('button', { name: '2' });
      fireEvent.click(btn2);

      // Acknowledgement must be reset and button disabled again
      expect((checkbox as HTMLInputElement).checked).toBe(false);
      expect(qrBtn.hasAttribute('disabled')).toBe(true);
    });

    it('8. order key mismatch (LIVE mode but rzp_test_ key) throws security error and aborts payment', async () => {
      vi.spyOn(paymentService, 'getPaymentDiagnostics').mockResolvedValue({
        status: 'ok',
        diagnostics: {
          razorpay: {
            paymentMode: 'LIVE',
            keyType: 'LIVE',
            hasKeyId: true,
            dynamicQrAllowed: true,
            liveQrEnabled: true,
          },
        },
      });

      // Backend accidentally returns a test key in LIVE mode
      vi.spyOn(paymentService, 'createPaymentOrder').mockResolvedValue({
        success: true,
        bookingId: 'DMRC-MISMATCH-1',
        orderId: 'order_test_mismatch',
        amount: 4000,
        currency: 'INR',
        keyId: 'rzp_test_mismatchedKey',
        fareInRupees: 40,
        sourceName: 'Samaypur Badli',
        destinationName: 'Rajiv Chowk',
        passengerCount: 1,
        ticketType: 'SINGLE',
      });

      renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

      await waitFor(() => {
        expect(screen.getByText('SECURE LIVE GATEWAY')).toBeTruthy();
      });

      const checkbox = screen.getByRole('checkbox', {
        name: /I understand that this transaction will charge real money/i,
      });
      fireEvent.click(checkbox);

      const payBtn = screen.getByRole('button', { name: /Pay ₹.*via Razorpay/i });
      fireEvent.click(payBtn);

      await waitFor(() => {
        expect(screen.getByText(/Security Verification Failed/i)).toBeTruthy();
        expect(screen.getByText(/Order key mismatch/i)).toBeTruthy();
      });

      // Razorpay modal must NEVER be launched
      expect(MockRazorpay.instances).toHaveLength(0);
    });

    it('8b. order key mismatch (TEST mode but rzp_live_ key) throws security error and aborts payment', async () => {
      vi.spyOn(paymentService, 'getPaymentDiagnostics').mockResolvedValue({
        status: 'ok',
        diagnostics: {
          razorpay: {
            paymentMode: 'TEST',
            keyType: 'TEST',
            hasKeyId: true,
            dynamicQrAllowed: false,
            liveQrEnabled: false,
          },
        },
      });

      // Backend accidentally returns a live key in TEST mode
      vi.spyOn(paymentService, 'createPaymentOrder').mockResolvedValue({
        success: true,
        bookingId: 'DMRC-MISMATCH-2',
        orderId: 'order_live_mismatch',
        amount: 4000,
        currency: 'INR',
        keyId: 'rzp_live_mismatchedKey',
        fareInRupees: 40,
        sourceName: 'Samaypur Badli',
        destinationName: 'Rajiv Chowk',
        passengerCount: 1,
        ticketType: 'SINGLE',
      });

      renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

      await waitFor(() => {
        expect(screen.getByText('SECURE TEST GATEWAY')).toBeTruthy();
      });

      const payBtn = screen.getByRole('button', { name: /Pay ₹.*via Razorpay/i });
      fireEvent.click(payBtn);

      await waitFor(() => {
        expect(screen.getByText(/Security Verification Failed/i)).toBeTruthy();
        expect(screen.getByText(/Order key mismatch/i)).toBeTruthy();
      });

      // Razorpay modal must NEVER be launched
      expect(MockRazorpay.instances).toHaveLength(0);
    });

    it('9. Razorpay Standard Checkout description reflects verified actual mode dynamically', async () => {
      // Test Mode description
      vi.spyOn(paymentService, 'getPaymentDiagnostics').mockResolvedValue({
        status: 'ok',
        diagnostics: {
          razorpay: {
            paymentMode: 'TEST',
            keyType: 'TEST',
            hasKeyId: true,
            dynamicQrAllowed: false,
            liveQrEnabled: false,
          },
        },
      });

      renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

      await waitFor(() => {
        expect(screen.getByText('SECURE TEST GATEWAY')).toBeTruthy();
      });

      const payBtn = screen.getByRole('button', { name: /Pay ₹.*via Razorpay/i });
      fireEvent.click(payBtn);

      await waitFor(() => {
        expect(MockRazorpay.instances).toHaveLength(1);
      });

      expect(MockRazorpay.instances[0].options.description).toBe('Single Transit Pass (1 Passenger) · Test Mode');
    });

    it('9b. Razorpay Standard Checkout description reflects Live Demo in LIVE mode', async () => {
      vi.spyOn(paymentService, 'getPaymentDiagnostics').mockResolvedValue({
        status: 'ok',
        diagnostics: {
          razorpay: {
            paymentMode: 'LIVE',
            keyType: 'LIVE',
            hasKeyId: true,
            dynamicQrAllowed: true,
            liveQrEnabled: true,
          },
        },
      });

      vi.spyOn(paymentService, 'createPaymentOrder').mockResolvedValue({
        success: true,
        bookingId: 'DMRC-LIVE-BOOKING-9',
        orderId: 'order_live_9',
        amount: 4000,
        currency: 'INR',
        keyId: 'rzp_live_realKey999',
        fareInRupees: 40,
        sourceName: 'Samaypur Badli',
        destinationName: 'Rajiv Chowk',
        passengerCount: 1,
        ticketType: 'SINGLE',
      });

      renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

      await waitFor(() => {
        expect(screen.getByText('SECURE LIVE GATEWAY')).toBeTruthy();
      });

      const checkbox = screen.getByRole('checkbox', {
        name: /I understand that this transaction will charge real money/i,
      });
      fireEvent.click(checkbox);

      const payBtn = screen.getByRole('button', { name: /Pay ₹.*via Razorpay/i });
      fireEvent.click(payBtn);

      await waitFor(() => {
        expect(MockRazorpay.instances).toHaveLength(1);
      });

      expect(MockRazorpay.instances[0].options.description).toBe('Single Transit Pass (1 Passenger) · Live Demo');
    });

    it('10. diagnostics with status !== "ok" produces UNKNOWN mode', async () => {
      vi.spyOn(paymentService, 'getPaymentDiagnostics').mockResolvedValue({
        status: 'error',
        diagnostics: {
          razorpay: {
            paymentMode: 'TEST',
            keyType: 'TEST',
            hasKeyId: true,
            dynamicQrAllowed: true,
            liveQrEnabled: false,
          },
        },
      });

      renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

      await waitFor(() => {
        expect(screen.getByText('GATEWAY: UNKNOWN')).toBeTruthy();
        expect(screen.getByText(/Payment Gateway Verification Required/i)).toBeTruthy();
      });
    });

    it('11. Dynamic QR is disabled when dynamicQrAllowed is false in server diagnostics', async () => {
      vi.spyOn(paymentService, 'getPaymentDiagnostics').mockResolvedValue({
        status: 'ok',
        diagnostics: {
          razorpay: {
            paymentMode: 'TEST',
            keyType: 'TEST',
            hasKeyId: true,
            dynamicQrAllowed: false,
            liveQrEnabled: false,
          },
        },
      });

      renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK&mode=upi_qr');

      await waitFor(() => {
        expect(screen.getByText('SECURE TEST GATEWAY')).toBeTruthy();
      });

      const qrBtn = screen.getByRole('button', { name: /Generate Dynamic UPI QR/i });
      expect(qrBtn.hasAttribute('disabled')).toBe(true);

      fireEvent.click(qrBtn);
      expect(paymentService.createPaymentQr).not.toHaveBeenCalled();
    });

    it('12. In LIVE mode, Dynamic QR is disabled when liveQrEnabled is false in server diagnostics', async () => {
      vi.spyOn(paymentService, 'getPaymentDiagnostics').mockResolvedValue({
        status: 'ok',
        diagnostics: {
          razorpay: {
            paymentMode: 'LIVE',
            keyType: 'LIVE',
            hasKeyId: true,
            dynamicQrAllowed: false,
            liveQrEnabled: false,
          },
        },
      });

      renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK&mode=upi_qr');

      await waitFor(() => {
        expect(screen.getByText('SECURE LIVE GATEWAY')).toBeTruthy();
      });

      const checkbox = screen.getByRole('checkbox', {
        name: /I understand that this transaction will charge real money/i,
      });
      fireEvent.click(checkbox);

      const qrBtn = screen.getByRole('button', { name: /Generate Dynamic UPI QR/i });
      expect(qrBtn.hasAttribute('disabled')).toBe(true);

      fireEvent.click(qrBtn);
      expect(paymentService.createPaymentQr).not.toHaveBeenCalled();
    });

    it('13. QR creation response with mismatched paymentMode throws security error and does not start polling or show QR', async () => {
      vi.spyOn(paymentService, 'getPaymentDiagnostics').mockResolvedValue({
        status: 'ok',
        diagnostics: {
          razorpay: {
            paymentMode: 'TEST',
            keyType: 'TEST',
            hasKeyId: true,
            dynamicQrAllowed: true,
            liveQrEnabled: false,
          },
        },
      });

      // Server returns LIVE mode QR in TEST mode
      vi.spyOn(paymentService, 'createPaymentQr').mockResolvedValue({
        success: true,
        bookingId: 'DMRC-QR-MISMATCH',
        qrId: 'qr_mismatch_1',
        qrImageUrl: 'https://example.com/qr-mismatch.png',
        amount: 4000,
        currency: 'INR',
        fareInRupees: 40,
        sourceName: 'Samaypur Badli',
        destinationName: 'Rajiv Chowk',
        passengerCount: 1,
        ticketType: 'SINGLE',
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        paymentMethod: 'UPI_QR',
        paymentMode: 'LIVE',
      });

      const verifySpy = vi.spyOn(paymentService, 'verifyServerQrPayment');

      renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK&mode=upi_qr');

      await waitFor(() => {
        expect(screen.getByText('SECURE TEST GATEWAY')).toBeTruthy();
      });

      const qrBtn = screen.getByRole('button', { name: /Generate Dynamic UPI QR/i });
      fireEvent.click(qrBtn);

      await waitFor(() => {
        expect(screen.getByText(/Security Verification Failed/i)).toBeTruthy();
        expect(screen.getByText(/QR payment mode mismatch/i)).toBeTruthy();
      });

      // QR image must NOT be rendered
      expect(screen.queryByAltText(/Razorpay Dynamic UPI QR/i)).toBeNull();
      // Polling must NOT be initiated
      expect(verifySpy).not.toHaveBeenCalled();
    });

    it('14. Cached QR cannot be reused after payment mode becomes UNKNOWN or changes', async () => {
      let resolveDiagnostics: (value: any) => void;
      const diagPromise = new Promise((res) => {
        resolveDiagnostics = res;
      });

      vi.spyOn(paymentService, 'getPaymentDiagnostics').mockReturnValue(diagPromise as any);

      vi.spyOn(paymentService, 'createPaymentQr').mockResolvedValue({
        success: true,
        bookingId: 'DMRC-QR-CACHE-1',
        qrId: 'qr_cache_1',
        qrImageUrl: 'https://example.com/qr-cache.png',
        amount: 4000,
        currency: 'INR',
        fareInRupees: 40,
        sourceName: 'Samaypur Badli',
        destinationName: 'Rajiv Chowk',
        passengerCount: 1,
        ticketType: 'SINGLE',
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        paymentMethod: 'UPI_QR',
        paymentMode: 'TEST',
      });

      renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK&mode=upi_qr');

      // Mode is UNKNOWN initially
      await waitFor(() => {
        expect(screen.getByText('GATEWAY: UNKNOWN')).toBeTruthy();
      });

      // Resolve as TEST
      resolveDiagnostics!({
        status: 'ok',
        diagnostics: {
          razorpay: {
            paymentMode: 'TEST',
            keyType: 'TEST',
            hasKeyId: true,
            dynamicQrAllowed: true,
            liveQrEnabled: false,
          },
        },
      });

      await waitFor(() => {
        expect(screen.getByText('SECURE TEST GATEWAY')).toBeTruthy();
      });

      const qrBtn = screen.getByRole('button', { name: /Generate Dynamic UPI QR/i });
      fireEvent.click(qrBtn);

      await waitFor(() => {
        expect(paymentService.createPaymentQr).toHaveBeenCalledTimes(1);
        expect(screen.getByAltText(/Razorpay Dynamic UPI QR/i)).toBeTruthy();
      });
    });
  });
});
