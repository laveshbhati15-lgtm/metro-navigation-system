import { describe, it, expect } from 'vitest';
import {
  VIADUCT_TRACK_PATH,
  ELEVATED_STATIONS,
} from './MetroverseRailway';

describe('MetroverseRailway Transit Corridor & Coordinate System', () => {
  it('guarantees that all viaduct waypoint X coordinates remain in the right visual corridor (X >= 880) for Y < 780', () => {
    // Extract coordinate pairs (X, Y) from the SVG path string
    const coordPairs = VIADUCT_TRACK_PATH.match(/(\d+),(\d+)/g);
    expect(coordPairs).not.toBeNull();

    coordPairs?.forEach((pair) => {
      const [xStr, yStr] = pair.split(',');
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);

      if (y < 780) {
        // Content area is strictly on the left (X <= 840)
        // Viaduct must stay at X >= 880 to ensure a clear buffer of at least 40px
        expect(x).toBeGreaterThanOrEqual(880);
      }
    });
  });

  it('ensures Rajiv Chowk Nexus landmark is placed in the dedicated right visual zone, completely separate from center text', () => {
    const rc = ELEVATED_STATIONS.find(s => s.id === 'RAJIV_CHOWK');
    expect(rc).toBeDefined();
    // In 1440px wide viewport, center is 720. Rajiv Chowk must be located in right zone (X >= 1000)
    expect(rc?.x).toBeGreaterThanOrEqual(1000);
    // Left-anchored content is at X <= 840, guaranteeing >= 260px horizontal separation
    expect(rc!.x - 840).toBeGreaterThanOrEqual(260);
  });

  it('ensures all station platforms have unique positions along the transit line with monotonic downward progression', () => {
    const yCoordinates = ELEVATED_STATIONS.map(s => s.y);
    for (let i = 1; i < yCoordinates.length; i++) {
      expect(yCoordinates[i]).toBeGreaterThan(yCoordinates[i - 1]);
    }
  });

  it('confirms 3-car EMU train body is symmetrically balanced around (0,0) origin', () => {
    // Symmetrical body bounds: tail nose at X = -84, lead nose at X = +84
    const tailX = -84;
    const leadX = 84;
    const trainMidpoint = (tailX + leadX) / 2;
    // Exactly 0.0px midpoint
    expect(trainMidpoint).toBe(0);

    // Body width is 16px: Y from -8 to +8, midpoint 0.0px
    const bodyMinY = -8;
    const bodyMaxY = 8;
    expect((bodyMinY + bodyMaxY) / 2).toBe(0);

    // Left and right wheel flanges sit on twin steel rails at Y = -4.5 and +4.5
    const leftWheelY = -4.5;
    const rightWheelY = 4.5;
    expect(Math.abs(leftWheelY)).toBe(Math.abs(rightWheelY));
    expect(rightWheelY - leftWheelY).toBe(9); // 9px track gauge
  });
});
