import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTicketStore } from '@/features/tickets/ticketStore';
import { DemoTicketCard } from '@/features/tickets/DemoTicketCard';
import { BookingModal } from '@/features/tickets/BookingModal';
import type { DemoTicket } from '@/features/tickets/types';
import { formatDuration } from '@/utils/formatters';
import { LINE_COLORS } from '@/utils/lineColors';

export function TicketsPage() {
  const tickets = useTicketStore((s) => s.tickets);
  const cancelDemoTicket = useTicketStore((s) => s.cancelDemoTicket);
  const clearHistory = useTicketStore((s) => s.clearHistory);
  const openBookingModal = useTicketStore((s) => s.openBookingModal);

  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'CANCELLED'>('ALL');
  const [selectedTicket, setSelectedTicket] = useState<DemoTicket | null>(null);
  const [showFirebaseInfo, setShowFirebaseInfo] = useState<boolean>(false);

  const filteredTickets = tickets.filter((t) => {
    if (filter === 'ALL') return true;
    return t.status === filter;
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
                Delhi Metro
              </p>
              <p className="text-[11px] text-cyan-400/90 leading-tight font-mono">
                Demo Ticket Vault
              </p>
            </div>
          </Link>

          <nav className="flex items-center gap-2 text-xs font-mono">
            <Link
              to="/"
              className="text-gray-400 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/5"
            >
              Home
            </Link>
            <Link
              to="/planner"
              className="text-gray-400 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/5"
            >
              Planner
            </Link>
            <span className="text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-3 py-1.5 rounded-lg font-semibold">
              Demo Tickets ({tickets.length})
            </span>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex-grow w-full space-y-6">
        {/* Banner Alert */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div className="text-xs space-y-1">
            <p className="font-bold text-amber-200 uppercase tracking-wider">
              DEMO TICKET SIMULATION — NOT VALID FOR METRO ENTRY
            </p>
            <p className="text-amber-300/80 leading-relaxed font-mono text-[11px]">
              Every ticket generated here is a proof-of-concept e-token for user experience demonstration. It does not deduct real currency, is not issued by DMRC, and will not operate automated station turnstiles.
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-navy-900/60 p-4 rounded-2xl border border-white/[0.08] backdrop-blur-sm">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 font-mono text-xs">
            {(['ALL', 'ACTIVE', 'CANCELLED'] as const).map((mode) => (
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
                {mode === 'ALL' ? `All (${tickets.length})` : mode}
              </button>
            ))}
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
              <span>Book Demo Pass</span>
            </button>
          </div>
        </div>

        {/* Firebase Authentication Configuration Guide (Requirement 6) */}
        {showFirebaseInfo && (
          <div className="glass-card p-6 border border-cyan-500/30 bg-navy-900/90 rounded-2xl space-y-4 animate-fade-in text-xs font-mono">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <span>🔥</span>
                <span>Firebase Authentication & Cloud Storage Setup</span>
              </h4>
              <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                Setup Instructions
              </span>
            </div>

            <p className="text-gray-300 leading-relaxed">
              Firebase Authentication is not currently configured in this environment. Demo tickets are persistently stored in your browser&apos;s <code className="text-cyan-300">localStorage</code> across page reloads.
            </p>

            <div className="bg-navy-950/80 p-4 rounded-xl border border-white/[0.06] space-y-2 text-gray-300">
              <p className="font-bold text-white">To enable Cloud Account Sync with Firebase Auth:</p>
              <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-gray-400">
                <li>Install the Firebase SDK: <code className="text-cyan-300">npm install firebase</code></li>
                <li>Create a Firebase Project at <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline">console.firebase.google.com</a> and enable <strong>Authentication</strong> (Email/Password or Google) and <strong>Cloud Firestore</strong>.</li>
                <li>Add your credentials to environment variables: <code className="text-cyan-300">VITE_FIREBASE_API_KEY</code>, <code className="text-cyan-300">VITE_FIREBASE_PROJECT_ID</code>, etc.</li>
                <li>Replace <code className="text-cyan-300">LocalStorageAdapter</code> in <code className="text-cyan-300">src/features/tickets/ticketStore.ts</code> with a Firestore adapter saving to <code className="text-cyan-300">users/{'{userId}'}/demo_tickets/{'{ticketId}'}</code>.</li>
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
              <p className="text-base font-bold text-white">No Demo Tickets Found</p>
              <p className="text-xs text-gray-400 mt-1 font-mono">
                {filter === 'ALL'
                  ? 'You have not booked any demo metro passes yet.'
                  : `No tickets with status "${filter}".`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openBookingModal()}
              className="btn-primary py-2.5 px-6 rounded-xl text-xs font-bold"
            >
              + Book a Demo Ticket Now
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTickets.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedTicket(t)}
                className="glass-card p-5 rounded-2xl border border-white/[0.08] hover:border-cyan-500/40 bg-navy-900/80 hover:bg-navy-900 transition-all cursor-pointer group space-y-3 relative overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-cyan-300">
                    {t.id}
                  </span>
                  <span
                    className={`text-[9px] font-mono px-2 py-0.5 rounded-full uppercase font-bold border ${
                      t.status === 'CANCELLED'
                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}
                  >
                    {t.status}
                  </span>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-base font-bold text-white">
                    <span>{t.source.name}</span>
                    <span className="text-cyan-400 text-sm">→</span>
                    <span>{t.destination.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {t.routeSummary.lines.map((l) => (
                      <span
                        key={l}
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: LINE_COLORS[l] }}
                      />
                    ))}
                    <span className="text-[10px] text-gray-400 font-mono ml-1">
                      {t.routeSummary.totalStations - 1} stops • {formatDuration(t.routeSummary.totalTimeSeconds)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs font-mono">
                  <span className="text-gray-400">
                    {t.ticketType === 'RETURN' ? 'Return' : 'Single'} • {t.passengerCount} {t.passengerCount === 1 ? 'Adult' : 'Adults'}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-emerald-400 font-display text-sm">
                      ₹{t.totalFare}
                    </span>
                    <span className="text-cyan-400 group-hover:translate-x-1 transition-transform">
                      View →
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
              Clear all demo tickets
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
