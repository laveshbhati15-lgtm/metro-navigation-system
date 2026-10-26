import { useTranslation } from 'react-i18next';
import type { MetroRoute, LineSegment } from '@/core/graph/types';
import { LINE_COLORS } from '@/utils/lineColors';
import { formatDuration, formatInterchangeCount, estimateFare } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { useTicketStore } from '@/features/tickets/ticketStore';
import { getStationDisplayName, getLocalizedLineName } from '@/i18n';

interface RouteCardProps {
  route: MetroRoute;
  isActive: boolean;
  onClick: () => void;
  index: number;
}

export function RouteCard({ route, isActive, onClick, index }: RouteCardProps) {
  const { t, i18n } = useTranslation();
  const fare = estimateFare(route.totalStations);

  return (
    <article
      id={`route-card-${index}`}
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      aria-label={`${route.label} route: ${formatDuration(route.totalTimeSeconds)}, ${route.totalStations} stations`}
      className={cn(
        'rounded-2xl p-4 sm:p-5 cursor-pointer transition-all duration-200 border',
        'bg-slate-900/90 backdrop-blur-md',
        isActive
          ? 'border-cyan-400/80 bg-slate-900 shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-400/40'
          : 'border-slate-800 hover:border-slate-700 hover:bg-slate-850',
      )}
      onClick={onClick}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick()}
    >
      {/* 5. Route Type & Recommended Badge */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            'text-xs font-mono font-semibold px-2.5 py-0.5 rounded-md border',
            isActive
              ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
              : 'bg-white/5 text-gray-300 border-white/10',
          )}>
            {route.label}
          </span>
          {index === 0 && (
            <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md flex items-center gap-1 font-sans">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {t('routeCard.recommended')}
            </span>
          )}
        </div>

        <span className="text-[11px] font-mono">
          {isActive ? (
            <span className="text-cyan-400 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              {t('routeCard.selectedVariant', 'Selected Route')}
            </span>
          ) : (
            <span className="text-gray-400 hover:text-white transition-colors">
              {t('search.oneClickSelect', 'Select Route')} →
            </span>
          )}
        </span>
      </div>

      {/* 1, 2, 3, 4: Essential Information Grid (Time, Fare, Stations, Interchanges) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 mb-3.5">
        {/* 1. Estimated Travel Time */}
        <div className="p-2 rounded-lg bg-slate-900/60 border border-white/[0.04]">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400 block">
            {t('planner.travelTime')}
          </span>
          <p className="text-lg sm:text-xl font-bold font-display text-white mt-0.5 leading-tight">
            {formatDuration(route.totalTimeSeconds)}
          </p>
          {route.hasEstimatedTimes && (
            <span className="text-[9px] text-amber-400/80 font-mono block mt-0.5">
              ~2 min/station
            </span>
          )}
        </div>

        {/* 2. Estimated Fare */}
        <div className="p-2 rounded-lg bg-slate-900/60 border border-white/[0.04]">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400 block">
            {t('planner.fare')}
          </span>
          <p className="text-lg sm:text-xl font-bold font-display text-emerald-400 mt-0.5 leading-tight">
            ₹{fare.amount}
          </p>
          <span className="text-[9px] text-gray-400 font-mono block mt-0.5">
            DMRC Fare Chart
          </span>
        </div>

        {/* 3. Number of Stations */}
        <div className="p-2 rounded-lg bg-slate-900/60 border border-white/[0.04]">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400 block">
            {t('planner.stations')}
          </span>
          <p className="text-lg sm:text-xl font-bold font-display text-white mt-0.5 leading-tight">
            {route.totalStations}
          </p>
          <span className="text-[9px] text-gray-400 font-mono block mt-0.5">
            {t('common.stations')}
          </span>
        </div>

        {/* 4. Interchanges and Line Changes */}
        <div className="p-2 rounded-lg bg-slate-900/60 border border-white/[0.04]">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400 block">
            {t('planner.transfers')}
          </span>
          <p className={cn(
            'text-lg sm:text-xl font-bold font-display mt-0.5 leading-tight',
            route.interchangeCount === 0 ? 'text-emerald-400' : 'text-amber-400',
          )}>
            {route.interchangeCount === 0
              ? t('common.direct')
              : route.interchangeCount}
          </p>
          <span className="text-[9px] text-gray-400 font-mono block mt-0.5">
            {route.interchangeCount === 0
              ? t('common.direct')
              : formatInterchangeCount(route.interchangeCount)}
          </span>
        </div>
      </div>

      {/* Line segments visual progression */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {route.lineSegments.map((seg, i) => (
          <LineSegmentBadge
            key={i}
            segment={seg}
            isLast={i === route.lineSegments.length - 1}
            currentLang={i18n.language}
          />
        ))}
      </div>

      {/* 6. Station Path Preview */}
      <StationPath route={route} currentLang={i18n.language} />

      {/* 7. Route Action / Ticket Booking Flow */}
      {isActive && (
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
          <span className="text-xs font-mono text-gray-400">
            {t('routeCard.selectedVariant')}{' '}
            <strong className="text-white font-medium">{route.label}</strong>
          </span>
          <button
            type="button"
            id={`btn-book-route-${index}`}
            onClick={(e) => {
              e.stopPropagation();
              useTicketStore.getState().openBookingModal({
                source: route.stations[0],
                destination: route.stations[route.stations.length - 1],
                route,
              });
            }}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md active:translate-y-0.5"
          >
            <span>🎟️</span>
            <span>{t('routeCard.bookVariant')} (₹{fare.amount})</span>
          </button>
        </div>
      )}
    </article>
  );
}

// ─── Line Segment Badge ───────────────────────────────────────────────────────

function LineSegmentBadge({
  segment,
  isLast,
  currentLang,
}: {
  segment: LineSegment;
  isLast: boolean;
  currentLang: string;
}) {
  const color = LINE_COLORS[segment.line];
  const name = getLocalizedLineName(segment.line, currentLang);
  const stops = segment.stations.length - 1;
  const stopsLabel = currentLang === 'hi'
    ? `${stops} स्टॉप`
    : `${stops} stop${stops !== 1 ? 's' : ''}`;

  return (
    <div className="flex items-center gap-1">
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
        style={{ backgroundColor: `${color}20`, border: `1px solid ${color}40`, color }}
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        {name}
        <span className="opacity-70">{stopsLabel}</span>
      </div>
      {!isLast && (
        <svg className="w-4 h-4 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      )}
    </div>
  );
}

// ─── Station Path (collapsible) ───────────────────────────────────────────────

function StationPath({ route, currentLang }: { route: MetroRoute; currentLang: string }) {
  const { t } = useTranslation();
  const MAX_VISIBLE = 4;
  const stations = route.stations;
  const hasMore = stations.length > MAX_VISIBLE * 2;

  if (stations.length <= 1) return null;

  // Show first few and last few stations with a count in between
  const visibleStart = stations.slice(0, MAX_VISIBLE);
  const visibleEnd = hasMore ? stations.slice(-2) : [];
  const hiddenCount = hasMore ? stations.length - MAX_VISIBLE - 2 : 0;

  return (
    <div className="border-t border-white/8 pt-4 mt-2">
      <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide font-medium">
        {t('booking.routeLabel')}
      </p>
      <div className="flex flex-col gap-0">
        {visibleStart.map((station, i) => {
          const edgeBeforeNext = route.edges[i];
          const isInterchange = route.interchanges.some(ic => ic.id === station.id);
          const lineColor = edgeBeforeNext
            ? LINE_COLORS[edgeBeforeNext.line]
            : LINE_COLORS[route.edges[0]?.line ?? 'BLUE'];

          return (
            <StationRow
              key={station.id}
              name={getStationDisplayName(station, currentLang)}
              isFirst={i === 0}
              isLast={!hasMore && i === visibleStart.length - 1}
              isInterchange={isInterchange}
              lineColor={lineColor}
              showConnector={i < visibleStart.length - 1 || hasMore}
              interchangeLabel={t('search.interchangeBadge')}
            />
          );
        })}

        {hasMore && (
          <div className="flex items-start gap-3 py-1">
            <div className="flex flex-col items-center" style={{ width: '12px' }}>
              <div className="w-0.5 h-full bg-white/15 flex-grow" style={{ minHeight: '24px' }} />
            </div>
            <span className="text-xs text-gray-500 py-1 italic">
              · · · {hiddenCount} {currentLang === 'hi' ? 'अन्य स्टेशन' : `more station${hiddenCount !== 1 ? 's' : ''}`} · · ·
            </span>
          </div>
        )}

        {hasMore && visibleEnd.map((station, i) => {
          const isLast = i === visibleEnd.length - 1;
          const isInterchange = route.interchanges.some(ic => ic.id === station.id);
          const lineColor = LINE_COLORS[route.edges[route.edges.length - 1]?.line ?? 'BLUE'];

          return (
            <StationRow
              key={station.id}
              name={getStationDisplayName(station, currentLang)}
              isFirst={false}
              isLast={isLast}
              isInterchange={isInterchange}
              lineColor={lineColor}
              showConnector={!isLast}
              interchangeLabel={t('search.interchangeBadge')}
            />
          );
        })}
      </div>
    </div>
  );
}

interface StationRowProps {
  name: string;
  isFirst: boolean;
  isLast: boolean;
  isInterchange: boolean;
  lineColor: string;
  showConnector: boolean;
  interchangeLabel: string;
}

function StationRow({
  name,
  isFirst,
  isLast,
  isInterchange,
  lineColor,
  showConnector,
  interchangeLabel,
}: StationRowProps) {
  return (
    <div className="flex items-start gap-3">
      {/* Timeline column */}
      <div className="flex flex-col items-center flex-shrink-0" style={{ width: '12px' }}>
        <div
          className={cn(
            'rounded-full flex-shrink-0 z-10',
            isFirst || isLast
              ? 'w-3 h-3 mt-1'
              : isInterchange
                ? 'w-2.5 h-2.5 mt-1'
                : 'w-2 h-2 mt-1.5',
          )}
          style={{ backgroundColor: lineColor, boxShadow: isInterchange ? `0 0 6px ${lineColor}80` : 'none' }}
        />
        {showConnector && (
          <div className="w-0.5 bg-white/15 flex-grow" style={{ minHeight: '16px', backgroundColor: lineColor + '40' }} />
        )}
      </div>

      {/* Station name */}
      <span className={cn(
        'text-sm pb-2',
        isFirst || isLast ? 'font-semibold text-white' : 'text-gray-300',
        isInterchange && !isFirst && !isLast && 'text-amber-300 font-medium',
      )}>
        {name}
        {isInterchange && !isFirst && !isLast && (
          <span className="ml-2 text-xs opacity-60">({interchangeLabel})</span>
        )}
      </span>
    </div>
  );
}
