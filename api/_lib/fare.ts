import stationsData from '../../src/core/data/stations.json' with { type: 'json' };
import connectionsData from '../../src/core/data/connections.json' with { type: 'json' };

export interface StationData {
  id: string;
  name: string;
  lines: string[];
}

export interface EdgeData {
  from: string;
  to: string;
  line: string;
}

const stationsMap = new Map<string, StationData>();
for (const s of (stationsData as { stations: StationData[] }).stations) {
  stationsMap.set(s.id, s);
}

// Build adjacency for shortest path verification
const adjacency = new Map<string, string[]>();
for (const e of (connectionsData as { edges: EdgeData[] }).edges) {
  if (!adjacency.has(e.from)) adjacency.set(e.from, []);
  if (!adjacency.has(e.to)) adjacency.set(e.to, []);
  adjacency.get(e.from)!.push(e.to);
  adjacency.get(e.to)!.push(e.from);
}

/**
 * Calculates minimum hop/station count between two verified stations using BFS.
 */
export function calculateShortestStationCount(sourceId: string, destinationId: string): number {
  if (sourceId === destinationId) return 1;

  const queue: Array<{ id: string; hops: number }> = [{ id: sourceId, hops: 0 }];
  const visited = new Set<string>([sourceId]);

  while (queue.length > 0) {
    const { id, hops } = queue.shift()!;
    if (id === destinationId) {
      return hops + 1; // total stations inclusive
    }

    const neighbors = adjacency.get(id) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ id: neighbor, hops: hops + 1 });
      }
    }
  }

  throw new Error(`No connected metro path exists between ${sourceId} and ${destinationId}`);
}

/**
 * Compute official estimated fare in Rupees based on DMRC distance slabs.
 */
export function calculateServerFare(stationCount: number): number {
  const distanceKm = Math.max(0, (stationCount - 1) * 1.5);
  if (distanceKm <= 2) return 10;
  if (distanceKm <= 5) return 20;
  if (distanceKm <= 12) return 30;
  if (distanceKm <= 21) return 40;
  if (distanceKm <= 32) return 50;
  return 60;
}

export interface ValidatedFareResult {
  source: StationData;
  destination: StationData;
  stationCount: number;
  baseFare: number;
  totalFare: number;
  amountInPaise: number;
  passengerCount: number;
  ticketType: 'SINGLE' | 'RETURN';
}

/**
 * Validates stations, calculates official fare, and determines exact price in paise.
 * Never trusts client-supplied amounts.
 */
export function validateAndCalculateFare(
  sourceId: string,
  destinationId: string,
  rawPassengerCount: number = 1,
  rawTicketType: string = 'SINGLE'
): ValidatedFareResult {
  const source = stationsMap.get(sourceId);
  const destination = stationsMap.get(destinationId);

  if (!source) {
    throw new Error(`Invalid source station ID: "${sourceId}".`);
  }
  if (!destination) {
    throw new Error(`Invalid destination station ID: "${destinationId}".`);
  }
  if (source.id === destination.id) {
    throw new Error('Source and Destination stations cannot be identical.');
  }

  const passengerCount = Math.max(1, Math.min(6, Math.floor(rawPassengerCount) || 1));
  const ticketType: 'SINGLE' | 'RETURN' = rawTicketType === 'RETURN' ? 'RETURN' : 'SINGLE';

  const stationCount = calculateShortestStationCount(source.id, destination.id);
  const baseFare = calculateServerFare(stationCount);
  const returnMultiplier = ticketType === 'RETURN' ? 1.8 : 1.0;
  const totalFare = Math.round(baseFare * passengerCount * returnMultiplier);
  const amountInPaise = totalFare * 100;

  return {
    source,
    destination,
    stationCount,
    baseFare,
    totalFare,
    amountInPaise,
    passengerCount,
    ticketType,
  };
}
