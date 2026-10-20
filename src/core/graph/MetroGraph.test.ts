import { describe, it, expect, beforeEach } from 'vitest';
import { MetroGraph } from '@/core/graph/MetroGraph';
import type { Station, Edge } from '@/core/graph/types';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const stationA: Station = {
  id: 'STA_A', name: 'Station A', lines: ['YELLOW'],
  coordinates: { lat: 0, lng: 0 }, isInterchange: false,
};
const stationB: Station = {
  id: 'STA_B', name: 'Station B', lines: ['YELLOW'],
  coordinates: { lat: 0, lng: 0 }, isInterchange: false,
};
const stationC: Station = {
  id: 'STA_C', name: 'Station C', lines: ['BLUE'],
  coordinates: { lat: 0, lng: 0 }, isInterchange: false,
};

const edgeAB: Edge = {
  from: 'STA_A', to: 'STA_B', line: 'YELLOW', travelTimeSeconds: 120, isEstimated: true,
};
const edgeBC: Edge = {
  from: 'STA_B', to: 'STA_C', line: 'BLUE', travelTimeSeconds: 90, isEstimated: true,
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('MetroGraph', () => {
  describe('loaded from JSON data (singleton graph)', () => {
    // Import the live singleton to verify the JSON loaded correctly
    let graph: MetroGraph;

    beforeEach(async () => {
      const mod = await import('@/core/graph/MetroGraph');
      graph = mod.metroGraph;
    });

    it('loads Yellow Line stations', () => {
      expect(graph.hasStation('SAMAYPUR_BADLI')).toBe(true);
      expect(graph.hasStation('HUDA_CITY_CENTRE')).toBe(true);
      expect(graph.hasStation('RAJIV_CHOWK')).toBe(true);
    });

    it('loads Blue Line stations', () => {
      expect(graph.hasStation('DWARKA_SEC_21')).toBe(true);
      expect(graph.hasStation('VAISHALI')).toBe(true);
      expect(graph.hasStation('NOIDA_ELECTRONIC_CITY')).toBe(true);
    });

    it('marks Rajiv Chowk as an interchange station', () => {
      const rc = graph.getStation('RAJIV_CHOWK');
      expect(rc).toBeDefined();
      expect(rc!.isInterchange).toBe(true);
      expect(rc!.lines).toContain('YELLOW');
      expect(rc!.lines).toContain('BLUE');
    });

    it('has neighbors on both sides of Rajiv Chowk', () => {
      const neighbors = graph.getNeighbors('RAJIV_CHOWK');
      const neighborIds = neighbors.map(n => n.targetId);
      // Yellow side
      expect(neighborIds).toContain('NEW_DELHI');
      expect(neighborIds).toContain('PATEL_CHOWK');
      // Blue side
      expect(neighborIds).toContain('RAMAKRISHNA_ASHRAM_MARG');
      expect(neighborIds).toContain('BARAKHAMBA_ROAD');
    });

    it('models the Yamuna Bank branch split', () => {
      const neighbors = graph.getNeighbors('YAMUNA_BANK');
      const ids = neighbors.map(n => n.targetId);
      // Should connect to BOTH branches
      expect(ids).toContain('LAXMI_NAGAR');     // Vaishali branch
      expect(ids).toContain('AKSHARDHAM');       // Noida branch
      expect(ids).toContain('INDRAPRASTHA');     // westward
    });

    it('reports station count >= 83', () => {
      expect(graph.getStationCount()).toBeGreaterThanOrEqual(83);
    });

    it('getStationsByLine returns correct line members', () => {
      const yellow = graph.getStationsByLine('YELLOW');
      expect(yellow.length).toBeGreaterThanOrEqual(37);
      yellow.forEach(s => expect(s.lines).toContain('YELLOW'));

      const blue = graph.getStationsByLine('BLUE');
      expect(blue.length).toBeGreaterThanOrEqual(40);
      blue.forEach(s => expect(s.lines).toContain('BLUE'));
    });

    it('getInterchangeStations includes Kashmere Gate', () => {
      const interchanges = graph.getInterchangeStations();
      const ids = interchanges.map(s => s.id);
      expect(ids).toContain('KASHMERE_GATE');
      expect(ids).toContain('RAJIV_CHOWK');
    });

    it('searchStations returns prefix matches first', () => {
      const results = graph.searchStations('Rajiv', 5);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('RAJIV_CHOWK');
    });

    it('searchStations is case-insensitive', () => {
      const results = graph.searchStations('rajiv chowk');
      expect(results.map(s => s.id)).toContain('RAJIV_CHOWK');
    });

    it('searchStations returns empty array for empty query', () => {
      expect(graph.searchStations('')).toHaveLength(0);
    });
  });

  describe('manual station and edge management', () => {
    let graph: MetroGraph;

    // Create a fresh graph with no JSON data for isolation
    beforeEach(() => {
      // We patch the prototype to skip JSON loading for isolated tests
      graph = Object.create(MetroGraph.prototype) as MetroGraph;
      // @ts-expect-error — accessing private for test setup
      graph['stations'] = new Map();
      // @ts-expect-error
      graph['adjacency'] = new Map();
    });

    it('addStation stores a station', () => {
      graph.addStation(stationA);
      expect(graph.hasStation('STA_A')).toBe(true);
      expect(graph.getStation('STA_A')).toEqual(stationA);
    });

    it('addStation ignores duplicates', () => {
      graph.addStation(stationA);
      graph.addStation({ ...stationA, name: 'Changed' });
      expect(graph.getStation('STA_A')!.name).toBe('Station A');
    });

    it('addEdge creates bidirectional connection', () => {
      graph.addStation(stationA);
      graph.addStation(stationB);
      graph.addEdge(edgeAB);

      const fromA = graph.getNeighbors('STA_A').map(n => n.targetId);
      const fromB = graph.getNeighbors('STA_B').map(n => n.targetId);

      expect(fromA).toContain('STA_B');
      expect(fromB).toContain('STA_A');
    });

    it('getNeighbors returns empty array for unknown station', () => {
      expect(graph.getNeighbors('UNKNOWN')).toHaveLength(0);
    });

    it('getAllStations returns all added stations', () => {
      graph.addStation(stationA);
      graph.addStation(stationB);
      graph.addStation(stationC);
      expect(graph.getAllStations()).toHaveLength(3);
    });

    it('getEdgeCount is correct for bidirectional edges', () => {
      graph.addStation(stationA);
      graph.addStation(stationB);
      graph.addStation(stationC);
      graph.addEdge(edgeAB);
      graph.addEdge(edgeBC);
      expect(graph.getEdgeCount()).toBe(2);
    });
  });
});
