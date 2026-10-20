import { JourneyPlanner } from '@/features/journey-planner/JourneyPlanner';
import { MetroMap } from '@/features/map/MetroMap';
import { AlgorithmVisualizer } from '@/features/visualizer/AlgorithmVisualizer';
import { IndoorNavigationModal } from '@/features/indoor/IndoorNavigationModal';
import { BookingModal } from '@/features/tickets/BookingModal';
import { TicketHistoryModal } from '@/features/tickets/TicketHistoryModal';
import { useJourneyStore } from '@/store/journeyStore';
import { useTicketStore } from '@/features/tickets/ticketStore';
import { metroGraph } from '@/core/graph/MetroGraph';
import { Link } from 'react-router-dom';

import { useEffect } from 'react';

export function PlannerPage() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as { useJourneyStore: typeof useJourneyStore; metroGraph: typeof metroGraph }).useJourneyStore = useJourneyStore;
      (window as unknown as { useJourneyStore: typeof useJourneyStore; metroGraph: typeof metroGraph }).metroGraph = metroGraph;
    }
  }, []);
  const activeView = useJourneyStore((s) => s.activeView);
  const setActiveView = useJourneyStore((s) => s.setActiveView);
  const routes = useJourneyStore((s) => s.routes);
  const indoorStation = useJourneyStore((s) => s.indoorStation);
  const setIndoorStation = useJourneyStore((s) => s.setIndoorStation);

  const tickets = useTicketStore((s) => s.tickets);
  const openHistoryModal = useTicketStore((s) => s.openHistoryModal);

  return (
    <div className="min-h-screen bg-navy-950 text-gray-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Indoor & Accessibility Wayfinding Modal */}
      <IndoorNavigationModal
        station={indoorStation}
        isOpen={!!indoorStation}
        onClose={() => setIndoorStation(null)}
      />

      {/* Demo Ticket Booking & History Modals */}
      <BookingModal />
      <TicketHistoryModal />

      {/* Header */}
      <header className="border-b border-white/[0.08] bg-navy-950/95 backdrop-blur-md sticky top-0 z-[1000] shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group" aria-label="Delhi Metro Navigator Home">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-glow-cyan/40 group-hover:scale-105 transition-transform duration-200">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="6" width="18" height="12" rx="3" strokeWidth="2" />
                <path d="M7 6V4a2 2 0 012-2h6a2 2 0 012 2v2" strokeWidth="2" />
                <circle cx="8" cy="18" r="1.5" fill="currentColor" />
                <circle cx="16" cy="18" r="1.5" fill="currentColor" />
                <line x1="7" y1="10" x2="17" y2="10" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-extrabold text-white leading-tight font-display tracking-tight">
                Delhi Metro
              </p>
              <p className="text-[11px] text-cyan-400/90 leading-tight font-mono">
                Journey Intelligence Suite
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Graph Engine Ready
            </div>
            <nav className="flex items-center gap-2 text-xs font-mono">
              <Link to="/" className="text-gray-400 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/5">
                ← Home
              </Link>
              <span className="text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-3 py-1.5 rounded-lg font-semibold">
                Planner
              </span>
              <button
                type="button"
                id="btn-nav-demo-tickets"
                onClick={openHistoryModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-gray-300 hover:text-white transition-colors"
              >
                <span>🎟️</span>
                <span>Demo Tickets</span>
                {tickets.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-cyan-500 text-navy-950 font-bold text-[10px] flex items-center justify-center">
                    {tickets.length}
                  </span>
                )}
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-grow w-full">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8 items-start">
          {/* Journey Planner sidebar with scrollable containment */}
          <aside className="lg:col-span-2">
            <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-2 space-y-4">
              <JourneyPlanner />
            </div>
          </aside>

          {/* Interactive Map / Algorithm Visualizer panel */}
          <div className="lg:col-span-3 space-y-4">
            {/* View Mode Switcher Tab Bar */}
            <div className="flex items-center justify-between bg-navy-900/90 p-1.5 rounded-2xl border border-white/[0.08] backdrop-blur-md shadow-card">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  id="tab-interactive-map"
                  onClick={() => setActiveView('map')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeView === 'map'
                      ? 'bg-blue-600 text-white shadow-glow-blue'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <svg className="w-4 h-4 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  Interactive Map
                </button>

                <button
                  type="button"
                  id="tab-algorithm-visualizer"
                  onClick={() => setActiveView('visualizer')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeView === 'visualizer'
                      ? 'bg-blue-600 text-white shadow-glow-blue'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <svg className="w-4 h-4 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Dijkstra Visualizer
                  {routes.length > 0 && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </button>
              </div>

              <div className="hidden sm:flex items-center gap-2 pr-2 text-[11px] font-mono text-gray-400">
                <span>223 Stations • 7 Lines</span>
              </div>
            </div>

            {/* View Container */}
            {activeView === 'map' ? (
              <MetroMap />
            ) : (
              <AlgorithmVisualizer />
            )}

            {/* Network Statistics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <NetworkStat value="223" label="Stations" sublabel="Verified coordinates" accent="cyan" />
              <NetworkStat value="7" label="Lines" sublabel="Red, Yellow, Blue, Green..." accent="yellow" />
              <NetworkStat value="O((V+E)logV)" label="Dijkstra Engine" sublabel="MinHeap priority queue" accent="blue" />
              <NetworkStat value="3" label="Route Options" sublabel="Fastest • Stops • Changes" accent="purple" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function NetworkStat({
  value,
  label,
  sublabel,
  accent = 'cyan',
}: {
  value: string;
  label: string;
  sublabel: string;
  accent?: 'cyan' | 'yellow' | 'blue' | 'purple';
}) {
  const textColors = {
    cyan: 'text-cyan-300',
    yellow: 'text-yellow-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
  };

  return (
    <div className="bg-navy-900/60 rounded-xl p-3.5 text-center border border-white/[0.08] backdrop-blur-sm">
      <p className={`text-base sm:text-lg font-bold font-display ${textColors[accent]}`}>{value}</p>
      <p className="text-xs font-semibold text-white mt-0.5">{label}</p>
      <p className="text-[10px] text-gray-500 mt-0.5 font-mono">{sublabel}</p>
    </div>
  );
}
