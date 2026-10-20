import { create } from 'zustand';
import type { Station, MetroRoute, DijkstraResult } from '@/core/graph/types';
import { metroGraph } from '@/core/graph/MetroGraph';
import { planRoutes } from '@/core/algorithm/routePlanner';
import { dijkstra } from '@/core/algorithm/dijkstra';

export type ActiveView = 'map' | 'visualizer';

interface JourneyState {
  source: Station | null;
  destination: Station | null;
  routes: MetroRoute[];
  activeRouteIndex: number;
  dijkstraResult: DijkstraResult | null;
  activeView: ActiveView;
  hoveredStation: Station | null;
  isLoading: boolean;
  error: string | null;
  indoorStation: Station | null;
  accessiblePreference: boolean;

  // Actions
  setSource: (station: Station | null) => void;
  setDestination: (station: Station | null) => void;
  setSourceById: (stationId: string) => void;
  setDestinationById: (stationId: string) => void;
  swapStations: () => void;
  setActiveRouteIndex: (index: number) => void;
  setActiveView: (view: ActiveView) => void;
  setHoveredStation: (station: Station | null) => void;
  setIndoorStation: (station: Station | null) => void;
  setAccessiblePreference: (enabled: boolean) => void;
  calculateRoutes: () => void;
  resetJourney: () => void;
}

export const useJourneyStore = create<JourneyState>((set, get) => ({
  source: null,
  destination: null,
  routes: [],
  activeRouteIndex: 0,
  dijkstraResult: null,
  activeView: 'map',
  hoveredStation: null,
  indoorStation: null,
  accessiblePreference: false,
  isLoading: false,
  error: null,

  setSource: (station) => {
    const { routes, dijkstraResult } = get();
    // Invalidate stale routes if the origin station changes
    const isStale = routes.length > 0 && routes[0]?.stations[0]?.id !== station?.id;
    set({
      source: station,
      routes: isStale ? [] : routes,
      dijkstraResult: isStale ? null : dijkstraResult,
      activeRouteIndex: isStale ? 0 : get().activeRouteIndex,
      error: null,
    });
  },

  setDestination: (station) => {
    const { routes, dijkstraResult } = get();
    // Invalidate stale routes if the destination station changes
    const lastIdx = routes[0]?.stations.length ? routes[0].stations.length - 1 : 0;
    const isStale = routes.length > 0 && routes[0]?.stations[lastIdx]?.id !== station?.id;
    set({
      destination: station,
      routes: isStale ? [] : routes,
      dijkstraResult: isStale ? null : dijkstraResult,
      activeRouteIndex: isStale ? 0 : get().activeRouteIndex,
      error: null,
    });
  },

  setSourceById: (stationId) => {
    const station = metroGraph.getStation(stationId) ?? null;
    if (station) {
      get().setSource(station);
    }
  },

  setDestinationById: (stationId) => {
    const station = metroGraph.getStation(stationId) ?? null;
    if (station) {
      get().setDestination(station);
    }
  },

  swapStations: () => {
    const { source, destination, routes } = get();
    const hadActiveRoute = routes.length > 0;
    set({
      source: destination,
      destination: source,
      routes: [],
      dijkstraResult: null,
      activeRouteIndex: 0,
      error: null,
    });

    // If an active route was already displayed and both swapped stations are valid and distinct, recalculate immediately
    if (hadActiveRoute && destination && source && destination.id !== source.id) {
      get().calculateRoutes();
    }
  },

  setActiveRouteIndex: (index) => {
    const { routes, source, destination } = get();
    const route = routes[index];
    let newDijkstraResult = get().dijkstraResult;

    if (route && source && destination) {
      const strategyMap: Record<string, 'FASTEST' | 'FEWEST_STOPS' | 'FEWEST_INTERCHANGES'> = {
        'Fastest': 'FASTEST',
        'Fewest Stops': 'FEWEST_STOPS',
        'Fewest Interchanges': 'FEWEST_INTERCHANGES',
      };
      const strat = strategyMap[route.label] || 'FASTEST';
      newDijkstraResult = dijkstra(metroGraph, source.id, destination.id, { strategy: strat });
    }

    set({ activeRouteIndex: index, dijkstraResult: newDijkstraResult });
  },

  setActiveView: (view) => {
    set({ activeView: view });
  },

  setHoveredStation: (station) => {
    set({ hoveredStation: station });
  },

  setIndoorStation: (station) => {
    set({ indoorStation: station });
  },

  setAccessiblePreference: (enabled) => {
    set({ accessiblePreference: enabled });
  },

  calculateRoutes: () => {
    const { source, destination } = get();
    if (!source || !destination) {
      set({
        routes: [],
        dijkstraResult: null,
        error: 'Please select both a source and destination station.',
      });
      return;
    }

    if (source.id === destination.id) {
      set({
        routes: [],
        dijkstraResult: null,
        error: 'Source and destination cannot be the same station.',
      });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const foundRoutes = planRoutes(metroGraph, source.id, destination.id);
      const singleDijkstra = dijkstra(metroGraph, source.id, destination.id, { strategy: 'FASTEST' });

      if (foundRoutes.length === 0) {
        set({
          routes: [],
          dijkstraResult: singleDijkstra,
          isLoading: false,
          error: `No route found between "${source.name}" and "${destination.name}" on the current network.`,
        });
      } else {
        set({
          routes: foundRoutes,
          activeRouteIndex: 0,
          dijkstraResult: singleDijkstra,
          isLoading: false,
          error: null,
        });
      }
    } catch (err) {
      console.error('Route calculation error:', err);
      set({
        routes: [],
        dijkstraResult: null,
        isLoading: false,
        error: 'An unexpected error occurred during route calculation.',
      });
    }
  },

  resetJourney: () => {
    set({
      source: null,
      destination: null,
      routes: [],
      activeRouteIndex: 0,
      dijkstraResult: null,
      error: null,
      hoveredStation: null,
      indoorStation: null,
    });
  },
}));
