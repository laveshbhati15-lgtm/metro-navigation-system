import { useTranslation } from 'react-i18next';
import type { MetroRoute, LineSegment } from '@/core/graph/types';
import { LINE_COLORS } from '@/utils/lineColors';
import { formatDuration, estimateFare } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { usePlannerTheme } from '@/context/PlannerThemeContext';
import { navigateToCheckout } from '@/features/checkout/checkoutSession';
import { getStationDisplayName, getLocalizedLineName } from '@/i18n';

interface RouteCardProps {
  route: MetroRoute;
  isActive: boolean;
  onClick: () => void;
  index: number;
}

export function RouteCard({ route, isActive, onClick, index }: RouteCardProps) {
  const { t, i18n } = useTranslation();
  const { theme } = usePlannerTheme();
  const fare = estimateFare(route.totalStations);

  return (
    <article
      id={`route-card-${index}`}
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      aria-label={`${route.label} route: ${formatDuration(route.totalTimeSeconds)}, ${route.totalStations} stations`}
      className={cn(
        'rounded-xl p-4 sm:p-5 cursor-pointer transition-all duration-150 border shadow-xs',
        'bg-[var(--planner-surface)] text-[var(--planner-text-primary)]',
        isActive
          ? 'border-[var(--planner-accent)] bg-[var(--planner-surface-subtle)] ring-1 ring-[var(--planner-accent-subtle)]'
          : 'border-[var(--planner-border)] hover:border-[var(--planner-border-highlight)] hover:bg-[var(--planner-surface-hover)]',
      )}
      onClick={onClick}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick()}
    >
      {/* Route Badge & Selection State */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            'text-[11px] font-mono uppercase tracking-wider font-semibold px-2 py-0.5 rounded',
            isActive
              ? 'bg-[var(--planner-accent-subtle)] text-[var(--planner-accent-text)] border border-[var(--planner-border-highlight)]'
              : 'bg-[var(--planner-surface-subtle)] text-[var(--planner-text-secondary)] border border-[var(--planner-border)]',
          )}>
            {route.label}
          </span>
          {index === 0 && (
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center gap-1">
              ✓ {t('routeCard.recommended')}
            </span>
          )}
        </div>

        <span className="text-[11px] font-mono">
          {isActive ? (
            <span className="text-[var(--planner-accent-text)] font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--planner-accent-text)]" />
              {t('routeCard.selectedVariant', 'Selected Route')}
            </span>
          ) : (
            <span className="text-[var(--planner-text-muted)] hover:text-[var(--planner-text-primary)] transition-colors">
              {t('search.oneClickSelect', 'Select Route')} →
            </span>
          )}
        </span>
      </div>

      {/* Primary Transit Metrics */}
      <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-[var(--planner-border-subtle)]">
        <div className="flex items-baseline gap-2 sm:gap-3">
          <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-[var(--planner-text-primary)]">
            {formatDuration(route.totalTimeSeconds)}
          </span>
          <span className="text-xs sm:text-sm font-sans text-[var(--planner-text-secondary)]">
            ({route.totalStations} {t('common.stations')})
          </span>
        </div>

        <div className="text-right">
          <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-500">
            ₹{fare.amount}
          </span>
          <span className="text-[10px] text-[var(--planner-text-muted)] font-mono block uppercase tracking-wide">
            {t('planner.fare')}
          </span>
        </div>
      </div>

      {/* Key Transit Attributes */}
      <div className="flex items-center gap-4 py-2.5 text-xs font-mono text-[var(--planner-text-secondary)]">
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--planner-text-muted)]">{t('planner.transfers')}:</span>
          <span className={cn('font-semibold', route.interchangeCount === 0 ? 'text-emerald-500' : 'text-amber-500')}>
            {route.interchangeCount === 0 ? t('common.direct') : `${route.interchangeCount} ${t('common.interchange')}`}
          </span>
        </div>
        <span className="text-[var(--planner-border)]">•</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--planner-text-muted)]">Pace:</span>
          <span className="text-[var(--planner-text-secondary)]">~2 min/stn</span>
        </div>
        <span className="text-[var(--planner-border)]">•</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--planner-text-muted)]">Network:</span>
          <span className="text-[var(--planner-text-secondary)]">DMRC</span>
        </div>
      </div>

      {/* Line Segments Visual Progression */}
      <div className="flex items-center gap-2 py-1.5 flex-wrap">
        {route.lineSegments.map((seg, i) => (
          <LineSegmentBadge
            key={i}
            segment={seg}
            isLast={i === route.lineSegments.length - 1}
            currentLang={i18n.language}
          />
        ))}
      </div>

      {/* Station Path Preview */}
      <StationPath route={route} currentLang={i18n.language} />

      {/* Action / Booking Trigger */}
      {isActive && (
        <div className="mt-4 pt-3 border-t border-[var(--planner-border-subtle)] flex items-center justify-between gap-3">
          <span className="text-xs font-mono text-[var(--planner-text-secondary)]">
            {t('routeCard.selectedVariant')}{' '}
            <strong className="text-[var(--planner-text-primary)] font-medium">{route.label}</strong>
          </span>
          <button
            type="button"
            id={`btn-book-route-${index}`}
            onClick={(e) => {
              e.stopPropagation();
              navigateToCheckout({
                source: route.stations[0],
                destination: route.stations[route.stations.length - 1],
                route,
                theme,
              });
            }}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-medium flex items-center gap-2 transition-colors shadow-sm"
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
    <div className="flex items-center gap-1.5 text-xs font-sans">
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-white font-medium text-xs shadow-xs"
        style={{ backgroundColor: color }}
      >
        <span>{name}</span>
        <span className="text-[10px] font-mono opacity-90">({stopsLabel})</span>
      </span>
      {!isLast && (
        <span className="text-slate-600 font-mono text-xs">→</span>
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
    <div className="border-t border-[var(--planner-border-subtle)] pt-3 mt-2">
      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--planner-text-muted)] mb-2">
        {t('booking.routeLabel')}
      </p>
      <div className="flex flex-col gap-0 font-sans">
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
              <div className="w-0.5 h-full bg-[var(--planner-border)] flex-grow" style={{ minHeight: '20px' }} />
            </div>
            <span className="text-xs text-[var(--planner-text-muted)] py-0.5 font-mono">
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
              ? 'w-2.5 h-2.5 mt-1'
              : isInterchange
                ? 'w-2 h-2 mt-1 ring-2 ring-amber-400/30'
                : 'w-1.5 h-1.5 mt-1.5',
          )}
          style={{ backgroundColor: lineColor }}
        />
        {showConnector && (
          <div className="w-0.5 flex-grow" style={{ minHeight: '16px', backgroundColor: `${lineColor}50` }} />
        )}
      </div>

      {/* Station name */}
      <span className={cn(
        'text-xs pb-1.5 leading-snug',
        isFirst || isLast ? 'font-semibold text-[var(--planner-text-primary)]' : 'text-[var(--planner-text-secondary)]',
        isInterchange && !isFirst && !isLast && 'text-amber-500 font-medium',
      )}>
        {name}
        {isInterchange && !isFirst && !isLast && (
          <span className="ml-1.5 text-[10px] font-mono text-amber-500 font-normal">({interchangeLabel})</span>
        )}
      </span>
    </div>
  );
}
