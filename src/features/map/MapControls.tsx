import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import { computeBounds, DEFAULT_CENTER, DEFAULT_ZOOM } from './mapUtils';

export type LineFilter = 'ALL' | 'YELLOW' | 'BLUE' | 'VIOLET';

interface MapBoundsHandlerProps {
  routeCoordinates: [number, number][];
  allCoordinates: [number, number][];
}

export function MapBoundsHandler({ routeCoordinates }: MapBoundsHandlerProps) {
  const map = useMap();

  useEffect(() => {
    if (routeCoordinates.length > 1) {
      const bounds = computeBounds(routeCoordinates);
      if (bounds) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14, animate: true });
      }
    }
  }, [map, routeCoordinates]);

  return null;
}

interface MapOverlayControlsProps {
  routeCoordinates: [number, number][];
  allCoordinates: [number, number][];
  lineFilter?: LineFilter;
  onLineFilterChange?: (filter: LineFilter) => void;
  basemapMode?: 'schematic' | 'streets';
  onBasemapModeChange?: (mode: 'schematic' | 'streets') => void;
}

export function MapOverlayControls({
  routeCoordinates,
  allCoordinates,
  lineFilter = 'ALL',
  onLineFilterChange,
  basemapMode = 'schematic',
  onBasemapModeChange,
}: MapOverlayControlsProps) {
  const map = useMap();
  const hasRoute = routeCoordinates.length > 0;
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleResetView = () => {
    const bounds = computeBounds(allCoordinates);
    if (bounds) {
      map.fitBounds(bounds, { padding: [40, 40], animate: true });
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: true });
    }
  };

  const handleFitRoute = () => {
    if (routeCoordinates.length > 0) {
      const bounds = computeBounds(routeCoordinates);
      if (bounds) {
        map.fitBounds(bounds, { padding: [60, 60], animate: true });
      }
    }
  };

  return (
    <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-[400] flex flex-col items-end gap-2 pointer-events-auto">
      {/* Mobile Collapse Toggle Button */}
      <button
        id="btn-toggle-map-controls"
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="sm:hidden bg-navy-900/90 backdrop-blur-md border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 shadow-lg flex items-center gap-1.5 font-mono"
        aria-label="Toggle map overlay controls"
      >
        <span>{isCollapsed ? 'Show Controls ⚙' : 'Hide Controls ✕'}</span>
      </button>

      {!isCollapsed && (
        <>
          {/* Status & Scope Pill */}
          <div className="bg-navy-900/90 backdrop-blur-md border border-white/10 rounded-xl px-3 py-1.5 text-xs text-gray-300 shadow-xl flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-mono font-medium text-[11px] text-cyan-300">
              {allCoordinates.length > 0 ? `${allCoordinates.length} Geo-Mapped Stations` : '124 Geo-Mapped Stations'}
            </span>
          </div>

          {/* Line Filter Toggle Bar */}
          {onLineFilterChange && (
            <div className="bg-navy-900/90 backdrop-blur-md border border-white/10 rounded-xl p-1 shadow-xl flex items-center gap-1">
              <button
                id="btn-filter-all"
                type="button"
                onClick={() => onLineFilterChange('ALL')}
                className={`text-[10px] font-mono px-2 py-1 rounded-lg transition-colors ${
                  lineFilter === 'ALL'
                    ? 'bg-blue-600 text-white font-bold shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                All
              </button>
              <button
                id="btn-filter-yellow"
                type="button"
                onClick={() => onLineFilterChange('YELLOW')}
                className={`text-[10px] font-mono px-2 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                  lineFilter === 'YELLOW'
                    ? 'bg-yellow-500 text-gray-950 font-bold shadow-sm'
                    : 'text-gray-400 hover:text-yellow-300 hover:bg-white/5'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                Yellow
              </button>
              <button
                id="btn-filter-blue"
                type="button"
                onClick={() => onLineFilterChange('BLUE')}
                className={`text-[10px] font-mono px-2 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                  lineFilter === 'BLUE'
                    ? 'bg-blue-600 text-white font-bold shadow-sm'
                    : 'text-gray-400 hover:text-blue-300 hover:bg-white/5'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                Blue
              </button>
              <button
                id="btn-filter-violet"
                type="button"
                onClick={() => onLineFilterChange('VIOLET')}
                className={`text-[10px] font-mono px-2 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                  lineFilter === 'VIOLET'
                    ? 'bg-purple-700 text-white font-bold shadow-sm'
                    : 'text-gray-400 hover:text-purple-300 hover:bg-white/5'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                Violet
              </button>
            </div>
          )}

          {/* Basemap Mode Toggle (Schematic vs Street Tiles) */}
          {onBasemapModeChange && (
            <div className="bg-navy-900/90 backdrop-blur-md border border-white/10 rounded-xl p-1 shadow-xl flex items-center gap-1">
              <button
                id="btn-basemap-transit"
                type="button"
                onClick={() => onBasemapModeChange('schematic')}
                title="High-performance dark vector canvas (Zero watermark, 100% offline resilient)"
                className={`text-[10px] font-mono px-2 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                  basemapMode === 'schematic'
                    ? 'bg-cyan-600 text-white font-bold shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <span>Transit</span>
              </button>
              <button
                id="btn-basemap-streets"
                type="button"
                onClick={() => onBasemapModeChange('streets')}
                title="Geographic street basemap tiles"
                className={`text-[10px] font-mono px-2 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                  basemapMode === 'streets'
                    ? 'bg-blue-600 text-white font-bold shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <span>Streets</span>
              </button>
            </div>
          )}

          {/* Action Control buttons */}
          <div className="bg-navy-900/90 backdrop-blur-md border border-white/10 rounded-xl p-1.5 shadow-xl flex flex-col gap-1 w-32">
            <button
              id="btn-fit-network"
              type="button"
              onClick={handleResetView}
              title="Reset to full network view"
              className="btn-ghost text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-2 text-gray-300 hover:text-white font-medium justify-start"
            >
              <svg className="w-3.5 h-3.5 text-cyan-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              <span>Fit Network</span>
            </button>

            {hasRoute && (
              <button
                id="btn-fit-route"
                type="button"
                onClick={handleFitRoute}
                title="Zoom to active route"
                className="bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 hover:text-white text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-2 transition-colors font-medium justify-start shadow-glow-cyan/20"
              >
                <svg className="w-3.5 h-3.5 text-cyan-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <span>Fit Route</span>
              </button>
            )}
          </div>

          {/* Map Legend */}
          <div className="bg-navy-900/90 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-xl text-xs space-y-2 w-36">
            <p className="font-bold text-gray-300 uppercase tracking-wider text-[10px] font-mono">
              Network Legend
            </p>
            <div className="flex items-center gap-2 text-gray-300 text-[11px]">
              <span className="w-3 h-1.5 rounded-full bg-[#f4c430]" />
              <span>Yellow Line</span>
            </div>
            <div className="flex items-center gap-2 text-gray-300 text-[11px]">
              <span className="w-3 h-1.5 rounded-full bg-[#2176ae]" />
              <span>Blue Line</span>
            </div>
            <div className="flex items-center gap-2 text-gray-300 text-[11px]">
              <span className="w-3 h-1.5 rounded-full bg-[#7b2d8b]" />
              <span>Violet Line</span>
            </div>
            <div className="pt-1.5 border-t border-white/10 space-y-1.5 text-[10px] text-gray-400">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-white bg-purple-500" />
                <span>Interchange</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>Origin (From)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span>Destination (To)</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
