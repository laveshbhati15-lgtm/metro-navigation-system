import { describe, it, expect } from 'vitest';
import {
  isValidCoordinate,
  buildLineTracks,
  getRouteCoordinates,
  computeBounds,
  DEFAULT_CENTER,
} from './mapUtils';
import type { Station, MetroRoute } from '@/core/graph/types';

describe('mapUtils', () => {
  const validStation: Station = {
    id: 'TEST_1',
    name: 'Test 1',
    lines: ['YELLOW'],
    coordinates: { lat: 28.6328, lng: 77.2197 },
    isInterchange: false,
  };

  const invalidStation: Station = {
    id: 'TEST_2',
    name: 'Test 2',
    lines: ['YELLOW'],
    coordinates: { lat: NaN, lng: 77.2197 },
    isInterchange: false,
  };

  it('validates coordinates accurately within NCR geographic limits', () => {
    expect(isValidCoordinate(validStation)).toBe(true);
    expect(isValidCoordinate(invalidStation)).toBe(false);
    expect(isValidCoordinate(null)).toBe(false);
    expect(isValidCoordinate(undefined)).toBe(false);
    expect(
      isValidCoordinate({
        ...validStation,
        coordinates: { lat: 0, lng: 0 },
      })
    ).toBe(false);
  });

  it('buildLineTracks creates valid track segments for Yellow, Blue, and Violet lines', () => {
    const tracks = buildLineTracks();
    expect(tracks.length).toBeGreaterThan(0);
    const validLines = ['YELLOW', 'BLUE', 'VIOLET', 'RED', 'GREEN', 'MAGENTA', 'PINK'];
    for (const track of tracks) {
      expect(validLines).toContain(track.line);
      expect(track.positions).toHaveLength(2);
      expect(track.positions[0][0]).toBeGreaterThan(28.0);
      expect(track.positions[0][1]).toBeGreaterThan(76.5);
    }
  });

  it('computes bounding box correctly', () => {
    const coords: [number, number][] = [
      [28.5, 77.1],
      [28.7, 77.3],
      [28.6, 77.2],
    ];
    const bounds = computeBounds(coords);
    expect(bounds).toEqual([
      [28.5, 77.1],
      [28.7, 77.3],
    ]);
  });

  it('returns null bounds for empty coordinate array', () => {
    expect(computeBounds([])).toBeNull();
  });

  it('extracts route coordinates from MetroRoute', () => {
    const mockRoute: MetroRoute = {
      stations: [
        validStation,
        {
          id: 'TEST_3',
          name: 'Test 3',
          lines: ['YELLOW'],
          coordinates: { lat: 28.65, lng: 77.23 },
          isInterchange: false,
        },
      ],
      edges: [],
      totalTimeSeconds: 120,
      totalStations: 2,
      interchanges: [],
      interchangeCount: 0,
      lineSegments: [],
      label: 'Fastest',
      hasEstimatedTimes: true,
    };

    const coords = getRouteCoordinates(mockRoute);
    expect(coords).toHaveLength(2);
    expect(coords[0]).toEqual([28.6328, 77.2197]);
    expect(coords[1]).toEqual([28.65, 77.23]);
  });

  it('has DEFAULT_CENTER set to Rajiv Chowk coordinates', () => {
    expect(DEFAULT_CENTER).toEqual([28.6328, 77.2197]);
  });
});
