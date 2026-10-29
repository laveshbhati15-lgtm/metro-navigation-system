import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { DemoTicketCard } from './DemoTicketCard';
import { BookingModal } from './BookingModal';
import { useTicketStore } from './ticketStore';
import type { DemoTicket } from './types';
import type { Station, MetroRoute } from '@/core/graph/types';
import * as paymentService from '@/services/paymentService';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      displayName: 'Delhi Commuter',
      email: 'test@example.com',
      getIdToken: async () => 'mock-id-token',
    },
  }),
}));

const mockSource: Station = {
  id: 'KASHMERE_GATE',
  name: 'Kashmere Gate',
  nameHindi: 'कश्मीरी गेट',
  lines: ['YELLOW', 'RED', 'VIOLET'],
  coordinates: { lat: 28.6675, lng: 77.2285 },
  isInterchange: true,
  zone: 1,
};

const mockDestination: Station = {
  id: 'BOTANICAL_GARDEN',
  name: 'Botanical Garden',
  nameHindi: 'बॉटनिकल गार्डन',
  lines: ['BLUE', 'MAGENTA'],
  coordinates: { lat: 28.5641, lng: 77.3342 },
  isInterchange: true,
  zone: 2,
};

const mockRoute: MetroRoute = {
  label: 'Fastest Route',
  totalTimeSeconds: 2400,
  totalStations: 18,
  interchangeCount: 1,
  stations: [mockSource, mockDestination],
  edges: [
    { from: 'KASHMERE_GATE', to: 'MANDI_HOUSE', line: 'VIOLET', travelTimeSeconds: 720 },
    { from: 'MANDI_HOUSE', to: 'BOTANICAL_GARDEN', line: 'BLUE', travelTimeSeconds: 1680 },
  ],
  interchanges: [mockDestination],
  lineSegments: [],
  hasEstimatedTimes: false,
};

describe('Booking Flow Regression & Protection Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useTicketStore.getState().clearHistory();
    useTicketStore.getState().closeBookingModal();
  });

  afterEach(() => {
    delete (window as any).Razorpay;
  });

  describe('DemoTicketCard Presentation Guarantees', () => {
    it('renders unverified demo ticket without any Test Paid or payment indicators', () => {
      const unverifiedTicket: DemoTicket = {
        id: 'DMRC-DEMO-TEST-UNVERIFIED',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        source: mockSource,
        destination: mockDestination,
        routeSummary: {
          label: 'Fastest Route',
          totalTimeSeconds: 2400,
          totalStations: 18,
          interchangeCount: 1,
          lines: ['VIOLET', 'BLUE'],
          interchangeStations: ['Botanical Garden'],
        },
        passengerCount: 1,
        ticketType: 'SINGLE',
        baseFare: 50,
        totalFare: 50,
        status: 'ACTIVE',
        paymentStatus: 'UNVERIFIED_DEMO',
        isVerifiedPayment: false,
        disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
        qrPayload: JSON.stringify({ bookingId: 'DMRC-DEMO-TEST-UNVERIFIED', valid: false }),
      };

      render(<DemoTicketCard ticket={unverifiedTicket} />);

      // Must display unverified warnings
      expect(screen.getByText('UNVERIFIED DEMO — NO PAYMENT PROCESSED')).toBeDefined();
      expect(screen.getByText('UNVERIFIED DEMO')).toBeDefined();
      expect(screen.getByText('DEMO FARE')).toBeDefined();
      expect(screen.getByText('(Unverified)')).toBeDefined();

      // Must NEVER display paid badges or payment ID
      expect(screen.queryByText(/✓ TEST PAID/i)).toBeNull();
      expect(screen.queryByText(/TEST MODE PAYMENT VERIFIED/i)).toBeNull();
      expect(screen.queryByText(/\(Test Paid\)/i)).toBeNull();
      expect(screen.queryByText(/RZP PAYMENT ID/i)).toBeNull();
    });

    it('renders verified paid demo ticket with verified badge and payment reference', () => {
      const verifiedPaidTicket: DemoTicket = {
        id: 'DMRC-DEMO-TEST-PAID',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        source: mockSource,
        destination: mockDestination,
        routeSummary: {
          label: 'Fastest Route',
          totalTimeSeconds: 2400,
          totalStations: 18,
          interchangeCount: 1,
          lines: ['VIOLET', 'BLUE'],
          interchangeStations: ['Botanical Garden'],
        },
        passengerCount: 2,
        ticketType: 'RETURN',
        baseFare: 50,
        totalFare: 180,
        status: 'ACTIVE',
        paymentStatus: 'PAID',
        isVerifiedPayment: true,
        razorpayOrderId: 'order_test_99999',
        razorpayPaymentId: 'pay_test_88888',
        disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
        qrPayload: JSON.stringify({ bookingId: 'DMRC-DEMO-TEST-PAID', valid: false }),
      };

      render(<DemoTicketCard ticket={verifiedPaidTicket} />);

      // Must display verified indicators
      expect(screen.getByText('✓ TEST MODE PAYMENT VERIFIED')).toBeDefined();
      expect(screen.getByText('✓ TEST PAID')).toBeDefined();
      expect(screen.getByText('(Test Paid)')).toBeDefined();
      expect(screen.getByText('RZP PAYMENT ID')).toBeDefined();
      expect(screen.getByText('pay_test_88888')).toBeDefined();

      // Must NEVER display unverified labels
      expect(screen.queryByText('UNVERIFIED DEMO — NO PAYMENT PROCESSED')).toBeNull();
      expect(screen.queryByText('UNVERIFIED DEMO')).toBeNull();
      expect(screen.queryByText('(Unverified)')).toBeNull();
    });
  });

  describe('BookingModal Mode Separation & Error Handling', () => {
    it('does NOT silently generate a demo ticket when payment order creation fails', async () => {
      // Mock window.Razorpay as present
      (window as any).Razorpay = class DummyRazorpay {};

      // Mock fetch failure from backend order creation endpoint
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          success: false,
          error: 'Backend Razorpay configuration missing: RAZORPAY_KEY_ID is not configured.',
        }),
      } as Response);

      // Open booking modal with preselected route
      useTicketStore.getState().openBookingModal({
        source: mockSource,
        destination: mockDestination,
        route: mockRoute,
      });

      render(<BookingModal />);

      // Payment button should be visible in payment mode
      const payButton = document.getElementById('btn-confirm-demo-booking');
      expect(payButton).not.toBeNull();

      // Trigger payment
      fireEvent.click(payButton!);

      // Wait for failure state
      await waitFor(() => {
        expect(
          screen.getByText(/Backend Razorpay configuration missing: RAZORPAY_KEY_ID is not configured/i)
        ).toBeDefined();
      });

      // Crucial: No ticket should be generated in the store!
      expect(useTicketStore.getState().tickets).toHaveLength(0);
      expect(screen.queryByText(/DEMO BOOKING ID/i)).toBeNull();
      expect(screen.queryByText(/✓ TEST PAID/i)).toBeNull();

      // Retry button and switch to demo option should be visible
      expect(screen.getByRole('button', { name: /↻ Retry Payment/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /Switch to Explicit Demo Mode/i })).toBeDefined();
    });

    it('issues an explicit unverified demo ticket only when user selects Demo Mode', async () => {
      useTicketStore.getState().openBookingModal({
        source: mockSource,
        destination: mockDestination,
        route: mockRoute,
      });

      render(<BookingModal />);

      // Switch to Explicit Demo Mode
      const demoTabButton = screen.getByRole('button', { name: /Demo Mode \(No Payment\)/i });
      fireEvent.click(demoTabButton);

      // The action button should change to Issue Demo Ticket
      const issueDemoButton = screen.getByRole('button', { name: /Issue Demo Ticket/i });
      expect(issueDemoButton).toBeDefined();

      fireEvent.click(issueDemoButton);

      // Ticket is now created in store as explicit unverified demo
      await waitFor(() => {
        const tickets = useTicketStore.getState().tickets;
        expect(tickets).toHaveLength(1);
        expect(tickets[0].paymentStatus).toBe('UNVERIFIED_DEMO');
        expect(tickets[0].isVerifiedPayment).toBe(false);
      });

      // And ticket card renders unverified labels
      expect(screen.getByText('UNVERIFIED DEMO — NO PAYMENT PROCESSED')).toBeDefined();
      expect(screen.getByText('UNVERIFIED DEMO')).toBeDefined();
      expect(screen.queryByText(/✓ TEST PAID/i)).toBeNull();
    });

    it('does not issue a ticket if passenger dismisses the Razorpay checkout modal', async () => {
      let capturedOptions: any = null;
      class MockRazorpay {
        constructor(options: any) {
          capturedOptions = options;
        }
        open() {}
        on() {}
      }
      (window as any).Razorpay = MockRazorpay;

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          bookingId: 'DMRC-DEMO-202610-DISMISS',
          orderId: 'order_test_dismiss',
          amount: 5000,
          currency: 'INR',
          keyId: 'rzp_test_123',
        }),
      } as Response);

      useTicketStore.getState().openBookingModal({
        source: mockSource,
        destination: mockDestination,
        route: mockRoute,
      });

      render(<BookingModal />);

      const payButton = document.getElementById('btn-confirm-demo-booking');
      fireEvent.click(payButton!);

      await waitFor(() => {
        expect(capturedOptions).not.toBeNull();
      });

      // Simulate passenger dismissing the Razorpay Checkout modal
      act(() => {
        capturedOptions.modal.ondismiss();
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Payment cancelled or dismissed by passenger/i)
        ).toBeDefined();
      });

      // No tickets should be created
      expect(useTicketStore.getState().tickets).toHaveLength(0);
      expect(screen.queryByText(/✓ TEST PAID/i)).toBeNull();
    });

    it('handles verification failure without marking ticket as paid', async () => {
      let capturedOptions: any = null;
      class MockRazorpay {
        constructor(options: any) {
          capturedOptions = options;
        }
        open() {}
        on() {}
      }
      (window as any).Razorpay = MockRazorpay;

      // 1st fetch: createRazorpayOrder succeeds
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            bookingId: 'DMRC-DEMO-202610-VERIFYFAIL',
            orderId: 'order_test_verifyfail',
            amount: 5000,
            currency: 'INR',
            keyId: 'rzp_test_123',
          }),
        } as Response)
        // 2nd fetch: verifyRazorpayPayment fails (signature mismatch)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({
            success: false,
            error: 'Invalid payment signature. Payment could not be verified.',
          }),
        } as Response);

      useTicketStore.getState().openBookingModal({
        source: mockSource,
        destination: mockDestination,
        route: mockRoute,
      });

      render(<BookingModal />);

      const payButton = document.getElementById('btn-confirm-demo-booking');
      fireEvent.click(payButton!);

      await waitFor(() => {
        expect(capturedOptions).not.toBeNull();
      });

      // Simulate Razorpay checkout calling handler with invalid signature
      await act(async () => {
        await capturedOptions.handler({
          razorpay_payment_id: 'pay_test_bad',
          razorpay_order_id: 'order_test_verifyfail',
          razorpay_signature: 'invalid_signature_hex',
        });
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Invalid payment signature/i)
        ).toBeDefined();
      });

      // No ticket in store marked paid
      expect(useTicketStore.getState().tickets).toHaveLength(0);
      expect(screen.queryByText(/✓ TEST PAID/i)).toBeNull();
    });

    it('rejects forged frontend callback with currency mismatch from backend without issuing a paid ticket', async () => {
      let capturedOptions: any = null;
      class MockRazorpay {
        constructor(options: any) {
          capturedOptions = options;
        }
        open() {}
        on() {}
      }
      (window as any).Razorpay = MockRazorpay;

      // 1st fetch: createRazorpayOrder succeeds
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            bookingId: 'DMRC-DEMO-202610-CURRFAIL',
            orderId: 'order_test_currfail',
            amount: 5000,
            currency: 'INR',
            keyId: 'rzp_test_123',
          }),
        } as Response)
        // 2nd fetch: verifyRazorpayPayment fails (currency mismatch)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({
            success: false,
            error: 'Paid currency does not match booking currency.',
            code: 'CURRENCY_MISMATCH',
          }),
        } as Response);

      useTicketStore.getState().openBookingModal({
        source: mockSource,
        destination: mockDestination,
        route: mockRoute,
      });

      render(<BookingModal />);

      const payButton = document.getElementById('btn-confirm-demo-booking');
      fireEvent.click(payButton!);

      await waitFor(() => {
        expect(capturedOptions).not.toBeNull();
      });

      // Simulate Razorpay checkout calling handler with USD currency or forged callback
      await act(async () => {
        await capturedOptions.handler({
          razorpay_payment_id: 'pay_test_usd',
          razorpay_order_id: 'order_test_currfail',
          razorpay_signature: 'valid_sig_but_usd_currency',
        });
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Paid currency does not match booking currency/i)
        ).toBeDefined();
      });

      // No ticket in store marked paid
      expect(useTicketStore.getState().tickets).toHaveLength(0);
      expect(screen.queryByText(/✓ TEST PAID/i)).toBeNull();
    });

    it('rejects authorized-but-not-captured payment and displays pending capture message without issuing ticket', async () => {
      let capturedOptions: any = null;
      class MockRazorpay {
        constructor(options: any) {
          capturedOptions = options;
        }
        open() {}
        on() {}
      }
      (window as any).Razorpay = MockRazorpay;

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            bookingId: 'DMRC-DEMO-202610-AUTHFAIL',
            orderId: 'order_test_authfail',
            amount: 5000,
            currency: 'INR',
            keyId: 'rzp_test_123',
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({
            success: false,
            error: 'Payment is authorized but not yet captured. Ticket will be issued upon capture confirmation.',
            code: 'PAYMENT_AUTHORIZED_PENDING_CAPTURE',
          }),
        } as Response);

      useTicketStore.getState().openBookingModal({
        source: mockSource,
        destination: mockDestination,
        route: mockRoute,
      });

      render(<BookingModal />);

      const payButton = document.getElementById('btn-confirm-demo-booking');
      fireEvent.click(payButton!);

      await waitFor(() => {
        expect(capturedOptions).not.toBeNull();
      });

      await act(async () => {
        await capturedOptions.handler({
          razorpay_payment_id: 'pay_test_authorized',
          razorpay_order_id: 'order_test_authfail',
          razorpay_signature: 'sig_authorized',
        });
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Payment is authorized but not yet captured/i)
        ).toBeDefined();
      });

      expect(useTicketStore.getState().tickets).toHaveLength(0);
      expect(screen.queryByText(/✓ TEST PAID/i)).toBeNull();
    });

    it('handles Razorpay API outage (502 fail-closed) gracefully without issuing a ticket', async () => {
      let capturedOptions: any = null;
      class MockRazorpay {
        constructor(options: any) {
          capturedOptions = options;
        }
        open() {}
        on() {}
      }
      (window as any).Razorpay = MockRazorpay;

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            bookingId: 'DMRC-DEMO-202610-OUTAGEFAIL',
            orderId: 'order_test_outagefail',
            amount: 5000,
            currency: 'INR',
            keyId: 'rzp_test_123',
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          json: async () => ({
            success: false,
            error: 'Payment provider verification service temporarily unavailable. Please retry verification.',
            code: 'PROVIDER_UNAVAILABLE',
          }),
        } as Response);

      useTicketStore.getState().openBookingModal({
        source: mockSource,
        destination: mockDestination,
        route: mockRoute,
      });

      render(<BookingModal />);

      const payButton = document.getElementById('btn-confirm-demo-booking');
      fireEvent.click(payButton!);

      await waitFor(() => {
        expect(capturedOptions).not.toBeNull();
      });

      await act(async () => {
        await capturedOptions.handler({
          razorpay_payment_id: 'pay_test_outage',
          razorpay_order_id: 'order_test_outagefail',
          razorpay_signature: 'sig_outage',
        });
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Payment provider verification service temporarily unavailable/i)
        ).toBeDefined();
      });

      expect(useTicketStore.getState().tickets).toHaveLength(0);
      expect(screen.queryByText(/✓ TEST PAID/i)).toBeNull();
    });
  });

  describe('Razorpay Script Deduplication', () => {
    it('does not insert duplicate script tags when loadRazorpayCheckoutScript is called repeatedly', async () => {
      delete (window as any).Razorpay;

      // Ensure any existing script is removed
      const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
      if (existing) existing.remove();

      // Trigger first load
      const p1 = paymentService.loadRazorpayCheckoutScript();

      // Find the injected script tag
      const script = document.querySelector('script[src*="checkout.razorpay.com"]') as HTMLScriptElement;
      expect(script).not.toBeNull();

      // Call load again while pending
      const p2 = paymentService.loadRazorpayCheckoutScript();

      // Should still only have 1 script tag in the DOM
      const scripts = document.querySelectorAll('script[src*="checkout.razorpay.com"]');
      expect(scripts).toHaveLength(1);

      // Trigger onload to resolve promises
      (window as any).Razorpay = class DummyRazorpay {};
      script.dispatchEvent(new Event('load'));

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1).toBe(true);
      expect(res2).toBe(true);
    });
  });

  describe('Planner-to-Booking Data Handoff Integrity', () => {
    it('accurately transfers origin, destination, line badges, and interchange stations from planner to modal and ticket', async () => {
      // Preselect route from planner
      useTicketStore.getState().openBookingModal({
        source: mockSource,
        destination: mockDestination,
        route: mockRoute,
      });

      render(<BookingModal />);

      // Verify origin and destination inputs are populated
      const sourceInput = screen.getByLabelText(/Origin \(From\)/i) as HTMLInputElement;
      const destInput = screen.getByLabelText(/Destination \(To\)/i) as HTMLInputElement;
      expect(sourceInput.value).toBe('Kashmere Gate');
      expect(destInput.value).toBe('Botanical Garden');

      // Verify route summary details
      expect(screen.getByText('Fastest Route')).toBeDefined();
      expect(screen.getByText(/18 stations/i)).toBeDefined();

      // Verify line badges rendered
      expect(screen.getAllByText(/Violet Line/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Blue Line/i).length).toBeGreaterThanOrEqual(1);

      // Verify interchange transfer station rendered
      expect(screen.getByText(/Transfer At/i)).toBeDefined();
      expect(screen.getAllByText('Botanical Garden').length).toBeGreaterThanOrEqual(1);

      // Switch to Demo Mode and issue ticket
      const demoTabButton = screen.getByRole('button', { name: /Demo Mode \(No Payment\)/i });
      fireEvent.click(demoTabButton);

      const issueDemoButton = screen.getByRole('button', { name: /Issue Demo Ticket/i });
      fireEvent.click(issueDemoButton);

      // Verify issued ticket preserves full itinerary metadata
      await waitFor(() => {
        const ticket = useTicketStore.getState().tickets[0];
        expect(ticket).toBeDefined();
        expect(ticket.source.id).toBe('KASHMERE_GATE');
        expect(ticket.destination.id).toBe('BOTANICAL_GARDEN');
        expect(ticket.routeSummary.lines).toEqual(['VIOLET', 'BLUE']);
        expect(ticket.routeSummary.interchangeStations).toEqual(['Botanical Garden']);
        expect(ticket.routeSummary.totalStations).toBe(18);
      });
    });
  });

  describe('Mobile & Small Viewport Layout Safeguards', () => {
    it('ensures modal incorporates scroll containment and docked primary checkout CTA', () => {
      useTicketStore.getState().openBookingModal({
        source: mockSource,
        destination: mockDestination,
        route: mockRoute,
      });

      const { container } = render(<BookingModal />);

      // Verify outer modal card has safe max height to prevent overflow on short viewports (<650px)
      const modalCard = container.querySelector('.glass-card');
      expect(modalCard).not.toBeNull();
      expect(modalCard?.className).toContain('max-h-[calc(100dvh-1.5rem)]');
      expect(modalCard?.className).toContain('flex flex-col');
      expect(modalCard?.className).toContain('overflow-hidden');

      // Verify scrollable body exists for form fields with overscroll containment
      const scrollBody = container.querySelector('.overscroll-contain');
      expect(scrollBody).not.toBeNull();
      expect(scrollBody?.className).toContain('overflow-y-auto');

      // Verify primary checkout button is rendered and has full-width mobile class
      const checkoutBtn = document.getElementById('btn-confirm-demo-booking');
      expect(checkoutBtn).not.toBeNull();
      expect(checkoutBtn?.className).toContain('w-full');
      expect(checkoutBtn?.className).toContain('sm:w-auto');

      // Verify mode selector stacks vertically on mobile viewports (<375px)
      const modeContainer = document.getElementById('btn-mode-payment')?.parentElement;
      expect(modeContainer?.className).toContain('grid-cols-1');
      expect(modeContainer?.className).toContain('sm:grid-cols-2');
    });
  });
});


