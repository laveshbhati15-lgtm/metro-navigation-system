import { StationSearch } from '@/components/ui/StationSearch';
import { RouteCard } from '@/components/ui/RouteCard';
import { StationItinerary } from '@/components/ui/StationItinerary';
import { useJourneyStore } from '@/store/journeyStore';
import { useTicketStore } from '@/features/tickets/ticketStore';
import { formatDuration, estimateFare } from '@/utils/formatters';

export function JourneyPlanner() {
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

  const openBookingModal = useTicketStore((s) => s.openBookingModal);

  const activeRoute = routes[activeRouteIndex] ?? null;

  return (
    <div className="w-full space-y-6">
      {/* Search form */}
      <div className="glass-card p-6 border border-white/[0.08] shadow-card">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold font-display text-white tracking-tight flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
            Plan Your Journey
          </h2>
          <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded">
            Dijkstra Engine
          </span>
        </div>

        <div className="space-y-4">
          {/* Source */}
          <StationSearch
            label="Origin (From)"
            placeholder="Search departure station…"
            value={source}
            onChange={setSource}
            excludeId={destination?.id}
            id="source-station"
          />

          {/* Swap button */}
          <div className="flex justify-center -my-1">
            <button
              type="button"
              id="btn-swap-stations"
              aria-label="Swap source and destination"
              className="group p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-gray-400 hover:text-cyan-300 transition-all duration-200"
              onClick={swapStations}
            >
              <svg className="w-4 h-4 transition-transform duration-300 group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* Destination */}
          <StationSearch
            label="Destination (To)"
            placeholder="Search arrival station…"
            value={destination}
            onChange={setDestination}
            excludeId={source?.id}
            id="destination-station"
          />

          {/* Accessibility Route Preference */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-cyan-500/30 transition-colors">
            <div className="flex items-center gap-2.5">
              <span className="text-base">♿</span>
              <div>
                <span className="text-xs font-semibold text-white block">Step-Free / Accessible Preference</span>
                <span className="text-[10px] text-gray-400 font-mono block">Highlights elevators, ramps & wide smart gates</span>
              </div>
            </div>
            <button
              type="button"
              id="switch-accessible-preference"
              role="switch"
              aria-checked={accessiblePreference}
              onClick={() => setAccessiblePreference(!accessiblePreference)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                accessiblePreference ? 'bg-cyan-500 shadow-glow-cyan/50' : 'bg-white/20'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  accessiblePreference ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Error */}
          {error && (
            <div role="alert" className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 animate-fade-in">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {/* Search button */}
          <button
            id="find-route-btn"
            type="button"
            className="btn-primary w-full flex items-center justify-center gap-2 font-semibold shadow-glow-cyan/20"
            onClick={calculateRoutes}
            disabled={isLoading || !source || !destination}
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Computing Shortest Path…</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <span>Calculate Optimal Route</span>
              </>
            )}
          </button>

          {routes.length > 0 && (
            <button
              id="btn-reset-journey"
              type="button"
              className="btn-ghost w-full text-xs font-mono text-gray-400 hover:text-white"
              onClick={resetJourney}
            >
              Reset Search & Clear Route
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {routes.length > 0 && (
        <div className="space-y-4 animate-fade-in">
          {/* Active Route HUD Summary */}
          {activeRoute && (
            <div className="glass-card p-4 border border-cyan-500/25 bg-navy-900/90 shadow-glow-cyan/10">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-xs font-mono font-semibold text-cyan-300 uppercase tracking-wider">
                    Selected Trajectory
                  </span>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  {activeRoute.label}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-navy-800/80 p-2 rounded-lg border border-white/[0.05]">
                  <span className="text-[10px] text-gray-400 font-mono block">Travel Time</span>
                  <span className="text-xs sm:text-sm font-bold font-display text-white block mt-0.5">
                    {formatDuration(activeRoute.totalTimeSeconds)}{' '}
                    <span className="text-[9px] text-gray-400 font-normal font-sans">(est.)</span>
                  </span>
                </div>
                <div className="bg-navy-800/80 p-2 rounded-lg border border-white/[0.05]">
                  <span className="text-[10px] text-gray-400 font-mono block">Stations</span>
                  <span className="text-xs sm:text-sm font-bold font-display text-white block mt-0.5">
                    {activeRoute.totalStations}
                  </span>
                </div>
                <div className="bg-navy-800/80 p-2 rounded-lg border border-white/[0.05]">
                  <span className="text-[10px] text-gray-400 font-mono block">Transfers</span>
                  <span className="text-xs sm:text-sm font-bold font-display text-amber-300 block mt-0.5">
                    {activeRoute.interchangeCount}
                  </span>
                </div>
                <div className="bg-navy-800/80 p-2 rounded-lg border border-white/[0.05]">
                  <span className="text-[10px] text-gray-400 font-mono block">Est. Fare</span>
                  <span className="text-xs sm:text-sm font-bold font-display text-emerald-400 block mt-0.5">
                    ₹{estimateFare(activeRoute.totalStations).amount}{' '}
                    <span className="text-[9px] text-gray-400 font-normal font-sans">(est.)</span>
                  </span>
                </div>
              </div>

              {accessiblePreference && (
                <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-emerald-300">
                  <div className="flex items-center gap-1.5">
                    <span>♿</span>
                    <span className="font-semibold">Step-Free Accessible Guidance Active</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400/80">
                    Step-Free Guidance (Simulated Layouts)
                  </span>
                </div>
              )}

              {/* Book Demo Ticket CTA */}
              <div className="mt-3.5 pt-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  id="btn-book-ticket"
                  onClick={() => openBookingModal({ source, destination, route: activeRoute })}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 hover:from-emerald-500 hover:to-cyan-400 text-white font-bold text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 shadow-glow-cyan/20 transition-all hover:scale-[1.01]"
                >
                  <span>🎟️</span>
                  <span>Book Demo Ticket (₹{estimateFare(activeRoute.totalStations).amount})</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-wider">
              {routes.length === 1
                ? 'Optimal Route Computed'
                : `${routes.length} Route Alternatives Computed`}
            </h3>
            <button
              type="button"
              onClick={() => setActiveView(activeView === 'visualizer' ? 'map' : 'visualizer')}
              className="text-xs text-cyan-300 hover:text-white flex items-center gap-1.5 font-mono font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-2.5 py-1 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {activeView === 'visualizer' ? 'View Interactive Map' : 'Visualize Algorithm Steps'}
            </button>
          </div>

          {routes.map((route, i) => (
            <RouteCard
              key={`${route.label}-${i}`}
              route={route}
              isActive={i === activeRouteIndex}
              onClick={() => setActiveRouteIndex(i)}
              index={i}
            />
          ))}

          {/* Expandable Station-by-Station Itinerary */}
          {activeRoute && <StationItinerary route={activeRoute} />}
        </div>
      )}

      {/* Network disclaimer */}
      <p className="text-[11px] text-gray-500 text-center px-4 leading-relaxed font-mono">
        Delhi Metro Network (223 Stations • 7 Lines) · Travel times & fares are algorithmic estimates (~2 min/station) · Demo booking simulation not valid for AFC transit entry
      </p>
    </div>
  );
}
