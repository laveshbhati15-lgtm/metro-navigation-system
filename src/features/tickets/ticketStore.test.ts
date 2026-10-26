import { describe, it, expect, beforeEach } from 'vitest';
import { useTicketStore } from './ticketStore';
import type { Station, MetroRoute } from '@/core/graph/types';

describe('Ticket Booking Store & Workflow (useTicketStore)', () => {
  const dummySource: Station = {
    id: 'KASHMERE_GATE',
    name: 'Kashmere Gate',
    nameHindi: 'कश्मीरी गेट',
    lines: ['YELLOW', 'VIOLET', 'RED'],
    coordinates: { lat: 28.6675, lng: 77.2285 },
    isInterchange: true,
    zone: 1,
  };

  const dummyDestination: Station = {
    id: 'BOTANICAL_GARDEN',
    name: 'Botanical Garden',
    nameHindi: 'बॉटनिकल गार्डन',
    lines: ['BLUE', 'MAGENTA'],
    coordinates: { lat: 28.5641, lng: 77.3342 },
    isInterchange: true,
    zone: 2,
  };

  const dummyRoute: MetroRoute = {
    label: 'Fastest Route',
    totalTimeSeconds: 2400,
    totalStations: 18,
    interchangeCount: 1,
    stations: [dummySource, dummyDestination],
    edges: [
      { from: 'KASHMERE_GATE', to: 'MANDI_HOUSE', line: 'VIOLET', travelTimeSeconds: 720 },
      { from: 'MANDI_HOUSE', to: 'BOTANICAL_GARDEN', line: 'BLUE', travelTimeSeconds: 1680 },
    ],
    interchanges: [dummyDestination],
    lineSegments: [],
    hasEstimatedTimes: false,
  };

  beforeEach(() => {
    // Clear tickets and reset store before each test
    useTicketStore.getState().clearHistory();
    useTicketStore.getState().closeBookingModal();
    useTicketStore.getState().closeHistoryModal();
  });

  it('creates a demo ticket with a valid unique DMRC-DEMO booking ID', () => {
    const store = useTicketStore.getState();
    const ticket = store.createDemoTicket({
      source: dummySource,
      destination: dummyDestination,
      route: dummyRoute,
      passengerCount: 2,
      ticketType: 'SINGLE',
    });

    expect(ticket.id).toMatch(/^DMRC-DEMO-\d{6}-[A-Z0-9]{6}$/);
    expect(ticket.status).toBe('ACTIVE');
    expect(ticket.source.id).toBe('KASHMERE_GATE');
    expect(ticket.destination.id).toBe('BOTANICAL_GARDEN');
    expect(ticket.passengerCount).toBe(2);
    expect(ticket.ticketType).toBe('SINGLE');
    expect(ticket.routeSummary.totalStations).toBe(18);
    expect(ticket.routeSummary.interchangeCount).toBe(1);
    expect(ticket.routeSummary.lines).toEqual(['VIOLET', 'BLUE']);
  });

  it('enforces non-official demo disclaimer on every demo ticket', () => {
    const store = useTicketStore.getState();
    const ticket = store.createDemoTicket({
      source: dummySource,
      destination: dummyDestination,
      route: dummyRoute,
      passengerCount: 1,
      ticketType: 'SINGLE',
    });

    const EXPECTED_DISCLAIMER = 'DEMO — NOT VALID FOR METRO TRAVEL';
    expect(ticket.disclaimer).toBe(EXPECTED_DISCLAIMER);

    // Verify QR payload is scannable JSON and explicitly marks valid: false with demo disclaimer
    const qrObj = JSON.parse(ticket.qrPayload);
    expect(qrObj.valid).toBe(false);
    expect(qrObj.type).toBe('DEMO_TICKET');
    expect(qrObj.disclaimer).toBe(EXPECTED_DISCLAIMER);
    expect(qrObj.bookingId).toBe(ticket.id);
    expect(qrObj.source.name).toBe('Kashmere Gate');
    expect(qrObj.destination.name).toBe('Botanical Garden');
  });

  it('calculates single and return fares accurately for passenger counts', () => {
    const store = useTicketStore.getState();

    // 1 passenger single: baseFare for 18 stations is 50
    const singleTicket = store.createDemoTicket({
      source: dummySource,
      destination: dummyDestination,
      route: dummyRoute,
      passengerCount: 1,
      ticketType: 'SINGLE',
    });
    expect(singleTicket.baseFare).toBe(50);
    expect(singleTicket.totalFare).toBe(50);

    // 3 passengers single
    const groupTicket = store.createDemoTicket({
      source: dummySource,
      destination: dummyDestination,
      route: dummyRoute,
      passengerCount: 3,
      ticketType: 'SINGLE',
    });
    expect(groupTicket.totalFare).toBe(150);

    // 2 passengers return (1.8x multiplier)
    const returnTicket = store.createDemoTicket({
      source: dummySource,
      destination: dummyDestination,
      route: dummyRoute,
      passengerCount: 2,
      ticketType: 'RETURN',
    });
    // 50 * 2 * 1.8 = 180
    expect(returnTicket.totalFare).toBe(180);
  });

  it('handles cancellation and history management', () => {
    const store = useTicketStore.getState();

    const t1 = store.createDemoTicket({
      source: dummySource,
      destination: dummyDestination,
      route: dummyRoute,
      passengerCount: 1,
      ticketType: 'SINGLE',
    });

    const t2 = store.createDemoTicket({
      source: dummySource,
      destination: dummyDestination,
      route: dummyRoute,
      passengerCount: 2,
      ticketType: 'SINGLE',
    });

    expect(useTicketStore.getState().tickets).toHaveLength(2);

    // Cancel ticket 1
    useTicketStore.getState().cancelDemoTicket(t1.id);
    const updatedT1 = useTicketStore.getState().getTicketById(t1.id);
    expect(updatedT1?.status).toBe('CANCELLED');

    // Ticket 2 remains active
    const updatedT2 = useTicketStore.getState().getTicketById(t2.id);
    expect(updatedT2?.status).toBe('ACTIVE');

    // Clear history
    useTicketStore.getState().clearHistory();
    expect(useTicketStore.getState().tickets).toHaveLength(0);
  });

  it('rejects invalid routes: identical source and destination or empty route edges', () => {
    const store = useTicketStore.getState();

    // Identical source and destination
    expect(() => {
      store.createDemoTicket({
        source: dummySource,
        destination: dummySource,
        route: {
          ...dummyRoute,
          stations: [dummySource],
          edges: [],
          totalStations: 1,
        },
      });
    }).toThrow(/Source and Destination stations cannot be identical/);

    // Empty route edges
    expect(() => {
      store.createDemoTicket({
        source: dummySource,
        destination: dummyDestination,
        route: {
          ...dummyRoute,
          stations: [dummySource, dummyDestination],
          edges: [],
          totalStations: 0,
        },
      });
    }).toThrow(/valid route with at least two connected stations is required/);
  });

  it('clamps passenger count within valid bounds (1 to 6)', () => {
    const store = useTicketStore.getState();

    // Less than 1 should clamp to 1
    const ticketMin = store.createDemoTicket({
      source: dummySource,
      destination: dummyDestination,
      route: dummyRoute,
      passengerCount: 0,
      ticketType: 'SINGLE',
    });
    expect(ticketMin.passengerCount).toBe(1);
    expect(ticketMin.totalFare).toBe(ticketMin.baseFare * 1);

    // Greater than 6 should clamp to 6
    const ticketMax = store.createDemoTicket({
      source: dummySource,
      destination: dummyDestination,
      route: dummyRoute,
      passengerCount: 99,
      ticketType: 'SINGLE',
    });
    expect(ticketMax.passengerCount).toBe(6);
    expect(ticketMax.totalFare).toBe(ticketMax.baseFare * 6);
  });

  it('validates comprehensive QR payload fields and validity flags', () => {
    const store = useTicketStore.getState();
    const ticket = store.createDemoTicket({
      source: dummySource,
      destination: dummyDestination,
      route: dummyRoute,
      passengerCount: 3,
      ticketType: 'RETURN',
    });

    const qr = JSON.parse(ticket.qrPayload);
    expect(qr.app).toBe('DELHI_METRO_NAVIGATOR');
    expect(qr.bookingId).toBe(ticket.id);
    expect(qr.type).toBe('DEMO_TICKET');
    expect(qr.valid).toBe(false);
    expect(qr.disclaimer).toBe('DEMO — NOT VALID FOR METRO TRAVEL');
    expect(qr.source.id).toBe('KASHMERE_GATE');
    expect(qr.source.name).toBe('Kashmere Gate');
    expect(qr.destination.id).toBe('BOTANICAL_GARDEN');
    expect(qr.destination.name).toBe('Botanical Garden');
    expect(qr.passengers).toBe(3);
    expect(qr.ticketType).toBe('RETURN');
    expect(qr.totalFare).toBe(ticket.totalFare);
    expect(new Date(qr.issuedAt).getTime()).toBeLessThanOrEqual(Date.now());
    expect(new Date(qr.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('manages modal lifecycle and journey planner preselection', () => {
    const store = useTicketStore.getState();

    store.openBookingModal({
      source: dummySource,
      destination: dummyDestination,
      route: dummyRoute,
    });

    const state = useTicketStore.getState();
    expect(state.isBookingModalOpen).toBe(true);
    expect(state.preselectedSource?.id).toBe('KASHMERE_GATE');
    expect(state.preselectedDestination?.id).toBe('BOTANICAL_GARDEN');
    expect(state.preselectedRoute?.label).toBe('Fastest Route');

    store.closeBookingModal();
    const closedState = useTicketStore.getState();
    expect(closedState.isBookingModalOpen).toBe(false);
    expect(closedState.preselectedSource).toBeNull();
    expect(closedState.preselectedDestination).toBeNull();
    expect(closedState.preselectedRoute).toBeNull();
  });

  it('allows viewing and switching between past tickets in history', () => {
    const store = useTicketStore.getState();

    const t1 = store.createDemoTicket({
      source: dummySource,
      destination: dummyDestination,
      route: dummyRoute,
      passengerCount: 1,
    });

    const t2 = store.createDemoTicket({
      source: dummySource,
      destination: dummyDestination,
      route: dummyRoute,
      passengerCount: 2,
    });

    store.setActiveTicketId(t1.id);
    expect(useTicketStore.getState().activeTicketId).toBe(t1.id);

    store.setActiveTicketId(t2.id);
    expect(useTicketStore.getState().activeTicketId).toBe(t2.id);

    const retrieved = store.getTicketById(t1.id);
    expect(retrieved?.id).toBe(t1.id);
  });

  it('marks fallback tickets as UNVERIFIED_DEMO and never as paid', () => {
    const store = useTicketStore.getState();
    const fallbackTicket = store.createDemoTicket({
      source: dummySource,
      destination: dummyDestination,
      route: dummyRoute,
      passengerCount: 1,
      ticketType: 'SINGLE',
      paymentStatus: 'UNVERIFIED_DEMO',
      isVerifiedPayment: false,
    });

    expect(fallbackTicket.paymentStatus).toBe('UNVERIFIED_DEMO');
    expect(fallbackTicket.isVerifiedPayment).toBe(false);
    expect(fallbackTicket.razorpayOrderId).toBeUndefined();
    expect(fallbackTicket.razorpayPaymentId).toBeUndefined();
    expect(fallbackTicket.disclaimer).toBe('DEMO — NOT VALID FOR METRO TRAVEL');
  });

  it('correctly creates and saves a verified paid demo ticket with Razorpay IDs', () => {
    const store = useTicketStore.getState();
    const mockVerifiedTicket = {
      id: 'DMRC-DEMO-VERIFIED-123',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      source: dummySource,
      destination: dummyDestination,
      routeSummary: {
        label: dummyRoute.label,
        totalTimeSeconds: dummyRoute.totalTimeSeconds,
        totalStations: dummyRoute.totalStations,
        interchangeCount: dummyRoute.interchangeCount,
        lines: ['VIOLET', 'BLUE'] as any,
        interchangeStations: [dummyDestination.name],
      },
      passengerCount: 2,
      ticketType: 'RETURN' as const,
      baseFare: 50,
      totalFare: 180,
      status: 'ACTIVE' as const,
      paymentStatus: 'PAID' as const,
      isVerifiedPayment: true,
      razorpayOrderId: 'order_test_99999',
      razorpayPaymentId: 'pay_test_88888',
      disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
      qrPayload: JSON.stringify({ bookingId: 'DMRC-DEMO-VERIFIED-123', valid: false }),
    };

    const verifiedTicket = store.saveVerifiedTicket(mockVerifiedTicket);

    expect(verifiedTicket.id).toBe('DMRC-DEMO-VERIFIED-123');
    expect(verifiedTicket.paymentStatus).toBe('PAID');
    expect(verifiedTicket.isVerifiedPayment).toBe(true);
    expect(verifiedTicket.razorpayOrderId).toBe('order_test_99999');
    expect(verifiedTicket.razorpayPaymentId).toBe('pay_test_88888');
    expect(verifiedTicket.disclaimer).toBe('DEMO — NOT VALID FOR METRO TRAVEL');

    // Also verify it's the active ticket in store and in history
    expect(useTicketStore.getState().activeTicketId).toBe('DMRC-DEMO-VERIFIED-123');
    const stored = useTicketStore.getState().tickets.find((t) => t.id === 'DMRC-DEMO-VERIFIED-123');
    expect(stored).toBeDefined();
    expect(stored?.isVerifiedPayment).toBe(true);
  });
});
