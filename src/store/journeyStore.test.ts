import { describe, it, expect, beforeEach } from 'vitest';
import { useJourneyStore } from './journeyStore';
import { metroGraph } from '@/core/graph/MetroGraph';

describe('useJourneyStore', () => {
  beforeEach(() => {
    useJourneyStore.getState().resetJourney();
  });

  it('initializes with empty selection and routes', () => {
    const state = useJourneyStore.getState();
    expect(state.source).toBeNull();
    expect(state.destination).toBeNull();
    expect(state.routes).toHaveLength(0);
    expect(state.dijkstraResult).toBeNull();
    expect(state.activeView).toBe('map');
  });

  it('sets source and destination by object and ID', () => {
    const store = useJourneyStore.getState();
    store.setSourceById('CHANDNI_CHOWK');
    store.setDestinationById('HAUZ_KHAS');

    const updated = useJourneyStore.getState();
    expect(updated.source?.id).toBe('CHANDNI_CHOWK');
    expect(updated.destination?.id).toBe('HAUZ_KHAS');
  });

  it('swaps source and destination', () => {
    const store = useJourneyStore.getState();
    store.setSourceById('CHANDNI_CHOWK');
    store.setDestinationById('KAROL_BAGH');

    useJourneyStore.getState().swapStations();

    const swapped = useJourneyStore.getState();
    expect(swapped.source?.id).toBe('KAROL_BAGH');
    expect(swapped.destination?.id).toBe('CHANDNI_CHOWK');
  });

  it('calculates routes and populates both routes and dijkstraResult with steps', () => {
    const store = useJourneyStore.getState();
    const s = metroGraph.getStation('CHANDNI_CHOWK');
    const d = metroGraph.getStation('KAROL_BAGH');
    expect(s).toBeDefined();
    expect(d).toBeDefined();

    store.setSource(s!);
    store.setDestination(d!);

    store.calculateRoutes();

    const updated = useJourneyStore.getState();
    expect(updated.error).toBeNull();
    expect(updated.routes.length).toBeGreaterThan(0);
    expect(updated.dijkstraResult).not.toBeNull();
    expect(updated.dijkstraResult!.steps.length).toBeGreaterThan(0);
    expect(updated.dijkstraResult!.route).not.toBeNull();
  });

  it('prevents calculating routes when source and destination are identical', () => {
    const store = useJourneyStore.getState();
    const s = metroGraph.getStation('RAJIV_CHOWK');
    store.setSource(s!);
    store.setDestination(s!);

    store.calculateRoutes();

    const updated = useJourneyStore.getState();
    expect(updated.error).toBe('Source and destination cannot be the same station.');
    expect(updated.routes).toHaveLength(0);
  });

  it('toggles active view between map and visualizer', () => {
    const store = useJourneyStore.getState();
    store.setActiveView('visualizer');
    expect(useJourneyStore.getState().activeView).toBe('visualizer');
    store.setActiveView('map');
    expect(useJourneyStore.getState().activeView).toBe('map');
  });

  it('invalidates stale routes when source or destination changes', () => {
    const store = useJourneyStore.getState();
    const s1 = metroGraph.getStation('CHANDNI_CHOWK')!;
    const s2 = metroGraph.getStation('HAUZ_KHAS')!;
    const s3 = metroGraph.getStation('KASHMERE_GATE')!;

    store.setSource(s1);
    store.setDestination(s2);
    store.calculateRoutes();

    expect(useJourneyStore.getState().routes.length).toBeGreaterThan(0);

    // Changing source to a different station should invalidate the previous route
    store.setSource(s3);
    const afterSourceChange = useJourneyStore.getState();
    expect(afterSourceChange.routes).toHaveLength(0);
    expect(afterSourceChange.dijkstraResult).toBeNull();

    // Recalculate with new source
    store.calculateRoutes();
    expect(useJourneyStore.getState().routes.length).toBeGreaterThan(0);

    // Changing destination should also invalidate the previous route
    store.setDestination(s1);
    const afterDestChange = useJourneyStore.getState();
    expect(afterDestChange.routes).toHaveLength(0);
    expect(afterDestChange.dijkstraResult).toBeNull();
  });

  it('automatically recalculates the swapped journey if a route was already calculated', () => {
    const store = useJourneyStore.getState();
    const s = metroGraph.getStation('CHANDNI_CHOWK')!;
    const d = metroGraph.getStation('KAROL_BAGH')!;

    store.setSource(s);
    store.setDestination(d);
    store.calculateRoutes();

    const forwardRoute = useJourneyStore.getState().routes[0];
    expect(forwardRoute.stations[0].id).toBe('CHANDNI_CHOWK');
    expect(forwardRoute.stations[forwardRoute.stations.length - 1].id).toBe('KAROL_BAGH');

    // Swap stations
    store.swapStations();

    const reversedState = useJourneyStore.getState();
    expect(reversedState.source?.id).toBe('KAROL_BAGH');
    expect(reversedState.destination?.id).toBe('CHANDNI_CHOWK');
    expect(reversedState.routes.length).toBeGreaterThan(0);
    const reversedRoute = reversedState.routes[0];
    expect(reversedRoute.stations[0].id).toBe('KAROL_BAGH');
    expect(reversedRoute.stations[reversedRoute.stations.length - 1].id).toBe('CHANDNI_CHOWK');
  });
});
