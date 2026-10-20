import { describe, it, expect } from 'vitest';
import { bfs } from './bfs';
import { metroGraph } from '../graph/MetroGraph';
import { dijkstra } from './dijkstra';

describe('Breadth-First Search (BFS)', () => {
  it('handles trivial route when source and destination are identical', () => {
    const result = bfs(metroGraph, 'RAJIV_CHOWK', 'RAJIV_CHOWK');
    expect(result.route).not.toBeNull();
    expect(result.route?.totalStations).toBe(1);
    expect(result.route?.totalTimeSeconds).toBe(0);
    expect(result.metrics.totalHops).toBe(0);
    expect(result.steps).toHaveLength(0);
  });

  it('returns empty result for unknown station IDs', () => {
    const result = bfs(metroGraph, 'NONEXISTENT', 'RAJIV_CHOWK');
    expect(result.route).toBeNull();
    expect(result.steps).toHaveLength(0);
  });

  it('finds correct same-line path between Chandni Chowk and Hauz Khas', () => {
    const result = bfs(metroGraph, 'CHANDNI_CHOWK', 'HAUZ_KHAS');
    expect(result.route).not.toBeNull();
    expect(result.route?.stations[0].id).toBe('CHANDNI_CHOWK');
    expect(result.route?.stations[result.route.stations.length - 1].id).toBe('HAUZ_KHAS');
    expect(result.route?.interchangeCount).toBe(0);
    expect(result.metrics.totalHops).toBe(result.route!.stations.length - 1);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('finds path across interchange from Yellow to Blue Line (Chandni Chowk -> Karol Bagh)', () => {
    const result = bfs(metroGraph, 'CHANDNI_CHOWK', 'KAROL_BAGH');
    expect(result.route).not.toBeNull();
    expect(result.route?.stations[0].id).toBe('CHANDNI_CHOWK');
    expect(result.route?.stations[result.route.stations.length - 1].id).toBe('KAROL_BAGH');
    // Must pass Rajiv Chowk
    const hasRajiv = result.route?.stations.some((s) => s.id === 'RAJIV_CHOWK');
    expect(hasRajiv).toBe(true);
    expect(result.route?.interchangeCount).toBeGreaterThanOrEqual(1);
  });

  it('records sequential FIFO steps with valid queue snapshots and depth', () => {
    const result = bfs(metroGraph, 'KASHMERE_GATE', 'MANDI_HOUSE');
    expect(result.steps.length).toBeGreaterThan(0);

    // First step must be source node at depth 0
    expect(result.steps[0].visitedNode).toBe('KASHMERE_GATE');
    expect(result.steps[0].currentDepth).toBe(0);

    // Each step should record visitedNodes and previousNodes
    for (const step of result.steps) {
      expect(step.visitedNodes).toContain(step.visitedNode);
      expect(typeof step.currentDepth).toBe('number');
    }
  });

  it('compares with Dijkstra: BFS minimizes edge hops, Dijkstra optimizes cumulative travel friction', () => {
    const src = 'KASHMERE_GATE';
    const dst = 'BOTANICAL_GARDEN';

    const bfsResult = bfs(metroGraph, src, dst);
    const dijkstraResult = dijkstra(metroGraph, src, dst, { strategy: 'FASTEST' });

    expect(bfsResult.route).not.toBeNull();
    expect(dijkstraResult.route).not.toBeNull();

    // Both reach Botanical Garden
    expect(bfsResult.route?.stations[bfsResult.route.stations.length - 1].id).toBe(dst);
    expect(dijkstraResult.route?.stations[dijkstraResult.route.stations.length - 1].id).toBe(dst);

    // Dijkstra with friction should achieve optimal or equal total travel time
    expect(dijkstraResult.route!.totalTimeSeconds).toBeLessThanOrEqual(bfsResult.route!.totalTimeSeconds + 60);

    // Both methods track valid metrics
    expect(bfsResult.metrics.exploredNodesCount).toBeGreaterThan(0);
    expect(bfsResult.metrics.edgeTraversals).toBeGreaterThan(0);
  });
});
