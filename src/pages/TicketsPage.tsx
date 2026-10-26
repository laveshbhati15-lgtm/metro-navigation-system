import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthNavControl } from '@/components/auth/AuthNavControl';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useTicketStore } from '@/features/tickets/ticketStore';
import { DemoTicketCard } from '@/features/tickets/DemoTicketCard';
import { BookingModal } from '@/features/tickets/BookingModal';
import type { DemoTicket } from '@/features/tickets/types';
import { formatDuration } from '@/utils/formatters';
import { LINE_COLORS } from '@/utils/lineColors';
import { getStationDisplayName } from '@/i18n';

export function TicketsPage() {
  const { t, i18n } = useTranslation();
  const tickets = useTicketStore((s) => s.tickets);
  const cancelDemoTicket = useTicketStore((s) => s.cancelDemoTicket);
  const clearHistory = useTicketStore((s) => s.clearHistory);
  const openBookingModal = useTicketStore((s) => s.openBookingModal);

  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'CANCELLED'>('ALL');
  const [selectedTicket, setSelectedTicket] = useState<DemoTicket | null>(null);
  const [showFirebaseInfo, setShowFirebaseInfo] = useState<boolean>(false);

  const filteredTickets = tickets.filter((tkt) => {
    if (filter === 'ALL') return true;
    return tkt.status === filter;
  });

  return (
    <div className="min-h-screen bg-navy-950 text-gray-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Booking Modal */}
      <BookingModal />

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
                {t('nav.brand')}
              </p>
              <p className="text-[11px] text-cyan-400/90 leading-tight font-mono">
                {t('tickets.vaultTitle')}
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-2 text-xs font-mono">
              <Link
                to="/"
                className="text-gray-400 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/5"
              >
                {t('nav.home')}
              </Link>
              <Link
                to="/planner"
                className="text-gray-400 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/5"
              >
                {t('nav.planner')}
              </Link>
              <span className="text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-3 py-1.5 rounded-lg font-semibold">
                {t('nav.demoTickets')} ({tickets.length})
              </span>
            </nav>
            <LanguageSwitcher />
            <AuthNavControl />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex-grow w-full space-y-6">
        {/* Banner Alert */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div className="text-xs space-y-1">
            <p className="font-bold text-amber-200 uppercase tracking-wider">
              {t('tickets.afcNotice')}
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-navy-900/60 p-4 rounded-2xl border border-white/[0.08] backdrop-blur-sm">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 font-mono text-xs">
            {(['ALL', 'ACTIVE', 'CANCELLED'] as const).map((mode) => {
              const label =
                mode === 'ALL'
                  ? `${t('tickets.filterAll')} (${tickets.length})`
                  : mode === 'ACTIVE'
                    ? t('tickets.filterActive')
                    : t('tickets.filterCancelled');
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFilter(mode)}
                  className={`py-1.5 px-3 rounded-xl transition-all ${
                    filter === mode
                      ? 'bg-blue-600 text-white font-bold shadow-glow-blue'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
            <button
              type="button"
              onClick={() => setShowFirebaseInfo(!showFirebaseInfo)}
              className="text-xs font-mono text-cyan-300 hover:text-cyan-200 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20"
            >
              <span>⚙️</span>
              <span>{showFirebaseInfo ? 'Hide Auth Config' : 'Cloud Sync Info'}</span>
            </button>

            <button
              type="button"
              onClick={() => openBookingModal()}
              className="btn-primary py-2 px-4 rounded-xl text-xs font-bold font-mono flex items-center gap-1.5"
            >
              <span>+</span>
              <span>{t('tickets.bookNewTicket')}</span>
            </button>
          </div>
        </div>

        {/* Firebase Authentication Configuration Guide */}
        {showFirebaseInfo && (
          <div className="glass-card p-6 border border-cyan-500/30 bg-navy-900/90 rounded-2xl space-y-4 animate-fade-in text-xs font-mono">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <span>🔥</span>
                <span>{t('auth.firebaseRequired')}</span>
              </h4>
              <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                Setup Instructions
              </span>
            </div>

            <p className="text-gray-300 leading-relaxed">
              {t('auth.firebaseRequiredDesc')}
            </p>

            <div className="bg-navy-950/80 p-4 rounded-xl border border-white/[0.06] space-y-2 text-gray-300">
              <p className="font-bold text-white">To enable Cloud Account Sync with Firebase Auth:</p>
              <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-gray-400">
                <li>Install the Firebase SDK: <code className="text-cyan-300">npm install firebase</code></li>
                <li>Create a Firebase Project at <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline">console.firebase.google.com</a> and enable <strong>Authentication</strong> and <strong>Cloud Firestore</strong>.</li>
                <li>Add your credentials to environment variables in <code className="text-cyan-300">.env.local</code>.</li>
              </ol>
            </div>
          </div>
        )}

        {/* Selected Ticket Preview Modal */}
        {selectedTicket && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-md overflow-y-auto animate-fade-in">
            <div className="relative w-full max-w-md my-8">
              <DemoTicketCard
                ticket={selectedTicket}
                onCancel={(id) => {
                  cancelDemoTicket(id);
                  setSelectedTicket((prev) => (prev ? { ...prev, status: 'CANCELLED' } : null));
                }}
                onClose={() => setSelectedTicket(null)}
              />
            </div>
          </div>
        )}

        {/* Tickets Grid */}
        {filteredTickets.length === 0 ? (
          <div className="text-center py-16 glass-card p-8 rounded-3xl border border-white/[0.08] space-y-4">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-3xl">
              🎟️
            </div>
            <div>
              <p className="text-base font-bold text-white">{t('tickets.noTicketsTitle')}</p>
              <p className="text-xs text-gray-400 mt-1 font-mono">
                {t('tickets.noTicketsDesc')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openBookingModal()}
              className="btn-primary py-2.5 px-6 rounded-xl text-xs font-bold"
            >
              + {t('tickets.bookNewTicket')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTickets.map((tkt) => (
              <div
                key={tkt.id}
                onClick={() => setSelectedTicket(tkt)}
                className="glass-card p-5 rounded-2xl border border-white/[0.08] hover:border-cyan-500/40 bg-navy-900/80 hover:bg-navy-900 transition-all cursor-pointer group space-y-3 relative overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-cyan-300">
                    {tkt.id}
                  </span>
                  <span
                    className={`text-[9px] font-mono px-2 py-0.5 rounded-full uppercase font-bold border ${
                      tkt.status === 'CANCELLED'
                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}
                  >
                    {tkt.status === 'CANCELLED' ? t('tickets.cancelledNotice') : t('tickets.activeNotice')}
                  </span>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-base font-bold text-white">
                    <span>{getStationDisplayName(tkt.source, i18n.language)}</span>
                    <span className="text-cyan-400 text-sm">→</span>
                    <span>{getStationDisplayName(tkt.destination, i18n.language)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {tkt.routeSummary.lines.map((l) => (
                      <span
                        key={l}
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: LINE_COLORS[l] }}
                      />
                    ))}
                    <span className="text-[10px] text-gray-400 font-mono ml-1">
                      {t('tickets.stationStops', { count: tkt.routeSummary.totalStations - 1 })} • {formatDuration(tkt.routeSummary.totalTimeSeconds)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs font-mono">
                  <span className="text-gray-400">
                    {tkt.ticketType === 'RETURN' ? t('booking.returnOption') : t('booking.singleOption')} • {t('tickets.passengers', { count: tkt.passengerCount })}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-emerald-400 font-display text-sm">
                      ₹{tkt.totalFare}
                    </span>
                    <span className="text-cyan-400 group-hover:translate-x-1 transition-transform">
                      {t('tickets.viewDetails')} →
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tickets.length > 0 && (
          <div className="text-center pt-4">
            <button
              type="button"
              onClick={clearHistory}
              className="text-xs font-mono text-gray-500 hover:text-red-400 transition-colors"
            >
              {t('tickets.clearHistory')}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
