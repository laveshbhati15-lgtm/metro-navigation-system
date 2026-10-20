import type { Station, Edge, MetroRoute, LineCode } from '@/core/graph/types';
import stationsData from '@/core/data/stations.json';
import connectionsData from '@/core/data/connections.json';

export interface LatLngPair {
  lat: number;
  lng: number;
}

export interface LineTrackSegment {
  line: LineCode;
  fromStation: Station;
  toStation: Station;
  positions: [number, number][];
}

/** Default center of Delhi Metro network around Rajiv Chowk */
export const DEFAULT_CENTER: [number, number] = [28.6328, 77.2197];
export const DEFAULT_ZOOM = 11;

/**
 * Validate that a station has usable, numeric coordinates.
 */
export function isValidCoordinate(station?: Station | null): boolean {
  if (!station || !station.coordinates) return false;
  const { lat, lng } = station.coordinates;
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= 25 &&
    lat <= 32 &&
    lng >= 74 &&
    lng <= 80
  );
}

/**
 * Build line track segments from connections and stations.
 * Filters out any connection where either station has missing or invalid coordinates.
 */
export function buildLineTracks(): LineTrackSegment[] {
  const stationMap = new Map<string, Station>();
  for (const s of (stationsData.stations as Station[])) {
    if (isValidCoordinate(s)) {
      stationMap.set(s.id, s);
    }
  }

  const tracks: LineTrackSegment[] = [];
  for (const edge of (connectionsData.edges as Edge[])) {
    const from = stationMap.get(edge.from);
    const to = stationMap.get(edge.to);
    if (from && to) {
      tracks.push({
        line: edge.line,
        fromStation: from,
        toStation: to,
        positions: [
          [from.coordinates.lat, from.coordinates.lng],
          [to.coordinates.lat, to.coordinates.lng],
        ],
      });
    }
  }

  return tracks;
}

/**
 * Extract an array of [lat, lng] coordinates from a MetroRoute.
 */
export function getRouteCoordinates(route: MetroRoute): [number, number][] {
  const coords: [number, number][] = [];
  for (const s of route.stations) {
    if (isValidCoordinate(s)) {
      coords.push([s.coordinates.lat, s.coordinates.lng]);
    }
  }
  return coords;
}

/**
 * Compute the bounding box of a list of coordinates for Leaflet fitBounds.
 */
export function computeBounds(coords: [number, number][]): [[number, number], [number, number]] | null {
  if (coords.length === 0) return null;
  let minLat = coords[0][0];
  let maxLat = coords[0][0];
  let minLng = coords[0][1];
  let maxLng = coords[0][1];

  for (let i = 1; i < coords.length; i++) {
    const [lat, lng] = coords[i];
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}
