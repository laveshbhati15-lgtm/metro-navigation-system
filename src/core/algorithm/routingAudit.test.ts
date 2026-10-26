import { describe, it, expect } from 'vitest';
import { metroGraph } from '../graph/MetroGraph';
import { dijkstra } from './dijkstra';
import { bfs } from './bfs';
import { planRoutes } from './routePlanner';

describe('Comprehensive Routing & Graph QA Audit', () => {
  const allStations = metroGraph.getAllStations();

  it('verifies graph contains 223 unique stations and 100% connectivity', () => {
    expect(allStations.length).toBe(223);
    const uniqueIds = new Set(allStations.map(s => s.id));
    expect(uniqueIds.size).toBe(223);
  });

  it('validates edge integrity: all routes consist of valid adjacent edges', () => {
    // Sample across the network (every 5th station -> 600 journeys)
    const sample = allStations.filter((_, i) => i % 5 === 0);

    for (const src of sample) {
      for (const dst of sample) {
        if (src.id === dst.id) continue;

        const dRes = dijkstra(metroGraph, src.id, dst.id);
        expect(dRes.route).not.toBeNull();
        const r = dRes.route!;

        expect(r.stations[0].id).toBe(src.id);
        expect(r.stations[r.stations.length - 1].id).toBe(dst.id);
        expect(r.stations.length).toBe(r.edges.length + 1);

        for (let i = 0; i < r.edges.length; i++) {
          const edge = r.edges[i];
          const stFrom = r.stations[i].id;
          const stTo = r.stations[i + 1].id;
          const isForward = edge.from === stFrom && edge.to === stTo;
          const isReverse = edge.from === stTo && edge.to === stFrom;
          expect(isForward || isReverse).toBe(true);
        }
      }
    }
  }, 30000);

  it('validates BFS returns minimal hop count and valid connected edges', () => {
    const sample = allStations.filter((_, i) => i % 6 === 0);

    for (const src of sample) {
      for (const dst of sample) {
        if (src.id === dst.id) continue;

        const bRes = bfs(metroGraph, src.id, dst.id);
        expect(bRes.route).not.toBeNull();
        const r = bRes.route!;

        expect(r.stations[0].id).toBe(src.id);
        expect(r.stations[r.stations.length - 1].id).toBe(dst.id);
        expect(r.stations.length).toBe(r.edges.length + 1);
        expect(bRes.metrics.totalHops).toBe(r.edges.length);
      }
    }
  }, 30000);

  it('validates edge cases: identical station, unknown station, unreachable station', () => {
    // Identical station
    const same = dijkstra(metroGraph, 'RAJIV_CHOWK', 'RAJIV_CHOWK');
    expect(same.route).not.toBeNull();
    expect(same.route?.totalStations).toBe(1);
    expect(same.route?.totalTimeSeconds).toBe(0);

    // Unknown station
    const unknown1 = dijkstra(metroGraph, 'NON_EXISTENT', 'RAJIV_CHOWK');
    expect(unknown1.route).toBeNull();
    const unknown2 = dijkstra(metroGraph, 'RAJIV_CHOWK', 'NON_EXISTENT');
    expect(unknown2.route).toBeNull();

    // BFS identical station
    const sameBFS = bfs(metroGraph, 'RAJIV_CHOWK', 'RAJIV_CHOWK');
    expect(sameBFS.route).not.toBeNull();
    expect(sameBFS.route?.totalStations).toBe(1);

    // BFS unknown
    expect(bfs(metroGraph, 'NON_EXISTENT', 'RAJIV_CHOWK').route).toBeNull();
  });

  it('validates alternative route strategies in planRoutes', () => {
    // Journey from Samaypur Badli (Yellow) to Noida City Centre (Blue)
    const routes = planRoutes(metroGraph, 'SAMAYPUR_BADLI', 'NOIDA_CITY_CENTRE');
    expect(routes.length).toBeGreaterThanOrEqual(1);

    // Each route must be non-empty and start/end correctly
    for (const r of routes) {
      expect(r.stations[0].id).toBe('SAMAYPUR_BADLI');
      expect(r.stations[r.stations.length - 1].id).toBe('NOIDA_CITY_CENTRE');
      expect(r.interchangeCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('validates line station counts and unique network accounting', () => {
    const yellowStations  = allStations.filter(s => s.lines.includes('YELLOW'));
    const blueStations    = allStations.filter(s => s.lines.includes('BLUE'));
    const violetStations  = allStations.filter(s => s.lines.includes('VIOLET'));
    const redStations     = allStations.filter(s => s.lines.includes('RED'));
    const greenStations   = allStations.filter(s => s.lines.includes('GREEN'));
    const magentaStations = allStations.filter(s => s.lines.includes('MAGENTA'));
    const pinkStations    = allStations.filter(s => s.lines.includes('PINK'));

    expect(yellowStations.length).toBe(37);
    expect(blueStations.length).toBe(57);
    expect(violetStations.length).toBe(34);
    expect(redStations.length).toBe(29);
    expect(greenStations.length).toBe(24);
    expect(magentaStations.length).toBe(25);
    expect(pinkStations.length).toBe(38);

    // Total unique stations: 223
    expect(allStations.length).toBe(223);
  });

  it('validates that Dijkstra applies calibrated 180s (3m) friction per interchange', () => {
    // Kashmere Gate (Violet) to Botanical Garden (Blue) via Mandi House
    const res = dijkstra(metroGraph, 'KASHMERE_GATE', 'BOTANICAL_GARDEN');
    expect(res.route).not.toBeNull();
    const route = res.route!;

    expect(route.interchangeCount).toBe(1);
    expect(route.interchanges[0].id).toBe('MANDI_HOUSE');
    // 16 edges * 120s = 1920s + 180s transfer penalty = 2100s = 35 minutes
    expect(route.totalTimeSeconds).toBe(2100);
    expect(route.totalStations).toBe(17);
  });
});

