import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { JourneyPlanner } from '@/features/journey-planner/JourneyPlanner';
import { MetroMap } from '@/features/map/MetroMap';
import { AlgorithmVisualizer } from '@/features/visualizer/AlgorithmVisualizer';
import { IndoorNavigationModal } from '@/features/indoor/IndoorNavigationModal';
import { TicketHistoryModal } from '@/features/tickets/TicketHistoryModal';
import { useJourneyStore } from '@/store/journeyStore';
import { useTicketStore } from '@/features/tickets/ticketStore';
import { metroGraph } from '@/core/graph/MetroGraph';
import { AuthNavControl } from '@/components/auth/AuthNavControl';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { PlannerThemeProvider, usePlannerTheme } from '@/context/PlannerThemeContext';
import { PlannerThemeSwitcher } from '@/components/ui/PlannerThemeSwitcher';
import { cn } from '@/utils/cn';
import './planner-theme.css';

export function PlannerPage() {
  return (
    <PlannerThemeProvider>
      <PlannerPageContent />
    </PlannerThemeProvider>
  );
}

function PlannerPageContent() {
  const { t } = useTranslation();
  const { theme } = usePlannerTheme();

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
    <div
      data-planner-theme={theme}
      className="min-h-screen flex flex-col transition-colors duration-200"
      style={{
        backgroundColor: 'var(--planner-bg)',
        color: 'var(--planner-text-primary)',
      }}
    >
      {/* Indoor & Accessibility Wayfinding Modal */}
      <IndoorNavigationModal
        station={indoorStation}
        isOpen={!!indoorStation}
        onClose={() => setIndoorStation(null)}
      />

      {/* Demo Ticket History Modal */}
      <TicketHistoryModal />

      {/* Professional Application Header */}
      <header
        className="border-b sticky top-0 z-[1000] shadow-xs backdrop-blur-md transition-colors"
        style={{
          backgroundColor: 'var(--planner-header-bg)',
          borderColor: 'var(--planner-header-border)',
        }}
      >
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Product Brand Identity */}
          <Link to="/" className="flex items-center gap-2.5 group" aria-label={t('nav.brand')}>
            <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-white shadow-xs group-hover:bg-blue-500 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="6" width="18" height="12" rx="2" strokeWidth="2" />
                <path d="M7 6V4a2 2 0 012-2h6a2 2 0 012 2v2" strokeWidth="2" />
                <circle cx="8" cy="18" r="1.5" fill="currentColor" />
                <circle cx="16" cy="18" r="1.5" fill="currentColor" />
                <line x1="7" y1="10" x2="17" y2="10" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold leading-tight font-sans tracking-tight text-[var(--planner-text-primary)]">
                {t('nav.brand')}
              </p>
              <p className="text-[10px] text-[var(--planner-text-secondary)] font-mono leading-none tracking-wider uppercase">
                {t('nav.suiteTitle')}
              </p>
            </div>
          </Link>

          {/* Navigation Items & Account Controls */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <nav className="flex items-center gap-1 sm:gap-1.5 text-xs font-mono">
              <Link
                to="/"
                className="hidden sm:inline-block text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)] transition-colors px-2.5 py-1.5 rounded-md hover:bg-[var(--planner-surface-hover)]"
              >
                {t('nav.backToHome')}
              </Link>

              <span className="hidden md:inline-block text-[var(--planner-accent-text)] bg-[var(--planner-accent-subtle)] border border-[var(--planner-border-highlight)] px-2.5 py-1.5 rounded-md font-medium">
                {t('nav.planner')}
              </span>

              <button
                type="button"
                id="btn-nav-demo-tickets"
                onClick={openHistoryModal}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[var(--planner-surface)] hover:bg-[var(--planner-surface-hover)] border border-[var(--planner-border)] hover:border-[var(--planner-border-highlight)] text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)] transition-colors shadow-xs shrink-0"
              >
                <span className="text-xs">🎟️</span>
                <span className="hidden sm:inline font-sans font-medium">{t('nav.demoTickets')}</span>
                {tickets.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-500 border border-blue-500/30 text-[10px] font-mono font-semibold">
                    {tickets.length}
                  </span>
                )}
              </button>
            </nav>

            <div className="h-4 w-px bg-[var(--planner-border)] shrink-0" aria-hidden="true" />

            {/* Exclusive Planner Theme Switcher */}
            <PlannerThemeSwitcher />

            <LanguageSwitcher className="shrink-0" />
            <div className="shrink-0">
              <AuthNavControl />
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 sm:py-6 flex-grow w-full">
        {/* Mobile View Toggle Switcher (Visible on small screens) */}
        <div className="lg:hidden flex items-center p-1 rounded-lg bg-[var(--planner-surface)] border border-[var(--planner-border)] mb-4 shadow-xs">
          <button
            type="button"
            onClick={() => setMobileTab('planner')}
            className={cn(
              'flex-1 py-1.5 text-xs font-mono font-medium rounded-md transition-all flex items-center justify-center gap-1.5',
              mobileTab === 'planner'
                ? 'bg-[var(--planner-tab-active-bg)] text-[var(--planner-tab-active-text)] border border-[var(--planner-border)] shadow-xs font-semibold'
                : 'text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)]'
            )}
          >
            <span>📍</span>
            <span>{t('nav.planner')}</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('map')}
            className={cn(
              'flex-1 py-1.5 text-xs font-mono font-medium rounded-md transition-all flex items-center justify-center gap-1.5',
              mobileTab === 'map'
                ? 'bg-[var(--planner-tab-active-bg)] text-[var(--planner-tab-active-text)] border border-[var(--planner-border)] shadow-xs font-semibold'
                : 'text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)]'
            )}
          >
            <span>🗺️</span>
            <span>{t('planner.mapView')}</span>
          </button>
        </div>

        {/* Responsive Grid: Sidebar + Dominant Map Canvas */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
          {/* Left Column: Journey Planner & Route Cards */}
          <aside className={cn(
            'lg:col-span-4 xl:col-span-4',
            mobileTab === 'map' ? 'hidden lg:block' : 'block'
          )}>
            <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1 space-y-4">
              <JourneyPlanner />
            </div>
          </aside>

          {/* Right Column: Interactive Metro Map & Passenger Information */}
          <div className={cn(
            'lg:col-span-8 xl:col-span-8 space-y-3.5',
            mobileTab === 'planner' ? 'hidden lg:block' : 'block'
          )}>
            {/* Map / Visualizer Mode Switcher Toolbar */}
            <div
              className="flex items-center justify-between p-1 rounded-lg border shadow-xs transition-colors"
              style={{
                backgroundColor: 'var(--planner-hud-bg)',
                borderColor: 'var(--planner-border)',
              }}
            >
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  id="tab-interactive-map"
                  onClick={() => setActiveView('map')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                    activeView === 'map'
                      ? 'bg-[var(--planner-tab-active-bg)] text-[var(--planner-tab-active-text)] border border-[var(--planner-border)] shadow-xs'
                      : 'text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)] hover:bg-[var(--planner-surface-hover)]'
                  )}
                >
                  <svg className="w-3.5 h-3.5 text-[var(--planner-accent-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  <span>{t('planner.viewInteractiveMap')}</span>
                </button>

                <button
                  type="button"
                  id="tab-algorithm-visualizer"
                  onClick={() => setActiveView('visualizer')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                    activeView === 'visualizer'
                      ? 'bg-[var(--planner-tab-active-bg)] text-[var(--planner-tab-active-text)] border border-[var(--planner-border)] shadow-xs'
                      : 'text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)] hover:bg-[var(--planner-surface-hover)]'
                  )}
                >
                  <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>{t('planner.visualizeAlgorithm')}</span>
                  {routes.length > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  )}
                </button>
              </div>

              <div className="hidden sm:flex items-center gap-2 pr-2.5 text-[11px] font-mono text-[var(--planner-text-secondary)]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                <span>223 {t('planner.stations')} • 7 {t('common.stations').includes('स्टेशन') ? 'लाइनें' : 'Lines'}</span>
              </div>
            </div>

            {/* View Container */}
            {activeView === 'map' ? (
              <MetroMap />
            ) : (
              <AlgorithmVisualizer />
            )}

            {/* DMRC Passenger Information & Operational Advisories Strip */}
            <div
              className="border rounded-lg divide-y sm:divide-y-0 sm:divide-x grid grid-cols-2 sm:grid-cols-4 overflow-hidden transition-colors shadow-xs"
              style={{
                backgroundColor: 'var(--planner-advisory-bg)',
                borderColor: 'var(--planner-border)',
              }}
            >
              <PassengerAdvisoryItem
                icon="⏱️"
                title={t('planner.operatingHours')}
                value={t('planner.operatingHoursValue')}
                hint="DMRC Network"
              />
              <PassengerAdvisoryItem
                icon="💳"
                title={t('planner.smartCardDiscount')}
                value={t('planner.smartCardDiscountValue')}
                hint="Smart Card / QR"
              />
              <PassengerAdvisoryItem
                icon="📞"
                title={t('planner.helpline')}
                value={t('planner.helplineValue')}
                hint="24x7 Support"
              />
              <PassengerAdvisoryItem
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

function PassengerAdvisoryItem({
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
    <div className="p-3 bg-transparent border-[var(--planner-border-subtle)]">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs">{icon}</span>
        <span className="text-[10px] font-mono text-[var(--planner-text-muted)] uppercase tracking-wider truncate">
          {title}
        </span>
      </div>
      <p className="text-xs sm:text-sm font-semibold text-[var(--planner-text-primary)] font-sans truncate">
        {value}
      </p>
      <p className="text-[10px] text-[var(--planner-text-secondary)] font-mono mt-0.5 truncate">
        {hint}
      </p>
    </div>
  );
}
