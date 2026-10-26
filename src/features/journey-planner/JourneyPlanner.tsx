import { StationSearch } from '@/components/ui/StationSearch';
import { RouteCard } from '@/components/ui/RouteCard';
import { StationItinerary } from '@/components/ui/StationItinerary';
import { useJourneyStore } from '@/store/journeyStore';
import { metroGraph } from '@/core/graph/MetroGraph';
import { formatDuration } from '@/utils/formatters';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';

const POPULAR_HUBS = [
  'RAJIV_CHOWK',
  'KASHMERE_GATE',
  'CENTRAL_SECRETARIAT',
  'HAUZ_KHAS',
  'BOTANICAL_GARDEN',
];

export function JourneyPlanner() {
  const { t, i18n } = useTranslation();
  const source = useJourneyStore((s) => s.source);
  const destination = useJourneyStore((s) => s.destination);
  const setSource = useJourneyStore((s) => s.setSource);
  const setDestination = useJourneyStore((s) => s.setDestination);
  const swapStations = useJourneyStore((s) => s.swapStations);
  const routes = useJourneyStore((s) => s.routes);
  const activeRouteIndex = useJourneyStore((s) => s.activeRouteIndex);
  const setActiveRouteIndex = useJourneyStore((s) => s.setActiveRouteIndex);
  const isLoading = useJourneyStore((s) => s.isLoading);
  const error = useJourneyStore((s) => s.error);
  const calculateRoutes = useJourneyStore((s) => s.calculateRoutes);
  const resetJourney = useJourneyStore((s) => s.resetJourney);
  const setActiveView = useJourneyStore((s) => s.setActiveView);
  const activeView = useJourneyStore((s) => s.activeView);
  const accessiblePreference = useJourneyStore((s) => s.accessiblePreference);
  const setAccessiblePreference = useJourneyStore((s) => s.setAccessiblePreference);

  const activeRoute = routes[activeRouteIndex] ?? null;

  const handleHubClick = (stationId: string) => {
    const station = metroGraph.getStation(stationId);
    if (!station) return;
    if (!source) {
      setSource(station);
    } else if (!destination && source.id !== station.id) {
      setDestination(station);
    } else if (source.id === station.id) {
      // already source
    } else {
      setDestination(station);
    }
  };

  return (
    <div className="w-full space-y-5">
      {/* Passenger Journey Search Form */}
      <div className="rounded-2xl p-5 sm:p-6 bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-md">
        {/* Module Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="9" strokeWidth="2" />
                <path d="M12 7v5l3 3" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold font-display text-white tracking-tight">
                {t('planner.title')}
              </h2>
              <p className="text-[11px] text-gray-400 font-sans">
                {t('planner.selectPrompt')}
              </p>
            </div>
          </div>

          <span className="hidden sm:inline-flex text-[10px] font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded">
            DMRC 223 Stn
          </span>
        </div>

        <div className="space-y-3">
          {/* Origin Search Input */}
          <StationSearch
            label={t('planner.originLabel')}
            placeholder={t('planner.originPlaceholder')}
            value={source}
            onChange={setSource}
            excludeId={destination?.id}
            id="source-station"
          />

          {/* Tactical Station Swap Row */}
          <div className="flex items-center justify-between px-2 py-0.5">
            <div className="flex items-center gap-2 text-[11px] font-mono text-gray-400">
              <span className="w-4 h-px bg-slate-700" />
              <span>{t('planner.swapStations')}</span>
            </div>

            <button
              type="button"
              id="btn-swap-stations"
              aria-label={t('planner.swapAria')}
              className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 hover:border-cyan-500/50 text-gray-300 hover:text-cyan-300 text-xs font-mono transition-all duration-200 active:scale-95 shadow-sm"
              onClick={swapStations}
            >
              <svg className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-180 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
              </svg>
              <span className="hidden sm:inline">{t('planner.swapStations')}</span>
            </button>
          </div>

          {/* Destination Search Input */}
          <StationSearch
            label={t('planner.destinationLabel')}
            placeholder={t('planner.destinationPlaceholder')}
            value={destination}
            onChange={setDestination}
            excludeId={source?.id}
            id="destination-station"
          />

          {/* Popular Interchange Hubs Quick Picks */}
          <div className="pt-1">
            <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-mono text-gray-400 uppercase tracking-wider">
              <span>★</span>
              <span>{t('planner.popularHubs')}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {POPULAR_HUBS.map((id) => {
                const station = metroGraph.getStation(id);
                if (!station) return null;
                const isSelected = source?.id === id || destination?.id === id;
                const displayName = i18n.language === 'hi' && station.nameHindi ? station.nameHindi : station.name;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleHubClick(id)}
                    className={cn(
                      'text-[11px] font-sans px-2.5 py-1 rounded-lg border transition-all duration-150',
                      isSelected
                        ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/50 font-medium'
                        : 'bg-slate-800/60 hover:bg-slate-700/80 text-gray-300 border-slate-700/60 hover:border-slate-600'
                    )}
                  >
                    {displayName}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Accessibility Route Preference */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition-colors mt-2">
            <div className="flex items-center gap-2.5">
              <span className="text-base">♿</span>
              <div>
                <span className="text-xs font-semibold text-white block">{t('planner.stepFreeTitle')}</span>
                <span className="text-[10px] text-gray-400 font-mono block">{t('planner.stepFreeSubtitle')}</span>
              </div>
            </div>
            <button
              type="button"
              id="switch-accessible-preference"
              role="switch"
              aria-checked={accessiblePreference}
              onClick={() => setAccessiblePreference(!accessiblePreference)}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                accessiblePreference ? 'bg-cyan-500 shadow-sm' : 'bg-slate-700'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                  accessiblePreference ? 'translate-x-4' : 'translate-x-0'
                )}
              />
            </button>
          </div>

          {/* Validation Error Banner */}
          {error && (
            <div role="alert" className="flex items-start gap-3 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-xs sm:text-sm text-rose-300 animate-fade-in font-sans">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Primary Find Route CTA */}
          <button
            id="find-route-btn"
            type="button"
            className="w-full mt-2 py-3 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 active:from-blue-700 active:to-cyan-700 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-md transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={calculateRoutes}
            disabled={isLoading || !source || !destination}
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{t('planner.computing')}</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <span>{t('planner.calculateBtn')}</span>
              </>
            )}
          </button>

          {/* Reset Search Button */}
          {routes.length > 0 && (
            <button
              id="btn-reset-journey"
              type="button"
              className="w-full text-center text-xs font-mono text-gray-400 hover:text-white py-1.5 transition-colors"
              onClick={resetJourney}
            >
              {t('planner.resetBtn')}
            </button>
          )}
        </div>
      </div>

      {/* Route Results Section */}
      {routes.length > 0 && (
        <div className="space-y-4 animate-fade-in">
          {/* Header Bar: Alternatives Count & Visualizer Toggle */}
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-gray-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>
                {routes.length === 1
                  ? t('planner.optimalComputed')
                  : t('planner.alternativesComputed', { count: routes.length })}
              </span>
            </h3>

            <button
              type="button"
              onClick={() => setActiveView(activeView === 'visualizer' ? 'map' : 'visualizer')}
              className="text-xs text-cyan-300 hover:text-white flex items-center gap-1.5 font-mono font-medium bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 px-2.5 py-1 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>{activeView === 'visualizer' ? t('planner.viewInteractiveMap') : t('planner.visualizeAlgorithm')}</span>
            </button>
          </div>

          {/* Route Option Tabs for Easy Comparison */}
          {routes.length > 1 && (
            <div className="p-1 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-1.5 overflow-x-auto">
              <span className="text-[10px] font-mono uppercase text-gray-500 pl-2 shrink-0">
                {t('planner.routeOptions')}:
              </span>
              {routes.map((r, i) => (
                <button
                  key={`route-tab-${i}`}
                  type="button"
                  onClick={() => setActiveRouteIndex(i)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-mono shrink-0 transition-all flex items-center gap-1.5',
                    i === activeRouteIndex
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold shadow-sm'
                      : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                  )}
                >
                  <span>{r.label}</span>
                  <span className="text-[10px] opacity-75">({formatDuration(r.totalTimeSeconds)})</span>
                </button>
              ))}
            </div>
          )}

          {/* Route Comparison Cards */}
          <div className="space-y-3">
            {routes.map((route, i) => (
              <RouteCard
                key={`${route.label}-${i}`}
                route={route}
                isActive={i === activeRouteIndex}
                onClick={() => setActiveRouteIndex(i)}
                index={i}
              />
            ))}
          </div>

          {/* Expandable Station-by-Station Itinerary for Active Route */}
          {activeRoute && <StationItinerary route={activeRoute} />}
        </div>
      )}

      {/* Transit Network Disclaimer */}
      <p className="text-[11px] text-gray-500 text-center px-4 leading-relaxed font-mono">
        {t('planner.disclaimer')}
      </p>
    </div>
  );
}
