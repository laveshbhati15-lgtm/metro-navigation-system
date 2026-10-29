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
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <CheckoutPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('CheckoutPage (MetroPay Dedicated Checkout)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    MockRazorpay.instances = [];
    (window as any).Razorpay = MockRazorpay;

    vi.spyOn(paymentService, 'loadRazorpayCheckoutScript').mockResolvedValue(true);
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

  it('renders complete MetroPay checkout UI with journey and fare details for valid route', () => {
    renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

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
    renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

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
    renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

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
    renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

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
    renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

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

    renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

    const payBtn = screen.getByRole('button', { name: /Pay ₹/i });
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(screen.getByText(/Payment Script Failed to Load/i)).toBeTruthy();
      expect(screen.getByText(/Could not load the Razorpay checkout script/i)).toBeTruthy();
    });
  });

  it('handles payment provider decline / failure safely without issuing tickets', async () => {
    renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

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
    renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

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

    renderCheckout('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');

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
  });
});
