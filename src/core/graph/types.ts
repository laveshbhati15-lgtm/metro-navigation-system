/**
 * Core domain types for Delhi Metro Navigator.
 *
 * Data source: DMRC official network maps
 * URL: https://www.delhimetrorail.com/metro-fares-timings.aspx
 * Secondary: OpenStreetMap metro relations
 *
 * Travel time assumption: ~120 seconds per inter-station segment (estimated).
 * Interchange penalty: 180 seconds (3-min wait on platform change).
 * These are NOT official DMRC segment-level timings. Replace values in
 * connections.json once verified data is available.
 */

// ─── Line Identifiers ────────────────────────────────────────────────────────

export type LineCode =
  | 'RED'      // Line 1 : Rithala ↔ Shaheed Sthal (New Bus Adda)
  | 'YELLOW'   // Line 2 : Samaypur Badli ↔ HUDA City Centre
  | 'BLUE'     // Line 3 : Dwarka Sector 21 ↔ Vaishali / Noida Electronic City
  | 'GREEN'    // Line 5 : Inderlok ↔ Brigadier Hoshiyar Singh
  | 'VIOLET'   // Line 6 : Kashmere Gate ↔ Raja Nahar Singh (Ballabhgarh)
  | 'ORANGE'   // Airport Express : New Delhi ↔ Dwarka Sector 21
  | 'MAGENTA'  // Line 8 : Janakpuri West ↔ Botanical Garden
  | 'PINK'     // Line 7 : Majlis Park ↔ Shiv Vihar
  | 'GREY'     // Line 9 : Dwarka ↔ Najafgarh
  | 'AQUA';    // Line 10: Noida Sector 51 ↔ Noida Sector 76

// ─── Station ─────────────────────────────────────────────────────────────────

export interface Station {
  /** Unique stable identifier, e.g. "RAJIV_CHOWK" */
  id: string;

  /** Display name in English, e.g. "Rajiv Chowk" */
  name: string;

  /** Display name in Hindi (optional, for accessibility) */
  nameHindi?: string;

  /** Lines this station belongs to. Length > 1 implies interchange. */
  lines: LineCode[];

  /** WGS-84 coordinates for map rendering */
  coordinates: {
    lat: number;
    lng: number;
  };

  /** True when the station serves more than one line */
  isInterchange: boolean;

  /**
   * DMRC fare zone (1 or 2).
   * Zone 1 = stations within Delhi; Zone 2 = stations outside Delhi.
   * Approximate — used only for fare estimation.
   */
  zone?: 1 | 2;
}

// ─── Edge ─────────────────────────────────────────────────────────────────────

export interface Edge {
  /** Source station ID */
  from: string;

  /** Destination station ID */
  to: string;

  /** The metro line this track segment belongs to */
  line: LineCode;

  /**
   * Estimated travel time between the two stations in seconds.
   * Assumption: ~120 s per segment unless a verified value is provided.
   * Set `isEstimated: false` once official data replaces this figure.
   */
  travelTimeSeconds: number;

  /** True when travelTimeSeconds is an estimate, not official DMRC data */
  isEstimated?: boolean;

  /** Approximate track distance in kilometres (optional metadata) */
  distanceKm?: number;
}

// ─── Route Result ─────────────────────────────────────────────────────────────

/** A single named segment on one metro line */
export interface LineSegment {
  line: LineCode;
  stations: Station[];
  durationSeconds: number;
}

/** Complete route returned by the routing engine */
export interface MetroRoute {
  /** Ordered list of stations from source to destination */
  stations: Station[];

  /** Ordered list of edges traversed */
  edges: Edge[];

  /** Total journey time including interchange penalties (seconds) */
  totalTimeSeconds: number;

  /** Number of stations visited (inclusive of start and end) */
  totalStations: number;

  /** Stations where the passenger changes lines */
  interchanges: Station[];

  /** Convenience count */
  interchangeCount: number;

  /** Journey broken into continuous line segments */
  lineSegments: LineSegment[];

  /**
   * Human-readable label for the route variant.
   * e.g. "Fastest" | "Fewest Stops" | "Fewest Interchanges"
   */
  label: string;

  /**
   * Whether any edge in this route uses an estimated travel time.
   * Used to render a disclaimer in the UI.
   */
  hasEstimatedTimes: boolean;
}

// ─── Algorithm Visualizer Types ───────────────────────────────────────────────
// These are populated by the routing engine so Phase 2 can consume them
// without changes to the core algorithm.

/** A snapshot of Dijkstra's state after processing one node */
export interface DijkstraStep {
  /** The node being finalised in this step */
  visitedNode: string;

  /** Distance map at the time of this step */
  distances: Record<string, number>;

  /** Previous-node map at the time of this step */
  previousNodes: Record<string, string | null>;

  /** Current contents of the priority queue */
  priorityQueue: Array<{ node: string; dist: number }>;

  /** Set of node IDs whose shortest paths have been finalised */
  finalizedNodes: string[];
}

/** Full result returned by the Dijkstra engine */
export interface DijkstraResult {
  /** Shortest-path route, or null if no path exists */
  route: MetroRoute | null;

  /** Ordered visualizer steps — one per node extraction from the queue */
  steps: DijkstraStep[];

  /** Final distance map from source to all reachable nodes */
  distances: Record<string, number>;

  /** Final previous-node map for path reconstruction */
  previousNodes: Record<string, string | null>;
}

// ─── Routing Options ─────────────────────────────────────────────────────────

export type RouteStrategy = 'FASTEST' | 'FEWEST_STOPS' | 'FEWEST_INTERCHANGES';

export interface RoutingOptions {
  strategy: RouteStrategy;
  /**
   * Penalty added per interchange in seconds.
   * Default: 180 s (3 minutes).
   */
  interchangePenaltySeconds?: number;
}
