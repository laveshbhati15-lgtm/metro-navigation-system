import type { Station, Edge, LineCode } from './types';
import stationsData from '../data/stations.json';
import connectionsData from '../data/connections.json';

/**
 * MetroGraph
 *
 * Undirected weighted graph representing the Delhi Metro network.
 * Internally stores an adjacency list keyed by station ID.
 * Edges are stored bi-directionally so that Dijkstra can traverse
 * in either direction without duplicate entries in the source data.
 */

/** Adjacency list entry */
export interface AdjacencyEntry {
  targetId: string;
  edge: Edge;
}

export class MetroGraph {
  /** Map of station ID → Station object */
  private readonly stations: Map<string, Station> = new Map();

  /** Adjacency list: station ID → list of connected stations with edge data */
  private readonly adjacency: Map<string, AdjacencyEntry[]> = new Map();

  constructor() {
    this.loadStations();
    this.loadEdges();
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  private loadStations(): void {
    // The JSON file may contain duplicate IDs for interchange stations
    // (same station listed under multiple line sections). Deduplicate by ID.
    const seen = new Set<string>();
    for (const raw of (stationsData as { stations: Station[] }).stations) {
      if (!seen.has(raw.id)) {
        this.stations.set(raw.id, raw as Station);
        this.adjacency.set(raw.id, []);
        seen.add(raw.id);
      }
    }
  }

  private loadEdges(): void {
    for (const raw of (connectionsData as { edges: Edge[] }).edges) {
      this.addEdge(raw as Edge);
    }
  }

  // ─── Public Mutation API ──────────────────────────────────────────────────

  /**
   * Register a station.
   * Used for testing and for future dynamic data updates.
   */
  addStation(station: Station): void {
    if (!this.stations.has(station.id)) {
      this.stations.set(station.id, station);
      this.adjacency.set(station.id, []);
    }
  }

  /**
   * Register an edge. Adds the connection in both directions
   * since metro tracks are bidirectional.
   */
  addEdge(edge: Edge): void {
    const { from, to } = edge;
    if (!this.adjacency.has(from)) this.adjacency.set(from, []);
    if (!this.adjacency.has(to)) this.adjacency.set(to, []);

    // from → to
    if (!this.adjacency.get(from)!.some(e => e.targetId === to && e.edge.line === edge.line)) {
      this.adjacency.get(from)!.push({ targetId: to, edge });
    }

    // to → from (reverse)
    const reverseEdge: Edge = { ...edge, from: to, to: from };
    if (!this.adjacency.get(to)!.some(e => e.targetId === from && e.edge.line === edge.line)) {
      this.adjacency.get(to)!.push({ targetId: from, edge: reverseEdge });
    }
  }

  // ─── Public Query API ─────────────────────────────────────────────────────

  getStation(id: string): Station | undefined {
    return this.stations.get(id);
  }

  getStationByName(name: string): Station | undefined {
    const lower = name.toLowerCase();
    for (const station of this.stations.values()) {
      if (station.name.toLowerCase() === lower) return station;
    }
    return undefined;
  }

  getAllStations(): Station[] {
    return Array.from(this.stations.values());
  }

  getStationsByLine(line: LineCode): Station[] {
    return Array.from(this.stations.values()).filter(s =>
      s.lines.includes(line)
    );
  }

  getInterchangeStations(): Station[] {
    return Array.from(this.stations.values()).filter(s => s.isInterchange);
  }

  hasStation(id: string): boolean {
    return this.stations.has(id);
  }

  getNeighbors(stationId: string): AdjacencyEntry[] {
    return this.adjacency.get(stationId) ?? [];
  }

  getStationCount(): number {
    return this.stations.size;
  }

  getEdgeCount(): number {
    // Each edge is stored twice (bidirectional); report the logical count
    let total = 0;
    for (const neighbors of this.adjacency.values()) {
      total += neighbors.length;
    }
    return total / 2;
  }

  /**
   * Search stations by partial name (case-insensitive).
   * Used for the station search autocomplete in the UI.
   */
  searchStations(query: string, limit = 10): Station[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const results: Array<{ station: Station; score: number }> = [];

    for (const station of this.stations.values()) {
      const name = station.name.toLowerCase();
      const hindi = station.nameHindi?.toLowerCase() ?? '';

      if (name.startsWith(q)) {
        results.push({ station, score: 2 }); // Prefix match = highest priority
      } else if (name.includes(q) || hindi.includes(q)) {
        results.push({ station, score: 1 }); // Substring match
      }
    }

    return results
      .sort((a, b) => b.score - a.score || a.station.name.localeCompare(b.station.name))
      .slice(0, limit)
      .map(r => r.station);
  }
}

/** Singleton graph instance, loaded once at module import time */
export const metroGraph = new MetroGraph();
