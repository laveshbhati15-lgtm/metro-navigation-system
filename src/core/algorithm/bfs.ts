/**
 * bfs.ts — Breadth-First Search (BFS) Transit Routing & Step Visualizer
 *
 * Implements standard unweighted Breadth-First Search on MetroGraph.
 * BFS explores nodes level-by-level using a FIFO queue, minimizing edge hop count (stops)
 * without taking into account actual edge travel durations or interchange walking penalties.
 *
 * Provides side-by-side snapshot recordings for comparison with Dijkstra's algorithm.
 */

import type { MetroGraph } from '../graph/MetroGraph';
import type { MetroRoute, Edge, Station, LineSegment } from '../graph/types';

export interface BFSStep {
  /** The node being processed from the head of the FIFO queue */
  visitedNode: string;

  /** Hop distance (number of stations away from source) */
  hopDistances: Record<string, number>;

  /** Previous-node map at this step for path reconstruction */
  previousNodes: Record<string, string | null>;

  /** Snapshot of current FIFO queue contents */
  queue: string[];

  /** All nodes marked as visited so far */
  visitedNodes: string[];

  /** Level/depth of current exploration */
  currentDepth: number;
}

export interface BFSResult {
  /** Reconstructed route or null if unreachable */
  route: MetroRoute | null;

  /** Visualizer steps for animation/scrubbing */
  steps: BFSStep[];

  /** Final hop distances */
  hopDistances: Record<string, number>;

  /** Final predecessor pointers */
  previousNodes: Record<string, string | null>;

  /** Metrics for comparison */
  metrics: {
    exploredNodesCount: number;
    totalHops: number;
    edgeTraversals: number;
    queuePeakSize: number;
  };
}

interface PreviousRecord {
  nodeId: string;
  edge: Edge;
}

export function bfs(
  graph: MetroGraph,
  sourceId: string,
  destinationId: string
): BFSResult {
  if (!graph.hasStation(sourceId) || !graph.hasStation(destinationId)) {
    return {
      route: null,
      steps: [],
      hopDistances: {},
      previousNodes: {},
      metrics: { exploredNodesCount: 0, totalHops: 0, edgeTraversals: 0, queuePeakSize: 0 },
    };
  }

  // Trivial same-station journey
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
      label: 'BFS (Fewest Hops)',
      hasEstimatedTimes: false,
    };
    return {
      route: trivialRoute,
      steps: [],
      hopDistances: { [sourceId]: 0 },
      previousNodes: { [sourceId]: null },
      metrics: { exploredNodesCount: 1, totalHops: 0, edgeTraversals: 0, queuePeakSize: 1 },
    };
  }

  const hopDistances: Record<string, number> = {};
  const previous: Record<string, PreviousRecord | null> = {};
  const visited = new Set<string>();
  const steps: BFSStep[] = [];

  for (const st of graph.getAllStations()) {
    hopDistances[st.id] = Infinity;
    previous[st.id] = null;
  }

  hopDistances[sourceId] = 0;
  visited.add(sourceId);

  // FIFO Queue: stores station IDs
  const queue: string[] = [sourceId];
  let queuePeakSize = 1;
  let edgeTraversals = 0;

  let reached = false;

  while (queue.length > 0) {
    queuePeakSize = Math.max(queuePeakSize, queue.length);
    const currentId = queue.shift()!;
    const currentHop = hopDistances[currentId];

    // Record step snapshot
    steps.push({
      visitedNode: currentId,
      hopDistances: { ...hopDistances },
      previousNodes: Object.fromEntries(
        Object.entries(previous).map(([k, v]) => [k, v ? v.nodeId : null])
      ),
      queue: [...queue],
      visitedNodes: Array.from(visited),
      currentDepth: currentHop,
    });

    if (currentId === destinationId) {
      reached = true;
      break;
    }

    // Inspect neighbors
    const neighbors = graph.getNeighbors(currentId);
    for (const { targetId, edge } of neighbors) {
      edgeTraversals++;
      const neighborId = targetId;

      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        hopDistances[neighborId] = currentHop + 1;
        previous[neighborId] = { nodeId: currentId, edge };
        queue.push(neighborId);
      }
    }
  }

  const prevNodeMap: Record<string, string | null> = Object.fromEntries(
    Object.entries(previous).map(([k, v]) => [k, v ? v.nodeId : null])
  );

  if (!reached && hopDistances[destinationId] === Infinity) {
    return {
      route: null,
      steps,
      hopDistances,
      previousNodes: prevNodeMap,
      metrics: {
        exploredNodesCount: visited.size,
        totalHops: 0,
        edgeTraversals,
        queuePeakSize,
      },
    };
  }

  // Reconstruct path
  const route = reconstructBFSRoute(graph, sourceId, destinationId, previous);

  return {
    route,
    steps,
    hopDistances,
    previousNodes: prevNodeMap,
    metrics: {
      exploredNodesCount: steps.length,
      totalHops: hopDistances[destinationId],
      edgeTraversals,
      queuePeakSize,
    },
  };
}

function reconstructBFSRoute(
  graph: MetroGraph,
  sourceId: string,
  destinationId: string,
  previous: Record<string, PreviousRecord | null>
): MetroRoute {
  const pathStationIds: string[] = [];
  const pathEdges: Edge[] = [];

  let cur: string | null = destinationId;
  while (cur !== null) {
    pathStationIds.unshift(cur);
    const record: PreviousRecord | null = previous[cur];
    if (record) {
      pathEdges.unshift(record.edge);
      cur = record.nodeId;
    } else {
      cur = null;
    }
  }

  const stations: Station[] = pathStationIds.map((id) => graph.getStation(id)!);

  // Line segments & interchanges
  const lineSegments: LineSegment[] = [];
  const interchanges: Station[] = [];
  let currentSeg: LineSegment | null = null;
  let totalTimeSeconds = 0;
  let hasEstimatedTimes = false;

  for (let i = 0; i < pathEdges.length; i++) {
    const edge = pathEdges[i];
    const fromStation = stations[i];
    const toStation = stations[i + 1];

    totalTimeSeconds += edge.travelTimeSeconds;
    if (edge.isEstimated) hasEstimatedTimes = true;

    if (!currentSeg || currentSeg.line !== edge.line) {
      if (currentSeg) {
        interchanges.push(fromStation);
        totalTimeSeconds += 180; // Add 3-minute walking penalty for interchange
      }
      currentSeg = {
        line: edge.line,
        stations: [fromStation, toStation],
        durationSeconds: edge.travelTimeSeconds,
      };
      lineSegments.push(currentSeg);
    } else {
      currentSeg.stations.push(toStation);
      currentSeg.durationSeconds += edge.travelTimeSeconds;
    }
  }

  return {
    stations,
    edges: pathEdges,
    totalTimeSeconds,
    totalStations: stations.length,
    interchanges,
    interchangeCount: interchanges.length,
    lineSegments,
    label: 'BFS (Fewest Hops)',
    hasEstimatedTimes,
  };
}
