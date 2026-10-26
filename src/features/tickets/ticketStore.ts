import { create } from 'zustand';
import type { Station, MetroRoute, LineCode } from '@/core/graph/types';
import type { DemoTicket, CreateTicketParams } from './types';
import { estimateFare } from '@/utils/formatters';

const STORAGE_KEY = 'delhi_metro_demo_tickets';

/**
 * Generates a unique, professional demo booking ID.
 * Format: DMRC-DEMO-YYYYMM-XXXXXX
 */
function generateDemoBookingId(): string {
  const date = new Date();
  const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const randomChars = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `DMRC-DEMO-${yearMonth}-${randomChars}`;
}

/**
 * Storage adapter abstraction.
 * Currently uses browser localStorage. If Firebase Authentication & Firestore
 * are configured in the environment, this adapter can be swapped out to persist
 * tickets to user-scoped Firestore documents (`users/{uid}/demo_tickets/{ticketId}`).
 */
export interface TicketStorageAdapter {
  loadTickets: () => DemoTicket[];
  saveTicket: (ticket: DemoTicket) => void;
  updateTicket: (ticket: DemoTicket) => void;
  clearTickets: () => void;
}

const LocalStorageAdapter: TicketStorageAdapter = {
  loadTickets: () => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('Failed to read demo tickets from localStorage:', e);
      return [];
    }
  },
  saveTicket: (ticket: DemoTicket) => {
    if (typeof window === 'undefined') return;
    try {
      const tickets = LocalStorageAdapter.loadTickets();
      const updated = [ticket, ...tickets.filter(t => t.id !== ticket.id)];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save demo ticket to localStorage:', e);
    }
  },
  updateTicket: (ticket: DemoTicket) => {
    if (typeof window === 'undefined') return;
    try {
      const tickets = LocalStorageAdapter.loadTickets();
      const updated = tickets.map(t => (t.id === ticket.id ? ticket : t));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to update demo ticket in localStorage:', e);
    }
  },
  clearTickets: () => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear demo tickets from localStorage:', e);
    }
  },
};

interface TicketState {
  tickets: DemoTicket[];
  activeTicketId: string | null;
  isBookingModalOpen: boolean;
  isHistoryModalOpen: boolean;
  preselectedSource: Station | null;
  preselectedDestination: Station | null;
  preselectedRoute: MetroRoute | null;

  // Actions
  createDemoTicket: (params: CreateTicketParams) => DemoTicket;
  saveVerifiedTicket: (ticket: DemoTicket) => DemoTicket;
  cancelDemoTicket: (id: string) => void;
  clearHistory: () => void;
  getTicketById: (id: string) => DemoTicket | undefined;
  openBookingModal: (params?: { source?: Station | null; destination?: Station | null; route?: MetroRoute | null }) => void;
  closeBookingModal: () => void;
  openHistoryModal: () => void;
  closeHistoryModal: () => void;
  setActiveTicketId: (id: string | null) => void;
}

export const useTicketStore = create<TicketState>((set, get) => ({
  tickets: LocalStorageAdapter.loadTickets(),
  activeTicketId: null,
  isBookingModalOpen: false,
  isHistoryModalOpen: false,
  preselectedSource: null,
  preselectedDestination: null,
  preselectedRoute: null,

  createDemoTicket: (params) => {
    const {
      source,
      destination,
      route,
      passengerCount = 1,
      ticketType = 'SINGLE',
      paymentStatus = 'UNVERIFIED_DEMO',
      isVerifiedPayment = false,
      razorpayOrderId,
      razorpayPaymentId,
    } = params;

    if (!source || !destination || source.id === destination.id) {
      throw new Error('Cannot issue ticket: Source and Destination stations cannot be identical or empty.');
    }

    if (!route || route.totalStations < 2 || !route.edges || route.edges.length === 0) {
      throw new Error('Cannot issue ticket: A valid route with at least two connected stations is required.');
    }

    const validPassengers = Math.max(1, Math.min(6, Math.floor(passengerCount) || 1));
    const baseFare = estimateFare(route.totalStations).amount;
    const returnMultiplier = ticketType === 'RETURN' ? 1.8 : 1;
    const totalFare = Math.round(baseFare * validPassengers * returnMultiplier);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours validity

    const id = generateDemoBookingId();
    const linesUsed: LineCode[] = Array.from(new Set(route.edges.map(e => e.line)));

    const qrData = {
      app: 'DELHI_METRO_NAVIGATOR',
      bookingId: id,
      type: 'DEMO_TICKET',
      valid: false,
      paymentStatus,
      isVerifiedPayment,
      razorpayOrderId: razorpayOrderId || null,
      razorpayPaymentId: razorpayPaymentId || null,
      disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
      source: { id: source.id, name: source.name },
      destination: { id: destination.id, name: destination.name },
      passengers: validPassengers,
      ticketType,
      totalFare,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    const newTicket: DemoTicket = {
      id,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      source,
      destination,
      routeSummary: {
        label: route.label,
        totalTimeSeconds: route.totalTimeSeconds,
        totalStations: route.totalStations,
        interchangeCount: route.interchangeCount,
        lines: linesUsed,
        interchangeStations: route.interchanges.map(s => s.name),
      },
      passengerCount: validPassengers,
      ticketType,
      baseFare,
      totalFare,
      status: 'ACTIVE',
      paymentStatus,
      isVerifiedPayment,
      razorpayOrderId,
      razorpayPaymentId,
      disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
      qrPayload: JSON.stringify(qrData),
    };

    LocalStorageAdapter.saveTicket(newTicket);

    set((state) => ({
      tickets: [newTicket, ...state.tickets],
      activeTicketId: newTicket.id,
    }));

    return newTicket;
  },

  saveVerifiedTicket: (ticket: DemoTicket) => {
    LocalStorageAdapter.saveTicket(ticket);
    set((state) => ({
      tickets: [ticket, ...state.tickets.filter((t) => t.id !== ticket.id)],
      activeTicketId: ticket.id,
    }));
    return ticket;
  },

  cancelDemoTicket: (id) => {
    const { tickets } = get();
    const updated = tickets.map(t => (t.id === id ? { ...t, status: 'CANCELLED' as const } : t));
    const target = updated.find(t => t.id === id);
    if (target) {
      LocalStorageAdapter.updateTicket(target);
    }
    set({ tickets: updated });
  },

  clearHistory: () => {
    LocalStorageAdapter.clearTickets();
    set({ tickets: [], activeTicketId: null });
  },

  getTicketById: (id) => {
    return get().tickets.find(t => t.id === id);
  },

  openBookingModal: (params) => {
    set({
      isBookingModalOpen: true,
      preselectedSource: params?.source ?? null,
      preselectedDestination: params?.destination ?? null,
      preselectedRoute: params?.route ?? null,
    });
  },

  closeBookingModal: () => {
    set({
      isBookingModalOpen: false,
      preselectedSource: null,
      preselectedDestination: null,
      preselectedRoute: null,
    });
  },

  openHistoryModal: () => {
    set({ isHistoryModalOpen: true });
  },

  closeHistoryModal: () => {
    set({ isHistoryModalOpen: false });
  },

  setActiveTicketId: (id) => {
    set({ activeTicketId: id });
  },
}));
