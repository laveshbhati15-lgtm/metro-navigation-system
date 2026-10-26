import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { JourneyPlanner } from '@/features/journey-planner/JourneyPlanner';
import { MetroMap } from '@/features/map/MetroMap';
import { AlgorithmVisualizer } from '@/features/visualizer/AlgorithmVisualizer';
import { IndoorNavigationModal } from '@/features/indoor/IndoorNavigationModal';
import { BookingModal } from '@/features/tickets/BookingModal';
import { TicketHistoryModal } from '@/features/tickets/TicketHistoryModal';
import { useJourneyStore } from '@/store/journeyStore';
import { useTicketStore } from '@/features/tickets/ticketStore';
import { metroGraph } from '@/core/graph/MetroGraph';
import { AuthNavControl } from '@/components/auth/AuthNavControl';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { cn } from '@/utils/cn';

export function PlannerPage() {
  const { t } = useTranslation();

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

  // Mobile active tab view toggle
  const [mobileTab, setMobileTab] = useState<'planner' | 'map'>('planner');

  return (
    <div className="min-h-screen bg-[#070b14] text-gray-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Indoor & Accessibility Wayfinding Modal */}
      <IndoorNavigationModal
        station={indoorStation}
        isOpen={!!indoorStation}
        onClose={() => setIndoorStation(null)}
      />

      {/* Demo Ticket Booking & History Modals */}
      <BookingModal />
      <TicketHistoryModal />

      {/* Professional Application Header */}
      <header className="border-b border-slate-800/80 bg-[#070b14]/95 backdrop-blur-md sticky top-0 z-[1000] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Product Brand Identity */}
          <Link to="/" className="flex items-center gap-3 group" aria-label={t('nav.brand')}>
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform duration-200">
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
                {t('nav.brand')}
              </p>
              <p className="text-[10px] text-cyan-400 font-mono leading-tight">
                {t('nav.suiteTitle')}
              </p>
            </div>
          </Link>

          {/* Navigation Items & Account Controls */}
          <div className="flex items-center gap-2 sm:gap-4">
            <nav className="flex items-center gap-1 sm:gap-2 text-xs font-mono">
              <Link
                to="/"
                className="text-gray-400 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/5"
              >
                {t('nav.backToHome')}
              </Link>

              <span className="text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1.5 rounded-lg font-semibold">
                {t('nav.planner')}
              </span>

              <button
                type="button"
                id="btn-nav-demo-tickets"
                onClick={openHistoryModal}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-gray-300 hover:text-white transition-colors"
              >
                <span>🎟️</span>
                <span className="hidden sm:inline">{t('nav.demoTickets')}</span>
                {tickets.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-cyan-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                    {tickets.length}
                  </span>
                )}
              </button>
            </nav>

            <LanguageSwitcher />
            <AuthNavControl />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-7 flex-grow w-full">
        {/* Mobile View Toggle Switcher (Visible on small screens) */}
        <div className="lg:hidden flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800 mb-4">
          <button
            type="button"
            onClick={() => setMobileTab('planner')}
            className={cn(
              'flex-1 py-2 text-xs font-mono font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5',
              mobileTab === 'planner'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-gray-400 hover:text-white'
            )}
          >
            <span>📍</span>
            <span>{t('nav.planner')}</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('map')}
            className={cn(
              'flex-1 py-2 text-xs font-mono font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5',
              mobileTab === 'map'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-gray-400 hover:text-white'
            )}
          >
            <span>🗺️</span>
            <span>{t('planner.mapView')}</span>
          </button>
        </div>

        {/* Responsive Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Left Column: Journey Planner & Route Cards */}
          <aside className={cn(
            'lg:col-span-5',
            mobileTab === 'map' ? 'hidden lg:block' : 'block'
          )}>
            <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-2 space-y-4">
              <JourneyPlanner />
            </div>
          </aside>

          {/* Right Column: Interactive Metro Map & Passenger Information */}
          <div className={cn(
            'lg:col-span-7 space-y-4',
            mobileTab === 'planner' ? 'hidden lg:block' : 'block'
          )}>
            {/* Map / Visualizer Mode Switcher Toolbar */}
            <div className="flex items-center justify-between bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 shadow-sm backdrop-blur-md">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  id="tab-interactive-map"
                  onClick={() => setActiveView('map')}
                  className={cn(
                    'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all',
                    activeView === 'map'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  <svg className="w-4 h-4 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  <span>{t('planner.viewInteractiveMap')}</span>
                </button>

                <button
                  type="button"
                  id="tab-algorithm-visualizer"
                  onClick={() => setActiveView('visualizer')}
                  className={cn(
                    'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all',
                    activeView === 'visualizer'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  <svg className="w-4 h-4 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>{t('planner.visualizeAlgorithm')}</span>
                  {routes.length > 0 && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </button>
              </div>

              <div className="hidden sm:flex items-center gap-2 pr-2 text-[11px] font-mono text-gray-400">
                <span>223 {t('planner.stations')} • 7 {t('common.stations').includes('स्टेशन') ? 'लाइनें' : 'Lines'}</span>
              </div>
            </div>

            {/* View Container */}
            {activeView === 'map' ? (
              <MetroMap />
            ) : (
              <AlgorithmVisualizer />
            )}

            {/* DMRC Passenger Information & Advisories Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <PassengerAdvisoryCard
                icon="⏱️"
                title={t('planner.operatingHours')}
                value={t('planner.operatingHoursValue')}
                hint="DMRC Network"
              />
              <PassengerAdvisoryCard
                icon="💳"
                title={t('planner.smartCardDiscount')}
                value={t('planner.smartCardDiscountValue')}
                hint="Smart Card / QR"
              />
              <PassengerAdvisoryCard
                icon="📞"
                title={t('planner.helpline')}
                value={t('planner.helplineValue')}
                hint="24x7 Support"
              />
              <PassengerAdvisoryCard
                icon="🧳"
                title={t('planner.luggageRule')}
                value={t('planner.luggageRuleValue')}
                hint="Per Passenger"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function PassengerAdvisoryCard({
  icon,
  title,
  value,
  hint,
}: {
  icon: string;
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800/80 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm">{icon}</span>
        <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider truncate">
          {title}
        </span>
      </div>
      <p className="text-xs sm:text-sm font-semibold text-white font-sans truncate">
        {value}
      </p>
      <p className="text-[10px] text-cyan-400/80 font-mono mt-0.5 truncate">
        {hint}
      </p>
    </div>
  );
}
