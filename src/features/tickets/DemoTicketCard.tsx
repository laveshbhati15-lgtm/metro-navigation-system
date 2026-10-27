import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DemoTicket } from './types';
import { DemoQRCode } from './DemoQRCode';
import { LINE_COLORS } from '@/utils/lineColors';
import { formatDuration } from '@/utils/formatters';
import { getStationDisplayName, getStationSecondaryName, getLocalizedLineName } from '@/i18n';

interface DemoTicketCardProps {
  ticket: DemoTicket;
  onCancel?: (id: string) => void;
  onClose?: () => void;
}

export const DemoTicketCard: React.FC<DemoTicketCardProps> = ({
  ticket,
  onCancel,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(ticket.qrPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const isCancelled = ticket.status === 'CANCELLED';
  const isPaidVerified = Boolean(ticket.isVerifiedPayment && ticket.paymentStatus === 'PAID');

  const srcDisplay = getStationDisplayName(ticket.source, i18n.language);
  const srcSecondary = getStationSecondaryName(ticket.source, i18n.language);
  const dstDisplay = getStationDisplayName(ticket.destination, i18n.language);
  const dstSecondary = getStationSecondaryName(ticket.destination, i18n.language);

  return (
    <div className="w-full max-w-md mx-auto bg-navy-950 text-white rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10 shadow-2xl relative font-sans">
      {/* ── Strict Demo Warning Ribbon ── */}
      <div className="bg-gradient-to-r from-red-600 via-amber-600 to-red-600 text-white text-[10px] sm:text-[11px] font-black tracking-widest text-center py-1.5 sm:py-2 px-3 sm:px-4 uppercase shadow-inner flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
        <span>⚠️</span>
        <span>DEMO — NOT VALID FOR METRO TRAVEL</span>
        <span className="opacity-75">·</span>
        <span>
          {isPaidVerified
            ? '✓ TEST MODE PAYMENT VERIFIED'
            : 'UNVERIFIED DEMO — NO PAYMENT PROCESSED'}
        </span>
        <span>⚠️</span>
      </div>

      {/* ── Ticket Header ── */}
      <div className="p-4 sm:p-6 pb-3 sm:pb-4 bg-gradient-to-b from-navy-900 to-navy-950 border-b border-white/[0.08]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-glow-cyan/40">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="6" width="18" height="12" rx="3" strokeWidth="2" />
                <path d="M7 6V4a2 2 0 012-2h6a2 2 0 012 2v2" strokeWidth="2" />
                <circle cx="8" cy="18" r="1.5" fill="currentColor" />
                <circle cx="16" cy="18" r="1.5" fill="currentColor" />
                <line x1="7" y1="10" x2="17" y2="10" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-extrabold font-display tracking-tight text-white flex items-center gap-2">
                {t('nav.brand')}
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  DEMO PASS
                </span>
              </p>
              <p className="text-[11px] text-gray-400 font-mono">
                {t('tickets.vaultSubtitle')}
              </p>
            </div>
          </div>

          <div className="text-right">
            <span
              className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border ${
                isCancelled
                  ? 'bg-red-500/20 text-red-300 border-red-500/30'
                  : isPaidVerified
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}
            >
              {isCancelled
                ? t('tickets.cancelledNotice')
                : isPaidVerified
                  ? '✓ TEST PAID'
                  : 'UNVERIFIED DEMO'}
            </span>
          </div>
        </div>

        {/* Reference ID */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <div>
            <span className="text-[10px] text-gray-500 font-mono block">DEMO BOOKING ID</span>
            <span className="text-xs sm:text-sm font-mono font-bold text-cyan-300 select-all">
              {ticket.id}
            </span>
          </div>
          {ticket.razorpayPaymentId && isPaidVerified && (
            <div>
              <span className="text-[10px] text-gray-500 font-mono block">RZP PAYMENT ID</span>
              <span className="text-[11px] font-mono font-semibold text-emerald-400 select-all">
                {ticket.razorpayPaymentId}
              </span>
            </div>
          )}
          <div className="text-right">
            <span className="text-[10px] text-gray-500 font-mono block">DATE & TIME</span>
            <span className="text-xs font-mono text-gray-300">
              {new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </div>

      {/* ── Journey Route Section ── */}
      <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
        {/* Origin & Destination Terminal Badges */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <span className="text-[10px] text-cyan-400/80 font-mono tracking-wider block uppercase font-bold">
              {t('booking.originLabel')}
            </span>
            <p className="text-base font-bold text-white leading-tight mt-0.5">
              {srcDisplay}
            </p>
            {srcSecondary && (
              <p className="text-xs text-gray-400 mt-0.5">
                {srcSecondary}
              </p>
            )}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {ticket.source.lines.map(l => (
                <span
                  key={l}
                  className="w-2.5 h-2.5 rounded-full inline-block border border-white/20"
                  style={{ backgroundColor: LINE_COLORS[l] }}
                  title={getLocalizedLineName(l, i18n.language)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center justify-center px-2">
            <div className="text-xs text-cyan-400 font-mono font-bold">
              {t('tickets.stationStops', { count: ticket.routeSummary.totalStations - 1 })}
            </div>
            <div className="w-16 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 my-1 relative">
              <span className="absolute -top-1 right-0 text-cyan-400 text-xs">→</span>
            </div>
            <span className="text-[10px] text-gray-400 font-mono">
              {formatDuration(ticket.routeSummary.totalTimeSeconds)}
            </span>
          </div>

          <div className="flex-1 text-right">
            <span className="text-[10px] text-emerald-400/80 font-mono tracking-wider block uppercase font-bold">
              {t('booking.destinationLabel')}
            </span>
            <p className="text-base font-bold text-white leading-tight mt-0.5">
              {dstDisplay}
            </p>
            {dstSecondary && (
              <p className="text-xs text-gray-400 mt-0.5">
                {dstSecondary}
              </p>
            )}
            <div className="flex flex-wrap gap-1 mt-1.5 justify-end">
              {ticket.destination.lines.map(l => (
                <span
                  key={l}
                  className="w-2.5 h-2.5 rounded-full inline-block border border-white/20"
                  style={{ backgroundColor: LINE_COLORS[l] }}
                  title={getLocalizedLineName(l, i18n.language)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Lines Traversed & Interchanges */}
        <div className="p-3 rounded-xl bg-navy-900/80 border border-white/[0.06] flex items-center justify-between text-xs font-mono">
          <div>
            <span className="text-gray-400 block text-[10px]">{t('booking.routeLabel')}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {ticket.routeSummary.lines.map(line => (
                <span
                  key={line}
                  className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                  style={{ backgroundColor: LINE_COLORS[line] }}
                >
                  {getLocalizedLineName(line, i18n.language)}
                </span>
              ))}
            </div>
          </div>

          <div className="text-right">
            <span className="text-gray-400 block text-[10px]">{t('planner.transfers')}</span>
            <span className="text-amber-300 font-bold block mt-0.5">
              {ticket.routeSummary.interchangeCount === 0
                ? t('common.direct')
                : `${ticket.routeSummary.interchangeCount} ${t('common.interchange')}`}
            </span>
          </div>
        </div>

        {/* Fare & Passenger Metadata Table */}
        <div className="grid grid-cols-3 gap-2 text-center pt-1 font-mono text-xs">
          <div className="bg-white/[0.03] p-2 rounded-lg border border-white/[0.05]">
            <span className="text-[10px] text-gray-400 block">{t('booking.passengerCountLabel')}</span>
            <span className="text-sm font-bold text-white block mt-0.5">
              {t('tickets.passengers', { count: ticket.passengerCount })}
            </span>
          </div>
          <div className="bg-white/[0.03] p-2 rounded-lg border border-white/[0.05]">
            <span className="text-[10px] text-gray-400 block">{t('booking.ticketTypeLabel')}</span>
            <span className="text-sm font-bold text-cyan-300 block mt-0.5">
              {ticket.ticketType === 'RETURN' ? t('booking.returnOption') : t('booking.singleOption')}
            </span>
          </div>
          <div className="bg-white/[0.03] p-2 rounded-lg border border-white/[0.05]">
            <span className="text-[10px] text-gray-400 block">
              {isPaidVerified ? t('tickets.farePaid') : 'DEMO FARE'}
            </span>
            <span
              className={`text-sm font-bold block mt-0.5 ${
                isPaidVerified ? 'text-emerald-400' : 'text-amber-300'
              }`}
            >
              ₹{ticket.totalFare}{' '}
              <span className="text-[9px] text-gray-500 font-normal">
                {isPaidVerified ? '(Test Paid)' : '(Unverified)'}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* ── Perforated Boarding Pass Divider ── */}
      <div className="relative flex items-center px-4 my-1">
        <div className="w-5 h-5 -ml-6 rounded-full bg-[#020409] border-r border-white/10" />
        <div className="flex-grow border-t-2 border-dashed border-white/20" />
        <div className="w-5 h-5 -mr-6 rounded-full bg-[#020409] border-l border-white/10" />
      </div>

      {/* ── QR Code Section ── */}
      <div className="p-4 sm:p-6 pt-3 sm:pt-4 flex flex-col items-center bg-navy-950 text-center space-y-3">
        <div className="relative group">
          <DemoQRCode value={ticket.qrPayload} size={170} />
          {isCancelled && (
            <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-xs flex items-center justify-center rounded-xl">
              <span className="text-red-400 font-bold font-mono text-sm border-2 border-red-500 px-3 py-1 rounded-lg rotate-12">
                {t('tickets.cancelledNotice')}
              </span>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-mono font-bold text-gray-300 tracking-wider uppercase">
            {t('tickets.scanAtGate')}
          </p>
          <p className="text-[10px] text-gray-500 font-mono mt-0.5">
            {t('tickets.validUntil')}: {new Date(ticket.expiresAt).toLocaleDateString()} {new Date(ticket.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 pt-2 w-full">
          <button
            type="button"
            onClick={handleCopyPayload}
            className="flex-1 py-2 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-mono text-gray-300 hover:text-white transition-colors flex items-center justify-center gap-1.5"
            title="Copy serialized QR payload"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {copied ? 'Copied QR Data!' : 'Copy QR Payload'}
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2 px-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-xs font-mono text-cyan-300 hover:text-white transition-colors flex items-center justify-center gap-1.5 font-semibold"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Ticket
          </button>
        </div>

        {/* Cancel Ticket Option */}
        {!isCancelled && onCancel && (
          <button
            type="button"
            onClick={() => onCancel(ticket.id)}
            className="text-[11px] font-mono text-red-400/80 hover:text-red-300 transition-colors pt-1"
          >
            {t('tickets.cancelTicket')}
          </button>
        )}

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-full mt-2 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-xs font-semibold text-white transition-colors"
          >
            {t('common.close')}
          </button>
        )}
      </div>
    </div>
  );
};
