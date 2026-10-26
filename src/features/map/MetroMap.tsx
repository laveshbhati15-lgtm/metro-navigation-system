import { useMemo, useState, useCallback, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, Popup } from 'react-leaflet';
import { useJourneyStore } from '@/store/journeyStore';
import { metroGraph } from '@/core/graph/MetroGraph';
import { LINE_COLORS } from '@/utils/lineColors';
import {
  buildLineTracks,
  getRouteCoordinates,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  isValidCoordinate,
} from './mapUtils';
import { MapOverlayControls, MapBoundsHandler, type LineFilter } from './MapControls';
import { getStationDisplayName, getStationSecondaryName, getLocalizedLineName } from '@/i18n';

export function MetroMap() {
  const { t, i18n } = useTranslation();
  const source           = useJourneyStore((s) => s.source);
  const destination      = useJourneyStore((s) => s.destination);
  const setSource        = useJourneyStore((s) => s.setSource);
  const setDestination   = useJourneyStore((s) => s.setDestination);
  const setIndoorStation = useJourneyStore((s) => s.setIndoorStation);
  const calculateRoutes  = useJourneyStore((s) => s.calculateRoutes);
  const routes           = useJourneyStore((s) => s.routes);
  const activeRouteIndex = useJourneyStore((s) => s.activeRouteIndex);

  const activeRoute = routes[activeRouteIndex] ?? null;

  // Basemap Mode: 'schematic' (clean dark vector transit canvas, zero watermark, 100% offline resilient)
  // vs 'streets' (external street map tiles)
  const [basemapMode, setBasemapMode]             = useState<'schematic' | 'streets'>('schematic');
  const [tileError, setTileError]                 = useState(false);
  const [lineFilter, setLineFilter]               = useState<LineFilter>('ALL');

  const handleTileError = useCallback(() => {
    setTileError(true);
  }, []);

  // Memoize line track segments and all valid stations
  const rawTracks   = useMemo(() => buildLineTracks(), []);
  const allStations = useMemo(() => metroGraph.getAllStations().filter(isValidCoordinate), []);

  // Filter tracks by lineFilter
  const tracks = useMemo(() => {
    if (lineFilter === 'ALL') return rawTracks;
    return rawTracks.filter(t => t.line === lineFilter);
  }, [rawTracks, lineFilter]);

  // Compute route coordinates for highlighting
  const routeCoordinates = useMemo(
    () => (activeRoute ? getRouteCoordinates(activeRoute) : []),
    [activeRoute],
  );

  const allCoordinates = useMemo<[number, number][]>(
    () => allStations.map((s) => [s.coordinates.lat, s.coordinates.lng]),
    [allStations],
  );

  // Set of station IDs on the active route
  const routeStationIds = useMemo(
    () => new Set(activeRoute ? activeRoute.stations.map((s) => s.id) : []),
    [activeRoute],
  );

  // Compute segment-specific coordinates with respective line colors
  const segmentTracks = useMemo(() => {
    if (!activeRoute || activeRoute.lineSegments.length === 0) return [];
    return activeRoute.lineSegments.map((seg) => ({
      line: seg.line,
      positions: seg.stations
        .filter(isValidCoordinate)
        .map((s) => [s.coordinates.lat, s.coordinates.lng] as [number, number]),
    }));
  }, [activeRoute]);

  return (
    <div
      className="relative w-full rounded-2xl border border-slate-800 shadow-xl bg-[#02050c] overflow-hidden h-[460px] sm:h-[560px] lg:h-[640px] isolate"
    >
      {/* Tile-unavailable banner */}
      {tileError && basemapMode === 'streets' && (
        <div className="absolute inset-x-0 top-3 z-[500] flex justify-center pointer-events-none">
          <div className="bg-amber-900/90 border border-amber-500/50 text-amber-200 text-xs px-4 py-2 rounded-lg shadow-lg backdrop-blur-sm flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            {t('map.tilesUnavailable')}
          </div>
        </div>
      )}

      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        minZoom={10}
        maxZoom={17}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%', borderRadius: '1rem', background: '#030712' }}
      >
        <MapBoundsHandler
          routeCoordinates={routeCoordinates}
          allCoordinates={allCoordinates}
        />

        {/* Overlay controls: fit-network, fit-route, line filters, basemap toggle, legend */}
        <MapOverlayControls
          routeCoordinates={routeCoordinates}
          allCoordinates={allCoordinates}
          lineFilter={lineFilter}
          onLineFilterChange={setLineFilter}
          basemapMode={basemapMode}
          onBasemapModeChange={setBasemapMode}
        />

        {/* Street basemap tile layer (active when streets mode is toggled) */}
        {basemapMode === 'streets' && (
          <TileLayer
            key="tile-osm"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
            errorTileUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            eventHandlers={{ tileerror: handleTileError }}
          />
        )}

        {/* ── 1. Background Network Tracks ── */}
        {tracks.map((track, i) => {
          const color = LINE_COLORS[track.line];
          const isRouteActive = routeCoordinates.length > 0;
          return (
            <Polyline
              key={`track-${track.line}-${track.fromStation.id}-${track.toStation.id}-${i}`}
              positions={track.positions}
              pathOptions={{
                color,
                weight: isRouteActive ? 3.5 : 4.5,
                opacity: isRouteActive ? 0.2 : 0.85,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          );
        })}

        {/* ── 2. Active Route Multi-Layer Glowing Tracks (Per-Segment Color) ── */}
        {segmentTracks.length > 0 ? (
          segmentTracks.map((seg, sIdx) => {
            const segColor = LINE_COLORS[seg.line] || '#38bdf8';
            return (
              <Fragment key={`active-seg-${seg.line}-${sIdx}`}>
                {/* Broad atmospheric halo */}
                <Polyline
                  positions={seg.positions}
                  pathOptions={{
                    color: segColor,
                    weight: 15,
                    opacity: 0.35,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
                {/* Middle vibrant electric beam */}
                <Polyline
                  positions={seg.positions}
                  pathOptions={{
                    color: segColor,
                    weight: 6,
                    opacity: 0.95,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
                {/* Core illuminated center wire */}
                <Polyline
                  positions={seg.positions}
                  pathOptions={{
                    color: '#ffffff',
                    weight: 2,
                    opacity: 0.9,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
              </Fragment>
            );
          })
        ) : routeCoordinates.length > 1 ? (
          <>
            <Polyline
              positions={routeCoordinates}
              pathOptions={{
                color: '#38bdf8',
                weight: 15,
                opacity: 0.35,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            <Polyline
              positions={routeCoordinates}
              pathOptions={{
                color: '#0284c7',
                weight: 6,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            <Polyline
              positions={routeCoordinates}
              pathOptions={{
                color: '#ffffff',
                weight: 2,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </>
        ) : null}

        {/* ── 3. Station Markers & Interchange Halos ── */}
        {allStations.map((station) => {
          const isSource      = source?.id === station.id;
          const isDestination = destination?.id === station.id;
          const isOnRoute     = routeStationIds.has(station.id);
          const isInterchange = station.isInterchange;

          const primaryColor =
            station.lines.length > 0 ? LINE_COLORS[station.lines[0]] : '#94a3b8';

          let fillColor    = primaryColor;
          let radius       = isInterchange ? 6.5 : 4.5;
          let strokeColor  = '#030712';
          let strokeWidth  = 1.5;
          let fillOpacity  = 0.92;

          if (isSource) {
            fillColor = '#10b981'; radius = 9; strokeColor = '#ffffff'; strokeWidth = 2.5; fillOpacity = 1;
          } else if (isDestination) {
            fillColor = '#ef4444'; radius = 9; strokeColor = '#ffffff'; strokeWidth = 2.5; fillOpacity = 1;
          } else if (isOnRoute) {
            radius = isInterchange ? 8 : 6; strokeColor = '#ffffff'; strokeWidth = 2; fillOpacity = 1;
          } else if (routeCoordinates.length > 0) {
            fillOpacity = 0.45;
          }

          const displayName = getStationDisplayName(station, i18n.language);
          const secondaryName = getStationSecondaryName(station, i18n.language);

          return (
            <Fragment key={station.id}>
              {/* Outer beacon halo for Origin and Destination */}
              {(isSource || isDestination) && (
                <CircleMarker
                  center={[station.coordinates.lat, station.coordinates.lng]}
                  radius={16}
                  pathOptions={{
                    color: isSource ? '#10b981' : '#ef4444',
                    weight: 1.5,
                    dashArray: '3 3',
                    fillColor: isSource ? '#34d399' : '#f87171',
                    fillOpacity: 0.25,
                  }}
                />
              )}

              {/* Outer concentric halo for Interchange stations */}
              {isInterchange && !isSource && !isDestination && (
                <CircleMarker
                  center={[station.coordinates.lat, station.coordinates.lng]}
                  radius={isOnRoute ? 12 : 9.5}
                  pathOptions={{
                    color: '#a855f7',
                    weight: 1.5,
                    dashArray: '2 2',
                    fillColor: '#c084fc',
                    fillOpacity: 0.2,
                  }}
                />
              )}

              {/* Main station dot */}
              <CircleMarker
                center={[station.coordinates.lat, station.coordinates.lng]}
                radius={radius}
                pathOptions={{ color: strokeColor, weight: strokeWidth, fillColor, fillOpacity }}
              >
              {/* Tooltip on hover */}
              <Tooltip direction="top" offset={[0, -6]} opacity={0.97}>
                <div className="font-sans text-xs">
                  <span className="font-semibold text-white">{displayName}</span>
                  {secondaryName && (
                    <span className="text-gray-400 ml-1 font-normal">({secondaryName})</span>
                  )}
                  {isInterchange && (
                    <span className="ml-1 text-[10px] text-amber-400 font-semibold"> [{t('map.interchange')}]</span>
                  )}
                </div>
              </Tooltip>

              {/* Popup on click */}
              <Popup className="station-popup">
                <div className="p-1 space-y-2.5 min-w-[190px]">
                  <div>
                    <h4 className="text-sm font-bold text-white leading-snug">{displayName}</h4>
                    {secondaryName && (
                      <p className="text-xs text-gray-400">{secondaryName}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {station.lines.map((l) => (
                      <span
                        key={l}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1"
                        style={{
                          backgroundColor: `${LINE_COLORS[l]}25`,
                          color: LINE_COLORS[l],
                          border: `1px solid ${LINE_COLORS[l]}50`,
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: LINE_COLORS[l] }} />
                        {getLocalizedLineName(l, i18n.language)}
                      </span>
                    ))}
                    {isInterchange && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">
                        {t('map.interchange')}
                      </span>
                    )}
                  </div>

                  <div className="pt-2 border-t border-white/10 grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      disabled={isSource}
                      onClick={() => {
                        setSource(station);
                        if (destination && destination.id !== station.id) {
                          setTimeout(() => calculateRoutes(), 0);
                        }
                      }}
                      className={`text-xs py-1.5 px-2 rounded-lg font-medium transition-colors ${
                        isSource
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                          : 'bg-white/10 hover:bg-emerald-600/30 text-gray-200 hover:text-emerald-300 hover:border-emerald-500/40 border border-white/10'
                      }`}
                    >
                      {isSource ? t('map.startChecked') : destination && destination.id !== station.id ? t('map.setAndPlan') : t('map.setAsFrom')}
                    </button>
                    <button
                      type="button"
                      disabled={isDestination}
                      onClick={() => {
                        setDestination(station);
                        if (source && source.id !== station.id) {
                          setTimeout(() => calculateRoutes(), 0);
                        }
                      }}
                      className={`text-xs py-1.5 px-2 rounded-lg font-medium transition-colors ${
                        isDestination
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30 cursor-default'
                          : 'bg-white/10 hover:bg-red-600/30 text-gray-200 hover:text-red-300 hover:border-red-500/40 border border-white/10'
                      }`}
                    >
                      {isDestination ? t('map.endChecked') : source && source.id !== station.id ? t('map.setAndPlan') : t('map.setAsTo')}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIndoorStation(station)}
                    className="w-full text-[11px] py-1.5 px-2.5 rounded-lg font-medium bg-blue-600/20 hover:bg-blue-600/30 text-cyan-300 border border-cyan-500/30 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>♿</span>
                    <span>{t('map.indoorGuide')}</span>
                  </button>
                </div>
              </Popup>
            </CircleMarker>
          </Fragment>
        );
      })}
      </MapContainer>
      {/* Bottom Persistent Map Legend Strip */}
      <div className="absolute bottom-3 left-3 right-3 z-[400] pointer-events-none">
        <div className="max-w-max mx-auto px-3.5 py-1.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-800/90 text-xs shadow-lg flex items-center gap-3 flex-wrap justify-center pointer-events-auto">
          {activeRoute ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-emerald-500/30" />
                <span className="text-[11px] font-medium text-white">{getStationDisplayName(activeRoute.stations[0], i18n.language)}</span>
              </div>
              <span className="text-gray-500 text-xs">➔</span>
              <div className="flex items-center gap-1.5">
                {activeRoute.lineSegments.map((seg, sIdx) => (
                  <span
                    key={sIdx}
                    className="text-[10px] font-mono px-2 py-0.5 rounded font-bold"
                    style={{ backgroundColor: `${LINE_COLORS[seg.line]}25`, color: LINE_COLORS[seg.line] }}
                  >
                    {getLocalizedLineName(seg.line, i18n.language)}
                  </span>
                ))}
              </div>
              <span className="text-gray-500 text-xs">➔</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400 ring-2 ring-rose-500/30" />
                <span className="text-[11px] font-medium text-white">{getStationDisplayName(activeRoute.stations[activeRoute.stations.length - 1], i18n.language)}</span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-4 text-[11px] font-sans text-gray-300">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-yellow-400" />
                <span>{getLocalizedLineName('YELLOW', i18n.language)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span>{getLocalizedLineName('BLUE', i18n.language)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                <span>{getLocalizedLineName('VIOLET', i18n.language)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full ring-2 ring-purple-400/80 bg-slate-900" />
                <span>{t('search.interchangeBadge')}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
