import React, { useState } from 'react';
import { useTicketStore } from './ticketStore';
import { DemoTicketCard } from './DemoTicketCard';
import type { DemoTicket } from './types';
import { formatDuration } from '@/utils/formatters';
import { LINE_COLORS } from '@/utils/lineColors';

export const TicketHistoryModal: React.FC = () => {
  const isHistoryModalOpen = useTicketStore((s) => s.isHistoryModalOpen);
  const closeHistoryModal = useTicketStore((s) => s.closeHistoryModal);
  const tickets = useTicketStore((s) => s.tickets);
  const cancelDemoTicket = useTicketStore((s) => s.cancelDemoTicket);
  const clearHistory = useTicketStore((s) => s.clearHistory);
  const openBookingModal = useTicketStore((s) => s.openBookingModal);

  const [selectedTicket, setSelectedTicket] = useState<DemoTicket | null>(null);

  if (!isHistoryModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-md overflow-y-auto animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ticket-history-title"
    >
      <div className="relative w-full max-w-2xl my-8">
        <button
          type="button"
          onClick={() => {
            if (selectedTicket) {
              setSelectedTicket(null);
            } else {
              closeHistoryModal();
            }
          }}
          className="absolute -top-3 -right-3 z-20 w-8 h-8 rounded-full bg-navy-800 border border-white/20 text-gray-300 hover:text-white hover:bg-navy-700 flex items-center justify-center shadow-lg transition-colors"
          aria-label="Close ticket history"
        >
          ✕
        </button>

        {selectedTicket ? (
          <div className="space-y-4">
            <DemoTicketCard
              ticket={selectedTicket}
              onCancel={(id) => {
                cancelDemoTicket(id);
                setSelectedTicket((prev) => (prev ? { ...prev, status: 'CANCELLED' } : null));
              }}
              onClose={() => setSelectedTicket(null)}
            />
          </div>
        ) : (
          <div className="glass-card bg-navy-900/95 border border-white/10 p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div>
                <h3
                  id="ticket-history-title"
                  className="text-lg sm:text-xl font-bold font-display text-white tracking-tight flex items-center gap-2"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                  Demo Ticket History
                </h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">
                  Saved demo e-tokens stored in your browser session
                </p>
              </div>

              {tickets.length > 0 && (
                <button
                  type="button"
                  onClick={clearHistory}
                  className="text-xs font-mono text-red-400 hover:text-red-300 transition-colors px-3 py-1 rounded-lg bg-red-500/10 border border-red-500/20"
                >
                  Clear History
                </button>
              )}
            </div>

            {/* List */}
            {tickets.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-white/[0.05] flex items-center justify-center text-2xl">
                  🎟️
                </div>
                <p className="text-sm font-semibold text-white">No Demo Bookings Yet</p>
                <p className="text-xs text-gray-400 max-w-xs mx-auto font-mono">
                  Plan a journey in the navigator and generate your first demo QR metro pass.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    closeHistoryModal();
                    openBookingModal();
                  }}
                  className="btn-primary mt-3 text-xs py-2 px-4 rounded-xl"
                >
                  + Book a Demo Ticket
                </button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {tickets.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTicket(t)}
                    className="p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-cyan-500/30 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
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
                        <span className="text-[10px] text-gray-400 font-mono">
                          {t.ticketType === 'RETURN' ? 'Return' : 'Single'} • {t.passengerCount} {t.passengerCount === 1 ? 'Pax' : 'Pax'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-sm font-bold text-white">
                        <span>{t.source.name}</span>
                        <span className="text-cyan-400 text-xs">→</span>
                        <span>{t.destination.name}</span>
                      </div>

                      <div className="flex items-center gap-2 text-[10px] font-mono text-gray-400">
                        <span>{t.routeSummary.totalStations - 1} stops</span>
                        <span>•</span>
                        <span>{formatDuration(t.routeSummary.totalTimeSeconds)}</span>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          {t.routeSummary.lines.map((l) => (
                            <span
                              key={l}
                              className="w-2 h-2 rounded-full inline-block"
                              style={{ backgroundColor: LINE_COLORS[l] }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-white/[0.05]">
                      <span className="text-sm font-black font-display text-emerald-400">
                        ₹{t.totalFare}
                      </span>
                      <span className="text-[11px] font-mono text-cyan-400 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                        View Pass →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
