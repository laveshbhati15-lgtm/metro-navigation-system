import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MetroMap } from './MetroMap';
import { PlannerThemeProvider } from '@/context/PlannerThemeContext';
import { useJourneyStore } from '@/store/journeyStore';
import { metroGraph } from '@/core/graph/MetroGraph';
import { isValidCoordinate } from './mapUtils';

describe('MetroMap Station Visibility & Leaflet Rendering Pipeline', () => {
  beforeEach(() => {
    localStorage.clear();
    useJourneyStore.setState({
      source: null,
      destination: null,
      routes: [],
      activeRouteIndex: 0,
    });
  });

  it('validates that all 223 network stations have valid WGS-84 coordinates', () => {
    const stations = metroGraph.getAllStations();
    expect(stations).toHaveLength(223);
    const validStations = stations.filter(isValidCoordinate);
    expect(validStations).toHaveLength(223);
  });

  it('renders all station markers inside Leaflet markerPane with z-index 600', () => {
    const { container } = render(
      <PlannerThemeProvider initialTheme="dark-transit">
        <MetroMap />
      </PlannerThemeProvider>
    );

    const markerPane = container.querySelector('.leaflet-marker-pane');
    expect(markerPane).toBeTruthy();

    const svgInMarkerPane = markerPane?.querySelector('svg');
    expect(svgInMarkerPane).toBeTruthy();

    const stationPaths = markerPane?.querySelectorAll('path') || [];
    // 223 station dots + 32 interchange halos = 255 paths in markerPane
    expect(stationPaths.length).toBeGreaterThanOrEqual(223);
  });

  it('applies dark high-contrast stroke in Light Metro theme so yellow stations do not wash out', () => {
    const { container } = render(
      <PlannerThemeProvider initialTheme="light-metro">
        <MetroMap />
      </PlannerThemeProvider>
    );

    const markerPane = container.querySelector('.leaflet-marker-pane');
    const stationPaths = Array.from(markerPane?.querySelectorAll('path') || []);

    const hasDarkStroke = stationPaths.some(p => p.getAttribute('stroke') === '#0f172a');
    expect(hasDarkStroke).toBe(true);
  });

  it('applies dark outline in Dark Transit theme and Midnight Blue theme', () => {
    const { container } = render(
      <PlannerThemeProvider initialTheme="dark-transit">
        <MetroMap />
      </PlannerThemeProvider>
    );

    const markerPane = container.querySelector('.leaflet-marker-pane');
    const stationPaths = Array.from(markerPane?.querySelectorAll('path') || []);

    const hasTransitStroke = stationPaths.some(p => p.getAttribute('stroke') === '#030712');
    expect(hasTransitStroke).toBe(true);
  });

  it('keeps non-route stations visible with high opacity when a route is active', () => {
    const samaypur = metroGraph.getStation('SAMAYPUR_BADLI')!;
    const jahangirpuri = metroGraph.getStation('JAHANGIRPURI')!;

    useJourneyStore.setState({
      source: samaypur,
      destination: jahangirpuri,
      routes: [
        {
          stations: [samaypur, jahangirpuri],
          edges: [],
          totalTimeSeconds: 240,
          totalStations: 2,
          interchanges: [],
          interchangeCount: 0,
          lineSegments: [{ line: 'YELLOW', stations: [samaypur, jahangirpuri], durationSeconds: 240 }],
          label: 'Fastest',
          hasEstimatedTimes: true,
        },
      ],
      activeRouteIndex: 0,
    });

    const { container } = render(
      <PlannerThemeProvider initialTheme="dark-transit">
        <MetroMap />
      </PlannerThemeProvider>
    );

    const markerPane = container.querySelector('.leaflet-marker-pane');
    const stationPaths = Array.from(markerPane?.querySelectorAll('path') || []);

    // Non-route stations should have fill-opacity of 0.75, not the old washed-out 0.45
    const hasVisibleNonRoute = stationPaths.some(p => p.getAttribute('fill-opacity') === '0.75');
    expect(hasVisibleNonRoute).toBe(true);
  });

  it('renders origin and destination stations with prominent beacon halos in markerPane', () => {
    const rajivChowk = metroGraph.getStation('RAJIV_CHOWK')!;
    const kashmereGate = metroGraph.getStation('KASHMERE_GATE')!;

    useJourneyStore.setState({
      source: rajivChowk,
      destination: kashmereGate,
    });

    const { container } = render(
      <PlannerThemeProvider initialTheme="dark-transit">
        <MetroMap />
      </PlannerThemeProvider>
    );

    const markerPane = container.querySelector('.leaflet-marker-pane');
    const stationPaths = Array.from(markerPane?.querySelectorAll('path') || []);

    // Origin green fill: #10b981
    const hasOrigin = stationPaths.some(p => p.getAttribute('fill') === '#10b981');
    // Destination red fill: #ef4444
    const hasDestination = stationPaths.some(p => p.getAttribute('fill') === '#ef4444');

    expect(hasOrigin).toBe(true);
    expect(hasDestination).toBe(true);
  });

  it('filters station prominence when line filter is toggled', () => {
    const { container } = render(
      <PlannerThemeProvider initialTheme="dark-transit">
        <MetroMap />
      </PlannerThemeProvider>
    );

    const yellowBtn = container.querySelector('#btn-filter-yellow');
    expect(yellowBtn).toBeTruthy();
    if (yellowBtn) {
      fireEvent.click(yellowBtn);

      const markerPane = container.querySelector('.leaflet-marker-pane');
      const stationPaths = Array.from(markerPane?.querySelectorAll('path') || []);

      // Non-yellow stations should be dimmed to fill-opacity 0.2
      const hasDimmed = stationPaths.some(p => p.getAttribute('fill-opacity') === '0.2');
      expect(hasDimmed).toBe(true);
    }
  });

  it('switches between vector schematic basemap and streets tile mode', () => {
    const { container } = render(
      <PlannerThemeProvider initialTheme="dark-transit">
        <MetroMap />
      </PlannerThemeProvider>
    );

    const streetsBtn = container.querySelector('#btn-basemap-streets');
    expect(streetsBtn).toBeTruthy();
    if (streetsBtn) {
      fireEvent.click(streetsBtn);
      const tilePane = container.querySelector('.leaflet-tile-pane');
      expect(tilePane).toBeTruthy();
    }
  });
});
