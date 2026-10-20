import { describe, it, expect } from 'vitest';
import { metroGraph } from '../graph/MetroGraph';
import { dijkstra } from '../algorithm/dijkstra';
import { bfs } from '../algorithm/bfs';
import { planRoutes } from '../algorithm/routePlanner';
import { getStationIndoorLayout } from './indoorData';
import { useJourneyStore } from '@/store/journeyStore';

describe('Full System Integration Audit', () => {
  it('1. Graph Topology: contains 223 verified stations across 7 lines', () => {
    expect(metroGraph.getAllStations().length).toBe(223);
    expect(metroGraph.getEdgeCount()).toBe(237);
    expect(metroGraph.getInterchangeStations().length).toBeGreaterThan(15);
  });

  it('2. Routing Engine: computes accurate Kashmere Gate -> Botanical Garden via Violet to Blue', () => {
    const dijkstraRes = dijkstra(metroGraph, 'KASHMERE_GATE', 'BOTANICAL_GARDEN', { strategy: 'FASTEST' });
    const bfsRes = bfs(metroGraph, 'KASHMERE_GATE', 'BOTANICAL_GARDEN');
    const multi = planRoutes(metroGraph, 'KASHMERE_GATE', 'BOTANICAL_GARDEN');

    expect(dijkstraRes.route).not.toBeNull();
    expect(bfsRes.route).not.toBeNull();
    expect(multi.length).toBeGreaterThanOrEqual(1);

    // Primary route must use Violet Line and Blue Line
    const lines = dijkstraRes.route!.lineSegments.map(s => s.line);
    expect(lines).toContain('VIOLET');
    expect(lines).toContain('BLUE');

    // Transfer at Mandi House
    const interchangeNames = dijkstraRes.route!.interchanges.map(s => s.id);
    expect(interchangeNames).toContain('MANDI_HOUSE');

    // Stations count ~ 17
    expect(dijkstraRes.route!.totalStations).toBe(17);
  });

  it('3. Indoor Navigation Data: provides curated hubs and modular fallbacks with step-free guided paths (demonstration model)', () => {
    const hubs = ['RAJIV_CHOWK', 'KASHMERE_GATE', 'MANDI_HOUSE', 'CENTRAL_SECRETARIAT', 'BOTANICAL_GARDEN'];
    for (const hubId of hubs) {
      const station = metroGraph.getStation(hubId)!;
      const layout = getStationIndoorLayout(hubId, station.name, station.lines, station.isInterchange);
      expect(layout.levels.length).toBeGreaterThanOrEqual(3);
      expect(layout.gates.length).toBeGreaterThanOrEqual(3);
      expect(layout.facilities.length).toBeGreaterThanOrEqual(2);
      expect(layout.paths.length).toBeGreaterThanOrEqual(1);
      expect(layout.paths[0].isStepFree).toBe(true);
      expect(layout.isDemonstrationModel).toBe(true);
    }

    // Modular generic station
    const generic = getStationIndoorLayout('MODEL_TOWN', 'Model Town', ['YELLOW'], false);
    expect(generic.levels.length).toBe(3);
    expect(generic.gates.length).toBe(2);
    expect(generic.paths[0].isStepFree).toBe(true);
  });

  it('4. Journey Store: manages accessible route preference and active indoor station modal', () => {
    const store = useJourneyStore.getState();
    expect(store.accessiblePreference).toBe(false);
    expect(store.indoorStation).toBeNull();

    // Toggle accessible preference
    store.setAccessiblePreference(true);
    expect(useJourneyStore.getState().accessiblePreference).toBe(true);

    // Open indoor guide for a station
    const rajiv = metroGraph.getStation('RAJIV_CHOWK')!;
    store.setIndoorStation(rajiv);
    expect(useJourneyStore.getState().indoorStation?.id).toBe('RAJIV_CHOWK');

    // Reset clears indoorStation
    store.resetJourney();
    expect(useJourneyStore.getState().indoorStation).toBeNull();
  });
});
