import React, { useState, useEffect, useMemo } from 'react';
import type { Station, MetroRoute } from '@/core/graph/types';
import type { TicketType } from './types';
import { useTicketStore } from './ticketStore';
import { StationSearch } from '@/components/ui/StationSearch';
import { DemoTicketCard } from './DemoTicketCard';
import { metroGraph } from '@/core/graph/MetroGraph';
import { planRoutes } from '@/core/algorithm/routePlanner';
import { estimateFare, formatDuration } from '@/utils/formatters';
import { LINE_COLORS, LINE_DISPLAY_NAMES } from '@/utils/lineColors';

export const BookingModal: React.FC = () => {
  const isBookingModalOpen = useTicketStore((s) => s.isBookingModalOpen);
  const closeBookingModal = useTicketStore((s) => s.closeBookingModal);
  const preselectedSource = useTicketStore((s) => s.preselectedSource);
  const preselectedDestination = useTicketStore((s) => s.preselectedDestination);
  const preselectedRoute = useTicketStore((s) => s.preselectedRoute);
  const createDemoTicket = useTicketStore((s) => s.createDemoTicket);
  const cancelDemoTicket = useTicketStore((s) => s.cancelDemoTicket);
  const openHistoryModal = useTicketStore((s) => s.openHistoryModal);

  // Form State
  const [source, setSource] = useState<Station | null>(null);
  const [destination, setDestination] = useState<Station | null>(null);
  const [passengerCount, setPassengerCount] = useState<number>(1);
  const [ticketType, setTicketType] = useState<TicketType>('SINGLE');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [confirmedTicketId, setConfirmedTicketId] = useState<string | null>(null);

  // Sync state when modal opens
  useEffect(() => {
    if (isBookingModalOpen) {
      setSource(preselectedSource);
      setDestination(preselectedDestination);
      setPassengerCount(1);
      setTicketType('SINGLE');
      setConfirmedTicketId(null);
    }
  }, [isBookingModalOpen, preselectedSource, preselectedDestination]);

  // Compute live route if stations change
  const currentRoute: MetroRoute | null = useMemo(() => {
    if (
      preselectedRoute &&
      source?.id === preselectedSource?.id &&
      destination?.id === preselectedDestination?.id
    ) {
      return preselectedRoute;
    }

    if (source && destination && source.id !== destination.id) {
      const routes = planRoutes(metroGraph, source.id, destination.id);
      return routes[0] ?? null;
    }
    return null;
  }, [source, destination, preselectedRoute, preselectedSource, preselectedDestination]);

  // Calculate fare
  const fareCalculation = useMemo(() => {
    if (!currentRoute) return { baseFare: 0, totalFare: 0 };
    const base = estimateFare(currentRoute.totalStations).amount;
    const multiplier = ticketType === 'RETURN' ? 1.8 : 1;
    const total = Math.round(base * passengerCount * multiplier);
    return { baseFare: base, totalFare: total };
  }, [currentRoute, passengerCount, ticketType]);

  const handleConfirmBooking = () => {
    if (!source || !destination || !currentRoute) return;

    setIsSubmitting(true);
    setTimeout(() => {
      const ticket = createDemoTicket({
        source,
        destination,
        route: currentRoute,
        passengerCount,
        ticketType,
      });
      setIsSubmitting(false);
      setConfirmedTicketId(ticket.id);
    }, 400);
  };

  const confirmedTicket = useTicketStore((s) =>
    confirmedTicketId ? s.getTicketById(confirmedTicketId) : undefined
  );

  if (!isBookingModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-md overflow-y-auto animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
    >
      <div className="relative w-full max-w-xl my-8">
        {/* Close Button Top-Right */}
        <button
          type="button"
          onClick={closeBookingModal}
          className="absolute -top-3 -right-3 z-20 w-8 h-8 rounded-full bg-navy-800 border border-white/20 text-gray-300 hover:text-white hover:bg-navy-700 flex items-center justify-center shadow-lg transition-colors"
          aria-label="Close booking modal"
        >
          ✕
        </button>

        {confirmedTicket ? (
          /* ── Confirmed E-Ticket View ── */
          <div className="space-y-4">
            <DemoTicketCard
              ticket={confirmedTicket}
              onCancel={cancelDemoTicket}
              onClose={closeBookingModal}
            />

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmedTicketId(null)}
                className="py-2.5 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-xs font-mono font-semibold text-gray-300 hover:text-white transition-colors"
              >
                + Book Another Ticket
              </button>
              <button
                type="button"
                onClick={() => {
                  closeBookingModal();
                  openHistoryModal();
                }}
                className="py-2.5 px-4 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-xs font-mono font-semibold text-cyan-300 hover:text-white transition-colors"
              >
                View Ticket History
              </button>
            </div>
          </div>
        ) : (
          /* ── Ticket Configuration / Checkout View ── */
          <div className="glass-card bg-navy-900/95 border border-white/10 p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div>
                <h3
                  id="booking-modal-title"
                  className="text-lg sm:text-xl font-bold font-display text-white tracking-tight flex items-center gap-2"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                  Book Demo Metro Ticket
                </h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">
                  Simulated DMRC QR Electronic Token
                </p>
              </div>

              <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold uppercase tracking-wider">
                Demo Simulator
              </span>
            </div>

            {/* Strict Notice */}
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-xs text-amber-200">
              <span className="text-base leading-none">⚠️</span>
              <div>
                <strong className="font-bold block text-amber-100">DEMO PURPOSES ONLY</strong>
                <span className="text-[11px] text-amber-200/90 leading-relaxed block mt-0.5">
                  This demo generates simulated QR tokens for testing the journey-planning workflow. It is NOT valid for metro entry and cannot be used at DMRC automated fare gates.
                </span>
              </div>
            </div>

            {/* Station Pickers */}
            <div className="space-y-4">
              <StationSearch
                label="Departure Station (Origin)"
                placeholder="Search departure station…"
                value={source}
                onChange={setSource}
                excludeId={destination?.id}
                id="booking-source-station"
              />

              <StationSearch
                label="Destination Station (Arrival)"
                placeholder="Search arrival station…"
                value={destination}
                onChange={setDestination}
                excludeId={source?.id}
                id="booking-dest-station"
              />
            </div>

            {/* Live Journey Metrics HUD */}
            {currentRoute && (
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-gray-400">Selected Path:</span>
                  <span className="text-cyan-300 font-bold">{currentRoute.label}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                  <div className="bg-navy-950/60 p-2.5 rounded-xl border border-white/[0.05]">
                    <span className="text-[10px] text-gray-400 block">Est. Time</span>
                    <span className="font-bold text-white block mt-0.5">
                      {formatDuration(currentRoute.totalTimeSeconds)}
                    </span>
                  </div>
                  <div className="bg-navy-950/60 p-2.5 rounded-xl border border-white/[0.05]">
                    <span className="text-[10px] text-gray-400 block">Stations</span>
                    <span className="font-bold text-white block mt-0.5">
                      {currentRoute.totalStations}
                    </span>
                  </div>
                  <div className="bg-navy-950/60 p-2.5 rounded-xl border border-white/[0.05]">
                    <span className="text-[10px] text-gray-400 block">Interchanges</span>
                    <span className="font-bold text-amber-300 block mt-0.5">
                      {currentRoute.interchangeCount}
                    </span>
                  </div>
                </div>

                {/* Lines badges */}
                <div className="flex items-center gap-1.5 pt-1 text-[11px] font-mono">
                  <span className="text-gray-400">Lines:</span>
                  {Array.from(new Set(currentRoute.edges.map((e) => e.line))).map((line) => (
                    <span
                      key={line}
                      className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                      style={{ backgroundColor: LINE_COLORS[line] }}
                    >
                      {LINE_DISPLAY_NAMES[line]}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Passenger Count & Ticket Type Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Passengers Stepper */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                <label className="text-xs font-mono font-semibold text-gray-300 block mb-2">
                  Passengers
                </label>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setPassengerCount((p) => Math.max(1, p - 1))}
                    disabled={passengerCount <= 1}
                    className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-white text-base font-bold transition-colors"
                  >
                    -
                  </button>
                  <span className="text-base font-bold font-mono text-white">
                    {passengerCount} {passengerCount === 1 ? 'Adult' : 'Adults'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPassengerCount((p) => Math.min(6, p + 1))}
                    disabled={passengerCount >= 6}
                    className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-white text-base font-bold transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Journey Type Toggle */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                <label className="text-xs font-mono font-semibold text-gray-300 block mb-2">
                  Trip Type
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-navy-950/80 rounded-xl border border-white/[0.05]">
                  <button
                    type="button"
                    onClick={() => setTicketType('SINGLE')}
                    className={`py-1.5 px-3 rounded-lg text-xs font-mono font-bold transition-all ${
                      ticketType === 'SINGLE'
                        ? 'bg-blue-600 text-white shadow-glow-blue'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Single
                  </button>
                  <button
                    type="button"
                    onClick={() => setTicketType('RETURN')}
                    className={`py-1.5 px-3 rounded-lg text-xs font-mono font-bold transition-all ${
                      ticketType === 'RETURN'
                        ? 'bg-blue-600 text-white shadow-glow-blue'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Return (10% off)
                  </button>
                </div>
              </div>
            </div>

            {/* Fare Summary & Submit */}
            <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between">
              <div>
                <span className="text-[10px] text-gray-400 font-mono block">Estimated Total</span>
                <p className="text-xl sm:text-2xl font-black font-display text-emerald-400">
                  ₹{fareCalculation.totalFare}{' '}
                  <span className="text-xs font-normal text-gray-400 font-sans">(est.)</span>
                </p>
                <span className="text-[10px] text-gray-500 font-mono">
                  Base ₹{fareCalculation.baseFare}/person
                </span>
              </div>

              <button
                type="button"
                id="btn-confirm-demo-booking"
                onClick={handleConfirmBooking}
                disabled={!currentRoute || isSubmitting}
                className="btn-primary py-3 px-6 rounded-2xl font-bold flex items-center gap-2 shadow-glow-cyan/20 disabled:opacity-40 disabled:pointer-events-none"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Issuing Demo Pass…</span>
                  </>
                ) : (
                  <>
                    <span>Confirm Demo Booking</span>
                    <span>→</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
