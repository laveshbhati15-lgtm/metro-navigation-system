import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const map = useMap();
  const hasRoute = routeCoordinates.length > 0;
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

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
    <>
      {/* Top-Right Unified Map HUD */}
      <div className="absolute top-3 right-3 sm:top-3.5 sm:right-3.5 z-[400] flex flex-col items-end gap-1.5 pointer-events-auto">
        {/* Mobile Collapse Toggle Button */}
        <button
          id="btn-toggle-map-controls"
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="sm:hidden bg-[var(--planner-hud-bg)] backdrop-blur-md border border-[var(--planner-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--planner-text-primary)] shadow-md flex items-center gap-1.5 font-mono"
          aria-label={t('map.toggleControlsAria')}
        >
          <span>{isCollapsed ? t('map.showControls') : t('map.hideControls')}</span>
        </button>

        {!isCollapsed && (
          <div className="flex flex-col items-end gap-1.5">
            {/* Unified Top Toolbar */}
            <div className="bg-[var(--planner-hud-bg)] backdrop-blur-md border border-[var(--planner-border)] rounded-lg p-1 shadow-md flex items-center gap-1 flex-wrap justify-end transition-colors">
              {/* Status Pill */}
              <div className="px-2 py-1 text-[11px] font-mono text-[var(--planner-text-secondary)] flex items-center gap-1.5 border-r border-[var(--planner-border-subtle)] pr-2.5 mr-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--planner-accent-text)]" />
                <span>{allCoordinates.length > 0 ? allCoordinates.length : 124} {t('planner.stations')}</span>
              </div>

              {/* Line Filter Toggle Bar */}
              {onLineFilterChange && (
                <div className="flex items-center gap-0.5 bg-[var(--planner-surface-subtle)] p-0.5 rounded border border-[var(--planner-border-subtle)]">
                  <button
                    id="btn-filter-all"
                    type="button"
                    onClick={() => onLineFilterChange('ALL')}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors ${
                      lineFilter === 'ALL'
                        ? 'bg-[var(--planner-accent)] text-white font-medium shadow-xs'
                        : 'text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)]'
                    }`}
                  >
                    {t('map.all')}
                  </button>
                  <button
                    id="btn-filter-yellow"
                    type="button"
                    onClick={() => onLineFilterChange('YELLOW')}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                      lineFilter === 'YELLOW'
                        ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-300 border border-yellow-500/40 font-medium'
                        : 'text-[var(--planner-text-secondary)] hover:text-yellow-500'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                    <span>{t('map.yellow')}</span>
                  </button>
                  <button
                    id="btn-filter-blue"
                    type="button"
                    onClick={() => onLineFilterChange('BLUE')}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                      lineFilter === 'BLUE'
                        ? 'bg-blue-600/20 text-blue-600 dark:text-blue-300 border border-blue-500/40 font-medium'
                        : 'text-[var(--planner-text-secondary)] hover:text-blue-500'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span>{t('map.blue')}</span>
                  </button>
                  <button
                    id="btn-filter-violet"
                    type="button"
                    onClick={() => onLineFilterChange('VIOLET')}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                      lineFilter === 'VIOLET'
                        ? 'bg-purple-600/20 text-purple-600 dark:text-purple-300 border border-purple-500/40 font-medium'
                        : 'text-[var(--planner-text-secondary)] hover:text-purple-500'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    <span>{t('map.violet')}</span>
                  </button>
                </div>
              )}

              {/* Basemap Mode Toggle */}
              {onBasemapModeChange && (
                <div className="flex items-center gap-0.5 bg-[var(--planner-surface-subtle)] p-0.5 rounded border border-[var(--planner-border-subtle)]">
                  <button
                    id="btn-basemap-transit"
                    type="button"
                    onClick={() => onBasemapModeChange('schematic')}
                    title={t('map.transitTooltip')}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors ${
                      basemapMode === 'schematic'
                        ? 'bg-[var(--planner-surface)] text-[var(--planner-text-primary)] font-medium border border-[var(--planner-border)] shadow-xs'
                        : 'text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)]'
                    }`}
                  >
                    <span>{t('map.transit')}</span>
                  </button>
                  <button
                    id="btn-basemap-streets"
                    type="button"
                    onClick={() => onBasemapModeChange('streets')}
                    title={t('map.streetsTooltip')}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors ${
                      basemapMode === 'streets'
                        ? 'bg-[var(--planner-surface)] text-[var(--planner-text-primary)] font-medium border border-[var(--planner-border)] shadow-xs'
                        : 'text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)]'
                    }`}
                  >
                    <span>{t('map.streets')}</span>
                  </button>
                </div>
              )}
            </div>

            {/* View Zoom & Center Controls Row */}
            <div className="flex items-center gap-1.5">
              <button
                id="btn-fit-network"
                type="button"
                onClick={handleResetView}
                title={t('map.resetViewTitle')}
                className="bg-[var(--planner-hud-bg)] backdrop-blur-md border border-[var(--planner-border)] hover:border-[var(--planner-border-highlight)] text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)] text-xs px-2.5 py-1.5 rounded-md flex items-center gap-1.5 font-mono shadow-xs transition-colors"
              >
                <svg className="w-3.5 h-3.5 text-[var(--planner-accent-text)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                <span>{t('map.fitNetwork')}</span>
              </button>

              {hasRoute && (
                <button
                  id="btn-fit-route"
                  type="button"
                  onClick={handleFitRoute}
                  title={t('map.fitRouteTitle')}
                  className="bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-[var(--planner-accent-text)] hover:opacity-90 text-xs px-2.5 py-1.5 rounded-md flex items-center gap-1.5 font-mono transition-colors shadow-xs"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <span>{t('map.fitRoute')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowLegend(!showLegend)}
                className="bg-[var(--planner-hud-bg)] backdrop-blur-md border border-[var(--planner-border)] hover:border-[var(--planner-border-highlight)] text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)] text-xs px-2 py-1.5 rounded-md flex items-center gap-1 font-mono shadow-xs transition-colors"
                title="Toggle Network Legend"
              >
                <span>📋</span>
                <span className="text-[11px] hidden sm:inline">{t('map.networkLegend')}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Bottom-Left Collapsible Legend */}
      {showLegend && (
        <div className="absolute bottom-4 left-4 z-[400] bg-[var(--planner-hud-bg)] backdrop-blur-md border border-[var(--planner-border)] rounded-lg p-3 shadow-xl text-xs space-y-2 w-44 font-sans pointer-events-auto animate-fade-in transition-colors">
          <div className="flex items-center justify-between pb-1 border-b border-[var(--planner-border-subtle)]">
            <p className="font-bold text-[var(--planner-text-primary)] uppercase tracking-wider text-[10px] font-mono">
              {t('map.networkLegend')}
            </p>
            <button
              type="button"
              onClick={() => setShowLegend(false)}
              className="text-[var(--planner-text-muted)] hover:text-[var(--planner-text-primary)] text-xs p-0.5"
            >
              ✕
            </button>
          </div>
          <div className="flex items-center gap-2 text-[var(--planner-text-secondary)] text-[11px]">
            <span className="w-2.5 h-2 rounded-sm bg-[#f4c430]" />
            <span>{t('lines.YELLOW')}</span>
          </div>
          <div className="flex items-center gap-2 text-[var(--planner-text-secondary)] text-[11px]">
            <span className="w-2.5 h-2 rounded-sm bg-[#2176ae]" />
            <span>{t('lines.BLUE')}</span>
          </div>
          <div className="flex items-center gap-2 text-[var(--planner-text-secondary)] text-[11px]">
            <span className="w-2.5 h-2 rounded-sm bg-[#7b2d8b]" />
            <span>{t('lines.VIOLET')}</span>
          </div>
          <div className="pt-1.5 border-t border-[var(--planner-border-subtle)] space-y-1 text-[10px] text-[var(--planner-text-muted)] font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full border border-white bg-purple-500" />
              <span>{t('map.interchange')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>{t('map.origin')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>{t('map.destination')}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
