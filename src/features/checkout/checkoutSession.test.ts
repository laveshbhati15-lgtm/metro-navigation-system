import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveCheckoutSession,
  getCheckoutSession,
  clearCheckoutSession,
  buildCheckoutUrl,
  navigateToCheckout,
  CHECKOUT_SESSION_KEY,
} from './checkoutSession';
import { metroGraph } from '@/core/graph/MetroGraph';

describe('checkoutSession Utilities', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  const samaypur = metroGraph.getStation('SAMAYPUR_BADLI')!;
  const rajivChowk = metroGraph.getStation('RAJIV_CHOWK')!;

  it('saves and retrieves checkout session safely in sessionStorage', () => {
    saveCheckoutSession({
      sourceId: samaypur.id,
      destinationId: rajivChowk.id,
      sourceName: samaypur.name,
      destinationName: rajivChowk.name,
      passengerCount: 2,
      ticketType: 'RETURN',
      createdAt: Date.now(),
    });

    const retrieved = getCheckoutSession();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.sourceId).toBe('SAMAYPUR_BADLI');
    expect(retrieved?.destinationId).toBe('RAJIV_CHOWK');
    expect(retrieved?.passengerCount).toBe(2);
    expect(retrieved?.ticketType).toBe('RETURN');
  });

  it('clears checkout session cleanly', () => {
    saveCheckoutSession({
      sourceId: samaypur.id,
      destinationId: rajivChowk.id,
      createdAt: Date.now(),
    });

    expect(sessionStorage.getItem(CHECKOUT_SESSION_KEY)).not.toBeNull();
    clearCheckoutSession();
    expect(sessionStorage.getItem(CHECKOUT_SESSION_KEY)).toBeNull();
    expect(getCheckoutSession()).toBeNull();
  });

  it('builds authoritative query string with query parameters including valid theme', () => {
    const urlDark = buildCheckoutUrl({
      sourceId: 'SAMAYPUR_BADLI',
      destinationId: 'RAJIV_CHOWK',
      routeLabel: 'Fastest',
      ticketType: 'RETURN',
      passengerCount: 3,
      theme: 'dark-transit',
    });
    expect(urlDark).toBe('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK&type=RETURN&passengers=3&route=Fastest&theme=dark-transit');

    const urlLight = buildCheckoutUrl({
      sourceId: 'SAMAYPUR_BADLI',
      destinationId: 'RAJIV_CHOWK',
      theme: 'light-metro',
    });
    expect(urlLight).toBe('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK&theme=light-metro');

    const urlMidnight = buildCheckoutUrl({
      sourceId: 'SAMAYPUR_BADLI',
      destinationId: 'RAJIV_CHOWK',
      theme: 'midnight-blue',
    });
    expect(urlMidnight).toBe('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK&theme=midnight-blue');

    const urlInvalid = buildCheckoutUrl({
      sourceId: 'SAMAYPUR_BADLI',
      destinationId: 'RAJIV_CHOWK',
      theme: 'cyberpunk-neon' as any,
    });
    expect(urlInvalid).toBe('/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK');
  });

  it('navigateToCheckout saves session with theme and opens new tab with theme param', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => ({} as any));

    navigateToCheckout({
      source: samaypur,
      destination: rajivChowk,
      passengerCount: 2,
      ticketType: 'SINGLE',
      theme: 'light-metro',
    });

    expect(openSpy).toHaveBeenCalledWith(
      '/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK&type=SINGLE&passengers=2&theme=light-metro',
      '_blank'
    );

    const saved = getCheckoutSession();
    expect(saved?.sourceId).toBe('SAMAYPUR_BADLI');
    expect(saved?.destinationId).toBe('RAJIV_CHOWK');
    expect(saved?.theme).toBe('light-metro');
  });

  it('navigateToCheckout saves session and attempts to open new tab, with fallback', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const assignSpy = vi.fn();
    delete (window as any).location;
    window.location = { assign: assignSpy } as any;

    navigateToCheckout({
      source: samaypur,
      destination: rajivChowk,
      passengerCount: 2,
      ticketType: 'SINGLE',
    });

    expect(openSpy).toHaveBeenCalledWith(
      '/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK&type=SINGLE&passengers=2',
      '_blank'
    );
    // Since window.open returned null, it gracefully falls back to location.assign
    expect(assignSpy).toHaveBeenCalledWith(
      '/checkout?from=SAMAYPUR_BADLI&to=RAJIV_CHOWK&type=SINGLE&passengers=2'
    );

    const saved = getCheckoutSession();
    expect(saved?.sourceId).toBe('SAMAYPUR_BADLI');
    expect(saved?.destinationId).toBe('RAJIV_CHOWK');
  });
});

