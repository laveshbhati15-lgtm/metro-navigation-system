import type { MetroRoute, RoutingOptions } from '../graph/types';
import type { MetroGraph } from '../graph/MetroGraph';
import { dijkstra } from './dijkstra';

/**
 * planRoutes
 *
 * Runs Dijkstra three times with different strategies and returns
 * up to three route alternatives:
 *   1. FASTEST            — minimise total travel time
 *   2. FEWEST_STOPS       — minimise number of stations traversed
 *   3. FEWEST_INTERCHANGES — minimise line changes
 *
 * Deduplicates routes that are structurally identical (same station sequence)
 * so the UI never shows redundant results.
 *
 * Returns an empty array if no path exists between source and destination.
 */
export function planRoutes(
  graph: MetroGraph,
  sourceId: string,
  destinationId: string,
  interchangePenaltySeconds = 180,
): MetroRoute[] {
  const strategies: RoutingOptions[] = [
    { strategy: 'FASTEST',             interchangePenaltySeconds },
    { strategy: 'FEWEST_STOPS',        interchangePenaltySeconds },
    { strategy: 'FEWEST_INTERCHANGES', interchangePenaltySeconds },
  ];

  const routes: MetroRoute[] = [];
  const seenFingerprints = new Set<string>();

  for (const opts of strategies) {
    const result = dijkstra(graph, sourceId, destinationId, opts);
    if (!result.route) continue;

    const fingerprint = result.route.stations.map(s => s.id).join('→');
    if (!seenFingerprints.has(fingerprint)) {
      seenFingerprints.add(fingerprint);
      routes.push(result.route);
    }
  }

  return routes;
}
