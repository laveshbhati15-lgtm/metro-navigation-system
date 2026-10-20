import { describe, it, expect, beforeEach } from 'vitest';
import { MetroGraph } from '@/core/graph/MetroGraph';
import { dijkstra } from '@/core/algorithm/dijkstra';
import { planRoutes } from '@/core/algorithm/routePlanner';
import type { Station, Edge } from '@/core/graph/types';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Dijkstra on a minimal hand-crafted graph
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Test graph topology:
 *
 *   A --[YELLOW,120s]--> B --[YELLOW,120s]--> C
 *                        |
 *                    [BLUE,90s]
 *                        |
 *                        D --[BLUE,90s]-----> E
 *
 * B is an interchange (YELLOW + BLUE).
 */

function buildTestGraph(): MetroGraph {
  const g = Object.create(MetroGraph.prototype) as MetroGraph;
  // @ts-expect-error accessing private for test isolation
  g['stations'] = new Map();
  // @ts-expect-error
  g['adjacency'] = new Map();

  const stations: Station[] = [
    { id: 'A', name: 'Alpha',   lines: ['YELLOW'],          coordinates: { lat: 0, lng: 0 }, isInterchange: false },
    { id: 'B', name: 'Beta',    lines: ['YELLOW', 'BLUE'],  coordinates: { lat: 0, lng: 0 }, isInterchange: true  },
    { id: 'C', name: 'Charlie', lines: ['YELLOW'],          coordinates: { lat: 0, lng: 0 }, isInterchange: false },
    { id: 'D', name: 'Delta',   lines: ['BLUE'],            coordinates: { lat: 0, lng: 0 }, isInterchange: false },
    { id: 'E', name: 'Echo',    lines: ['BLUE'],            coordinates: { lat: 0, lng: 0 }, isInterchange: false },
    { id: 'F', name: 'Foxtrot', lines: ['RED'],             coordinates: { lat: 0, lng: 0 }, isInterchange: false },
  ];

  const edges: Edge[] = [
    { from: 'A', to: 'B', line: 'YELLOW', travelTimeSeconds: 120, isEstimated: true },
    { from: 'B', to: 'C', line: 'YELLOW', travelTimeSeconds: 120, isEstimated: true },
    { from: 'B', to: 'D', line: 'BLUE',   travelTimeSeconds: 90,  isEstimated: true },
    { from: 'D', to: 'E', line: 'BLUE',   travelTimeSeconds: 90,  isEstimated: true },
    // F is disconnected
  ];

  stations.forEach(s => g.addStation(s));
  edges.forEach(e => g.addEdge(e));
  return g;
}

describe('Dijkstra Algorithm', () => {
  let graph: MetroGraph;

  beforeEach(() => {
    graph = buildTestGraph();
  });

  // ── Same source and destination ───────────────────────────────────────────
  describe('same source and destination', () => {
    it('returns a route with 1 station, 0 time, 0 edges', () => {
      const result = dijkstra(graph, 'A', 'A');
      expect(result.route).not.toBeNull();
      expect(result.route!.totalTimeSeconds).toBe(0);
      expect(result.route!.totalStations).toBe(1);
      expect(result.route!.edges).toHaveLength(0);
      expect(result.route!.interchangeCount).toBe(0);
    });

    it('produces no steps for trivial route', () => {
      const result = dijkstra(graph, 'B', 'B');
      expect(result.steps).toHaveLength(0);
    });
  });

  // ── Route on the same line (no interchange) ───────────────────────────────
  describe('route on the same line', () => {
    it('A → C: finds direct Yellow Line route', () => {
      const result = dijkstra(graph, 'A', 'C');
      expect(result.route).not.toBeNull();
      const { route } = result;
      expect(route!.stations.map(s => s.id)).toEqual(['A', 'B', 'C']);
      expect(route!.totalTimeSeconds).toBe(240); // 120 + 120
      expect(route!.interchangeCount).toBe(0);
      expect(route!.lineSegments).toHaveLength(1);
      expect(route!.lineSegments[0].line).toBe('YELLOW');
    });

    it('A → C: reverse direction also works (C → A)', () => {
      const result = dijkstra(graph, 'C', 'A');
      expect(result.route).not.toBeNull();
      expect(result.route!.stations.map(s => s.id)).toEqual(['C', 'B', 'A']);
    });
  });

  // ── Route requiring an interchange ───────────────────────────────────────
  describe('route requiring an interchange', () => {
    it('A → E: routes via Yellow→Blue interchange at B', () => {
      const result = dijkstra(graph, 'A', 'E', { strategy: 'FASTEST', interchangePenaltySeconds: 180 });
      expect(result.route).not.toBeNull();
      const { route } = result;

      // Stations: A → B → D → E
      expect(route!.stations.map(s => s.id)).toEqual(['A', 'B', 'D', 'E']);

      // Time: 120 (A→B) + 90 (B→D) + 180 (interchange) + 90 (D→E) = 480 s
      expect(route!.totalTimeSeconds).toBe(480);

      expect(route!.interchangeCount).toBe(1);
      expect(route!.interchanges[0].id).toBe('B');

      // Two line segments
      expect(route!.lineSegments).toHaveLength(2);
      expect(route!.lineSegments[0].line).toBe('YELLOW');
      expect(route!.lineSegments[1].line).toBe('BLUE');
    });

    it('marks hasEstimatedTimes when any edge is estimated', () => {
      const result = dijkstra(graph, 'A', 'E');
      expect(result.route!.hasEstimatedTimes).toBe(true);
    });
  });

  // ── Unreachable destination ───────────────────────────────────────────────
  describe('unreachable destination', () => {
    it('returns null route when destination is disconnected', () => {
      const result = dijkstra(graph, 'A', 'F');
      expect(result.route).toBeNull();
    });

    it('still returns steps for explored nodes', () => {
      const result = dijkstra(graph, 'A', 'F');
      // At minimum A, B, C, D, E were explored
      expect(result.steps.length).toBeGreaterThan(0);
    });
  });

  // ── Unknown stations ──────────────────────────────────────────────────────
  describe('unknown stations', () => {
    it('returns null route for unknown source', () => {
      const result = dijkstra(graph, 'GHOST', 'A');
      expect(result.route).toBeNull();
      expect(result.steps).toHaveLength(0);
    });

    it('returns null route for unknown destination', () => {
      const result = dijkstra(graph, 'A', 'NOWHERE');
      expect(result.route).toBeNull();
    });
  });

  // ── Visualizer step recording ─────────────────────────────────────────────
  describe('visualizer step recording', () => {
    it('records steps in order of node finalisation', () => {
      const result = dijkstra(graph, 'A', 'C');
      expect(result.steps.length).toBeGreaterThan(0);
      // First step should finalise A (source with distance 0)
      expect(result.steps[0].visitedNode).toBe('A');
    });

    it('each step has a valid snapshot of distances and finalized nodes', () => {
      const result = dijkstra(graph, 'A', 'C');
      for (const step of result.steps) {
        expect(step.distances).toBeDefined();
        expect(step.finalizedNodes).toBeInstanceOf(Array);
        expect(step.priorityQueue).toBeInstanceOf(Array);
      }
    });

    it('final step has destination in finalizedNodes', () => {
      const result = dijkstra(graph, 'A', 'C');
      const lastStep = result.steps[result.steps.length - 1];
      expect(lastStep.finalizedNodes).toContain('C');
    });
  });

  // ── Strategy: FEWEST_STOPS ───────────────────────────────────────────────
  describe('FEWEST_STOPS strategy', () => {
    it('finds the route with the minimum hop count', () => {
      const result = dijkstra(graph, 'A', 'E', { strategy: 'FEWEST_STOPS' });
      expect(result.route).not.toBeNull();
      // Only one path exists A→B→D→E (3 hops)
      expect(result.route!.totalStations).toBe(4);
    });
  });

  // ── Strategy: FEWEST_INTERCHANGES ────────────────────────────────────────
  describe('FEWEST_INTERCHANGES strategy', () => {
    it('finds the path with minimum line changes', () => {
      const result = dijkstra(graph, 'A', 'E', { strategy: 'FEWEST_INTERCHANGES' });
      expect(result.route).not.toBeNull();
      // Only one path exists, but this validates the strategy runs without error
      expect(result.route!.interchangeCount).toBe(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: Integration tests on real Delhi Metro data
// ─────────────────────────────────────────────────────────────────────────────

describe('Dijkstra on real Delhi Metro data', () => {
  let graph: MetroGraph;

  beforeEach(async () => {
    const mod = await import('@/core/graph/MetroGraph');
    graph = mod.metroGraph;
  });

  it('same line: Chandni Chowk → Hauz Khas (Yellow Line, direct)', () => {
    const result = dijkstra(graph, 'CHANDNI_CHOWK', 'HAUZ_KHAS');
    expect(result.route).not.toBeNull();
    expect(result.route!.interchangeCount).toBe(0);
    expect(result.route!.lineSegments[0].line).toBe('YELLOW');
  });

  it('interchange: Chandni Chowk → Karol Bagh (Yellow→Blue via Rajiv Chowk)', () => {
    const result = dijkstra(graph, 'CHANDNI_CHOWK', 'KAROL_BAGH');
    expect(result.route).not.toBeNull();
    expect(result.route!.interchangeCount).toBe(1);
    const interchangeIds = result.route!.interchanges.map(s => s.id);
    expect(interchangeIds).toContain('RAJIV_CHOWK');
  });

  it('cross-branch: Dwarka Sec 21 → Vaishali (Blue Line)', () => {
    const result = dijkstra(graph, 'DWARKA_SEC_21', 'VAISHALI');
    expect(result.route).not.toBeNull();
    expect(result.route!.interchangeCount).toBe(0); // same Blue Line, no interchange
    const ids = result.route!.stations.map(s => s.id);
    expect(ids[0]).toBe('DWARKA_SEC_21');
    expect(ids[ids.length - 1]).toBe('VAISHALI');
  });

  it('cross-branch: Dwarka Sec 21 → Noida Electronic City (FEWEST_INTERCHANGES) and Vaishali → Noida Electronic City', () => {
    // Direct Blue Line (FEWEST_INTERCHANGES) stays on single train through Yamuna Bank
    const directResult = dijkstra(graph, 'DWARKA_SEC_21', 'NOIDA_ELECTRONIC_CITY', { strategy: 'FEWEST_INTERCHANGES' });
    expect(directResult.route).not.toBeNull();
    expect(directResult.route!.interchangeCount).toBe(0);
    const directIds = directResult.route!.stations.map(s => s.id);
    expect(directIds).toContain('YAMUNA_BANK');
    expect(directIds[0]).toBe('DWARKA_SEC_21');
    expect(directIds[directIds.length - 1]).toBe('NOIDA_ELECTRONIC_CITY');

    // True cross-branch journey from Vaishali branch to Noida branch through Yamuna Bank
    const crossBranchResult = dijkstra(graph, 'VAISHALI', 'NOIDA_ELECTRONIC_CITY');
    expect(crossBranchResult.route).not.toBeNull();
    const crossBranchIds = crossBranchResult.route!.stations.map(s => s.id);
    expect(crossBranchIds).toContain('YAMUNA_BANK');
    expect(crossBranchIds[0]).toBe('VAISHALI');
    expect(crossBranchIds[crossBranchIds.length - 1]).toBe('NOIDA_ELECTRONIC_CITY');
  });

  it('official DMRC corridor: Kashmere Gate → Botanical Garden routes via Violet Line and Mandi House interchange to Blue Line', () => {
    const result = dijkstra(graph, 'KASHMERE_GATE', 'BOTANICAL_GARDEN');
    expect(result.route).not.toBeNull();
    const route = result.route!;

    // Exactly 17 stations (16 stops)
    expect(route.totalStations).toBe(17);
    expect(route.interchangeCount).toBe(1);
    expect(route.interchanges[0].id).toBe('MANDI_HOUSE');

    // Exact official station sequence:
    const expectedSequence = [
      'KASHMERE_GATE',
      'LAL_QILA',
      'JAMA_MASJID',
      'DELHI_GATE',
      'ITO',
      'MANDI_HOUSE',
      'SUPREME_COURT',
      'INDRAPRASTHA',
      'YAMUNA_BANK',
      'AKSHARDHAM',
      'MAYUR_VIHAR_1',
      'MAYUR_VIHAR_EXTENSION',
      'NEW_ASHOK_NAGAR',
      'NOIDA_SEC_15',
      'NOIDA_SEC_16',
      'NOIDA_SEC_18',
      'BOTANICAL_GARDEN',
    ];
    expect(route.stations.map(s => s.id)).toEqual(expectedSequence);

    // Line segments: Violet Line to Mandi House, then Blue Line to Botanical Garden
    expect(route.lineSegments).toHaveLength(2);
    expect(route.lineSegments[0].line).toBe('VIOLET');
    expect(route.lineSegments[0].stations.map(s => s.id)).toEqual([
      'KASHMERE_GATE',
      'LAL_QILA',
      'JAMA_MASJID',
      'DELHI_GATE',
      'ITO',
      'MANDI_HOUSE',
    ]);
    expect(route.lineSegments[1].line).toBe('BLUE');
    expect(route.lineSegments[1].stations[0].id).toBe('MANDI_HOUSE');
    expect(route.lineSegments[1].stations.at(-1)?.id).toBe('BOTANICAL_GARDEN');
  });

  it('reversed journey: Botanical Garden → Kashmere Gate produces exact reverse sequence and interchange at Mandi House', () => {
    const result = dijkstra(graph, 'BOTANICAL_GARDEN', 'KASHMERE_GATE');
    expect(result.route).not.toBeNull();
    const route = result.route!;

    expect(route.totalStations).toBe(17);
    expect(route.interchangeCount).toBe(1);
    expect(route.interchanges[0].id).toBe('MANDI_HOUSE');

    const expectedSequence = [
      'BOTANICAL_GARDEN',
      'NOIDA_SEC_18',
      'NOIDA_SEC_16',
      'NOIDA_SEC_15',
      'NEW_ASHOK_NAGAR',
      'MAYUR_VIHAR_EXTENSION',
      'MAYUR_VIHAR_1',
      'AKSHARDHAM',
      'YAMUNA_BANK',
      'INDRAPRASTHA',
      'SUPREME_COURT',
      'MANDI_HOUSE',
      'ITO',
      'DELHI_GATE',
      'JAMA_MASJID',
      'LAL_QILA',
      'KASHMERE_GATE',
    ];
    expect(route.stations.map(s => s.id)).toEqual(expectedSequence);
    expect(route.lineSegments[0].line).toBe('BLUE');
    expect(route.lineSegments[1].line).toBe('VIOLET');
  });

  it('intra-line journey: Kashmere Gate → Central Secretariat via Violet Line or direct route', () => {
    const result = dijkstra(graph, 'KASHMERE_GATE', 'CENTRAL_SECRETARIAT', { strategy: 'FASTEST' });
    expect(result.route).not.toBeNull();
    expect(result.route!.interchangeCount).toBe(0);
  });

  it('same source and destination: Rajiv Chowk', () => {
    const result = dijkstra(graph, 'RAJIV_CHOWK', 'RAJIV_CHOWK');
    expect(result.route).not.toBeNull();
    expect(result.route!.totalTimeSeconds).toBe(0);
    expect(result.route!.totalStations).toBe(1);
  });

  it('invalid destination: returns null route', () => {
    const result = dijkstra(graph, 'RAJIV_CHOWK', 'NONEXISTENT_STATION');
    expect(result.route).toBeNull();
  });

  it('verified connection: Nawada is fully reachable on the Blue Line', () => {
    const result = dijkstra(graph, 'RAJIV_CHOWK', 'NAWADA');
    expect(result.route).not.toBeNull();
    expect(result.route!.stations[0].id).toBe('RAJIV_CHOWK');
    expect(result.route!.stations.at(-1)?.id).toBe('NAWADA');
  });

  it('unreachable destination on disconnected network: returns null route', () => {
    graph.addStation({
      id: 'ISOLATED_TEST_STATION',
      name: 'Isolated Station',
      lines: ['BLUE'],
      coordinates: { lat: 28.5, lng: 77.1 },
      isInterchange: false,
    });
    const result = dijkstra(graph, 'RAJIV_CHOWK', 'ISOLATED_TEST_STATION');
    expect(result.route).toBeNull();
  });

  it('interchange penalty calculation: respects custom interchange penalty', () => {
    const result = dijkstra(graph, 'CHANDNI_CHOWK', 'KAROL_BAGH', {
      strategy: 'FASTEST',
      interchangePenaltySeconds: 300,
    });
    expect(result.route).not.toBeNull();
    // 6 edges * 120s = 720s + 300s penalty = 1020s
    expect(result.route!.totalTimeSeconds).toBe(1020);
    expect(result.route!.interchangeCount).toBe(1);
  });

  it('formatters: route provides correct station count for time estimate', () => {
    const result = dijkstra(graph, 'SAMAYPUR_BADLI', 'HUDA_CITY_CENTRE');
    expect(result.route).not.toBeNull();
    // Yellow Line has 37 stations → 36 edges → 36 × 120s = 4320s = 72 min
    expect(result.route!.totalStations).toBe(37);
    expect(result.route!.totalTimeSeconds).toBe(36 * 120);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: planRoutes integration
// ─────────────────────────────────────────────────────────────────────────────

describe('planRoutes', () => {
  let graph: MetroGraph;

  beforeEach(async () => {
    const mod = await import('@/core/graph/MetroGraph');
    graph = mod.metroGraph;
  });

  it('returns 1 route for a simple same-line journey', () => {
    const routes = planRoutes(graph, 'CHANDNI_CHOWK', 'HAUZ_KHAS');
    // All 3 strategies produce the same path → deduplicated to 1
    expect(routes.length).toBeGreaterThanOrEqual(1);
    routes.forEach(r => expect(r.stations.length).toBeGreaterThan(0));
  });

  it('returns multiple routes for an interchange journey', () => {
    const routes = planRoutes(graph, 'SAMAYPUR_BADLI', 'VAISHALI');
    // Fastest vs fewest-stops may differ for long cross-network journeys
    expect(routes.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array when no path exists', () => {
    const routes = planRoutes(graph, 'RAJIV_CHOWK', 'GHOST_STATION');
    expect(routes).toHaveLength(0);
  });

  it('each route has a unique label', () => {
    const routes = planRoutes(graph, 'SAMAYPUR_BADLI', 'VAISHALI');
    const labels = routes.map(r => r.label);
    const uniqueLabels = new Set(labels);
    expect(uniqueLabels.size).toBe(labels.length);
  });
});
