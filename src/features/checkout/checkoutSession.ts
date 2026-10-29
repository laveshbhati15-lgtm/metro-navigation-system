import type { Station, MetroRoute, LineCode } from '@/core/graph/types';
import type { TicketType } from '@/features/tickets/types';
import {
  type PlannerTheme,
  isValidPlannerTheme,
} from '@/context/PlannerThemeContext';

export const CHECKOUT_SESSION_KEY = 'metropay_checkout_session';

export interface CheckoutSessionData {
  sourceId: string;
  destinationId: string;
  sourceName?: string;
  destinationName?: string;
  routeLabel?: string;
  totalTimeSeconds?: number;
  totalStations?: number;
  interchangeCount?: number;
  lines?: LineCode[];
  passengerCount?: number;
  ticketType?: TicketType;
  fareAmount?: number;
  theme?: PlannerTheme;
  createdAt: number;
}

/**
 * Saves non-sensitive booking parameters to sessionStorage for the checkout handoff.
 * No credentials, API keys, or payment secrets are ever stored.
 */
export function saveCheckoutSession(data: CheckoutSessionData): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(CHECKOUT_SESSION_KEY, JSON.stringify(data));
  } catch {
    // sessionStorage quota or security restriction fallback
  }
}

/**
 * Retrieves the stored checkout session from sessionStorage.
 */
export function getCheckoutSession(): CheckoutSessionData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.sourceId && parsed.destinationId) {
      return parsed as CheckoutSessionData;
    }
  } catch {
    // Parse error
  }
  return null;
}

/**
 * Clears the active checkout session from sessionStorage.
 */
export function clearCheckoutSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(CHECKOUT_SESSION_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Generates the authoritative checkout URL with query parameters as fallback
 * so checkout remains resilient even if opened directly, refreshed, or in incognito.
 */
export function buildCheckoutUrl(params: {
  sourceId: string;
  destinationId: string;
  routeLabel?: string;
  ticketType?: TicketType;
  passengerCount?: number;
  theme?: PlannerTheme;
}): string {
  const searchParams = new URLSearchParams();
  searchParams.set('from', params.sourceId);
  searchParams.set('to', params.destinationId);
  if (params.ticketType) searchParams.set('type', params.ticketType);
  if (params.passengerCount) searchParams.set('passengers', String(params.passengerCount));
  if (params.routeLabel) searchParams.set('route', params.routeLabel);
  if (params.theme && isValidPlannerTheme(params.theme)) {
    searchParams.set('theme', params.theme);
  }

  return `/checkout?${searchParams.toString()}`;
}

/**
 * Prepares the booking handoff and navigates to the dedicated Checkout page.
 * Prefers opening in a new tab via window.open, with graceful same-tab navigation fallback.
 */
export function navigateToCheckout(
  params: {
    source: Station;
    destination: Station;
    route?: MetroRoute | null;
    passengerCount?: number;
    ticketType?: TicketType;
    theme?: PlannerTheme;
  },
  openInNewTab = true
): Window | null {
  const lines: LineCode[] = params.route
    ? Array.from(new Set(params.route.edges.map((e) => e.line)))
    : [];

  const validatedTheme = params.theme && isValidPlannerTheme(params.theme)
    ? params.theme
    : undefined;

  const sessionData: CheckoutSessionData = {
    sourceId: params.source.id,
    destinationId: params.destination.id,
    sourceName: params.source.name,
    destinationName: params.destination.name,
    routeLabel: params.route?.label,
    totalTimeSeconds: params.route?.totalTimeSeconds,
    totalStations: params.route?.totalStations,
    interchangeCount: params.route?.interchangeCount,
    lines,
    passengerCount: params.passengerCount || 1,
    ticketType: params.ticketType || 'SINGLE',
    theme: validatedTheme,
    createdAt: Date.now(),
  };

  saveCheckoutSession(sessionData);

  const checkoutUrl = buildCheckoutUrl({
    sourceId: params.source.id,
    destinationId: params.destination.id,
    routeLabel: params.route?.label,
    ticketType: params.ticketType,
    passengerCount: params.passengerCount,
    theme: validatedTheme,
  });

  if (typeof window === 'undefined') return null;

  if (openInNewTab) {
    try {
      const newTab = window.open(checkoutUrl, '_blank');
      if (newTab) {
        return newTab;
      }
    } catch {
      // Pop-up blocker or iframe restriction
    }
  }

  // Same-window navigation fallback
  window.location.assign(checkoutUrl);
  return null;
}
