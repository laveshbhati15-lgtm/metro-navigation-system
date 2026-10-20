import type {
  MetroRoute,
  LineSegment,
  DijkstraResult,
  DijkstraStep,
  RoutingOptions,
  RouteStrategy,
  Edge,
  Station,
  LineCode,
} from '../graph/types';
import type { MetroGraph } from '../graph/MetroGraph';
import { MinHeap } from './MinHeap';

/** Default interchange penalty in seconds (3 minutes) */
const DEFAULT_INTERCHANGE_PENALTY = 180;

/**
 * Previous-state record in stateful Dijkstra.
 * Tracks the previous node, the arrival line at the previous node,
 * and the edge traversed.
 */
interface PreviousEntry {
  nodeId: string;
  arrivalLine: LineCode | null;
  edge: Edge;
}

const stateKey = (nodeId: string, line: LineCode | null): string => `${nodeId}#${line ?? 'NONE'}`;

/**
 * dijkstra
 *
 * Finds the optimal route between two stations using Dijkstra's algorithm.
 * To properly evaluate line-transfer penalties in multi-modal transit networks,
 * search states are tracked as (stationId, arrivalLine). This ensures that
 * direct journeys are not prematurely pruned by line transfers at interchange hubs.
 *
 * The edge weight depends on the chosen strategy:
 *   FASTEST             — minimize total travel time (+ interchange penalty)
 *   FEWEST_STOPS        — weight = 1 per edge (minimizes station count)
 *   FEWEST_INTERCHANGES — heavy penalty per line change (minimizes line switches)
 *
 * Returns a DijkstraResult containing:
 *   - route:         the reconstructed MetroRoute (or null if unreachable)
 *   - steps:         ordered visualizer snapshots, one per extracted node
 *   - distances:     final station-level distance map for all reachable nodes
 *   - previousNodes: final station-level previous-node map for visualizer
 */
export function dijkstra(
  graph: MetroGraph,
  sourceId: string,
  destinationId: string,
  options: RoutingOptions = { strategy: 'FASTEST' },
): DijkstraResult {
  // ── Guard: unknown stations ─────────────────────────────────────────────
  if (!graph.hasStation(sourceId) || !graph.hasStation(destinationId)) {
    return { route: null, steps: [], distances: {}, previousNodes: {} };
  }

  // ── Guard: same source and destination ──────────────────────────────────
  if (sourceId === destinationId) {
    const station = graph.getStation(sourceId)!;
    const trivialRoute: MetroRoute = {
      stations: [station],
      edges: [],
      totalTimeSeconds: 0,
      totalStations: 1,
      interchanges: [],
      interchangeCount: 0,
      lineSegments: [],
      label: options.strategy === 'FASTEST' ? 'Fastest' : options.strategy === 'FEWEST_STOPS' ? 'Fewest Stops' : 'Fewest Interchanges',
      hasEstimatedTimes: false,
    };
    return { route: trivialRoute, steps: [], distances: { [sourceId]: 0 }, previousNodes: { [sourceId]: null } };
  }

  const penalty = options.interchangePenaltySeconds ?? DEFAULT_INTERCHANGE_PENALTY;
  const strategy = options.strategy;

  // ── Initialise ───────────────────────────────────────────────────────────
  const stateDistances: Record<string, number> = {};
  const previous: Record<string, PreviousEntry | null> = {};
  const finalized = new Set<string>();
  const finalizedStationSet = new Set<string>();
  const steps: DijkstraStep[] = [];

  const initialKey = stateKey(sourceId, null);
  stateDistances[initialKey] = 0;

  const pq = new MinHeap<string>();
  pq.insert(initialKey, 0);

  let winningKey: string | null = null;

  // Track best distance and predecessor per stationId for visualizer
  const bestStationDistances: Record<string, number> = {};
  const bestStationPredecessor: Record<string, string | null> = {};
  for (const station of graph.getAllStations()) {
    bestStationDistances[station.id] = Infinity;
    bestStationPredecessor[station.id] = null;
  }
  bestStationDistances[sourceId] = 0;

  // ── Main loop ────────────────────────────────────────────────────────────
  while (!pq.isEmpty()) {
    const { value: currentKey, priority: currentDist } = pq.extractMin();

    // Skip stale entries
    if (finalized.has(currentKey)) continue;
    finalized.add(currentKey);

    const [currentId, rawLine] = currentKey.split('#');
    const currentLine = rawLine === 'NONE' ? null : (rawLine as LineCode);
    finalizedStationSet.add(currentId);

    // Record a visualizer step
    steps.push({
      visitedNode: currentId,
      distances: { ...bestStationDistances },
      previousNodes: { ...bestStationPredecessor },
      priorityQueue: pq.toArray().map(e => ({ node: e.node.split('#')[0], dist: e.dist })),
      finalizedNodes: Array.from(finalizedStationSet),
    });

    // Early exit once destination is reached with minimum cost
    if (currentId === destinationId) {
      winningKey = currentKey;
      break;
    }

    for (const { targetId, edge } of graph.getNeighbors(currentId)) {
      const isLineChange = currentLine !== null && currentLine !== edge.line;

      // Calculate edge weight based on strategy
      let edgeWeight: number;
      switch (strategy) {
        case 'FEWEST_STOPS':
          edgeWeight = 1 + (isLineChange ? penalty / 30 : 0);
          break;
        case 'FEWEST_INTERCHANGES':
          edgeWeight = edge.travelTimeSeconds + (isLineChange ? penalty * 10 : 0);
          break;
        case 'FASTEST':
        default:
          edgeWeight = edge.travelTimeSeconds + (isLineChange ? penalty : 0);
          break;
      }

      const newDist = currentDist + edgeWeight;
      const nextKey = stateKey(targetId, edge.line);

      if (newDist < (stateDistances[nextKey] ?? Infinity)) {
        stateDistances[nextKey] = newDist;
        previous[nextKey] = { nodeId: currentId, arrivalLine: currentLine, edge };
        pq.insert(nextKey, newDist);

        if (newDist < bestStationDistances[targetId]) {
          bestStationDistances[targetId] = newDist;
          bestStationPredecessor[targetId] = currentId;
        }
      }
    }
  }

  // ── Path Reconstruction ──────────────────────────────────────────────────
  if (!winningKey) {
    return {
      route: null,
      steps,
      distances: bestStationDistances,
      previousNodes: bestStationPredecessor,
    };
  }

  const route = reconstructRoute(
    graph,
    sourceId,
    winningKey,
    previous,
    options,
  );

  return {
    route,
    steps,
    distances: bestStationDistances,
    previousNodes: bestStationPredecessor,
  };
}

// ─── Path Reconstruction Helpers ─────────────────────────────────────────────

function reconstructRoute(
  graph: MetroGraph,
  sourceId: string,
  winningKey: string,
  previous: Record<string, PreviousEntry | null>,
  options: RoutingOptions,
): MetroRoute {
  // Build station list by tracing back from destination state
  const pathIds: string[] = [];
  const pathEdges: Edge[] = [];
  let currKey: string | null = winningKey;

  while (currKey !== null) {
    const [cId] = currKey.split('#');
    pathIds.unshift(cId);
    const prev: PreviousEntry | null = previous[currKey] ?? null;
    if (prev) {
      pathEdges.unshift(prev.edge);
      currKey = stateKey(prev.nodeId, prev.arrivalLine);
    } else {
      currKey = null;
    }
  }

  const stations: Station[] = pathIds.map(id => graph.getStation(id)!);
  const hasEstimatedTimes = pathEdges.some(e => e.isEstimated !== false);

  // Compute actual travel time (sum of edge times + interchange penalties)
  let totalTimeSeconds = 0;
  const interchanges: Station[] = [];

  for (let i = 0; i < pathEdges.length; i++) {
    totalTimeSeconds += pathEdges[i].travelTimeSeconds;
    if (i > 0 && pathEdges[i].line !== pathEdges[i - 1].line) {
      totalTimeSeconds += options.interchangePenaltySeconds ?? DEFAULT_INTERCHANGE_PENALTY;
      interchanges.push(stations[i]);
    }
  }

  // Build line segments
  const lineSegments = buildLineSegments(stations, pathEdges);

  const labelMap: Record<RouteStrategy, string> = {
    FASTEST:             'Fastest',
    FEWEST_STOPS:        'Fewest Stops',
    FEWEST_INTERCHANGES: 'Fewest Interchanges',
  };

  return {
    stations,
    edges: pathEdges,
    totalTimeSeconds,
    totalStations: stations.length,
    interchanges,
    interchangeCount: interchanges.length,
    lineSegments,
    label: labelMap[options.strategy],
    hasEstimatedTimes,
  };
}

function buildLineSegments(stations: Station[], edges: Edge[]): LineSegment[] {
  if (edges.length === 0) return [];

  const segments: LineSegment[] = [];
  let currentLine = edges[0].line;
  let segmentStations: Station[] = [stations[0]];
  let segmentDuration = 0;

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];

    if (edge.line !== currentLine) {
      // Finish previous segment
      segments.push({
        line: currentLine,
        stations: [...segmentStations],
        durationSeconds: segmentDuration,
      });
      // Start new segment
      currentLine = edge.line;
      segmentStations = [stations[i]]; // interchange station is shared
      segmentDuration = 0;
    }

    segmentStations.push(stations[i + 1]);
    segmentDuration += edge.travelTimeSeconds;
  }

  // Push final segment
  segments.push({
    line: currentLine,
    stations: [...segmentStations],
    durationSeconds: segmentDuration,
  });

  return segments;
}
