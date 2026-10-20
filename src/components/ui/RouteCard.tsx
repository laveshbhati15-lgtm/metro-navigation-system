import type { MetroRoute, LineSegment } from '@/core/graph/types';
import { LINE_COLORS, LINE_DISPLAY_NAMES } from '@/utils/lineColors';
import { formatDuration, formatInterchangeCount, estimateFare } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { useTicketStore } from '@/features/tickets/ticketStore';

interface RouteCardProps {
  route: MetroRoute;
  isActive: boolean;
  onClick: () => void;
  index: number;
}

export function RouteCard({ route, isActive, onClick, index }: RouteCardProps) {
  const fare = estimateFare(route.totalStations);

  return (
    <article
      id={`route-card-${index}`}
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      aria-label={`${route.label} route: ${formatDuration(route.totalTimeSeconds)}, ${route.totalStations} stations`}
      className={cn('route-card', isActive && 'active', 'animate-slide-up')}
      style={{ animationDelay: `${index * 80}ms` }}
      onClick={onClick}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick()}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded-full',
              index === 0
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-white/5 text-gray-400 border border-white/10',
            )}>
              {route.label}
            </span>
            {index === 0 && (
              <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Recommended
              </span>
            )}
          </div>

          {/* Time display */}
          <p className="text-3xl font-bold font-display text-white">
            {formatDuration(route.totalTimeSeconds)}
          </p>
          {route.hasEstimatedTimes && (
            <p className="text-xs text-amber-400/70 mt-0.5">
              ⚠ Based on estimated timings
            </p>
          )}
        </div>

        {/* Stats column */}
        <div className="text-right text-sm text-gray-400 space-y-1">
          <p><span className="text-white font-medium">{route.totalStations}</span> stations</p>
          <p className={cn(
            'font-medium',
            route.interchangeCount === 0 ? 'text-emerald-400' : 'text-amber-400',
          )}>
            {formatInterchangeCount(route.interchangeCount)}
          </p>
          <p className="text-gray-400 text-xs">
            Fare: <span className="text-white font-medium">₹{fare.amount}</span>{' '}
            <span className="text-amber-400/80">(est.)</span>
          </p>
        </div>
      </div>

      {/* Line segments visual */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {route.lineSegments.map((seg, i) => (
          <LineSegmentBadge key={i} segment={seg} isLast={i === route.lineSegments.length - 1} />
        ))}
      </div>

      {/* Station path preview */}
      <StationPath route={route} />

      {/* Book Demo Ticket CTA for this specific route variant */}
      {isActive && (
        <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center justify-between">
          <span className="text-xs font-mono text-gray-400">
            Selected variant: <strong className="text-white">{route.label}</strong>
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
            className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 hover:text-white text-xs font-mono font-semibold flex items-center gap-1.5 transition-all shadow-glow-cyan/10"
          >
            <span>🎟️</span>
            <span>Book This Route (₹{fare.amount})</span>
          </button>
        </div>
      )}
    </article>
  );
}

// ─── Line Segment Badge ───────────────────────────────────────────────────────

function LineSegmentBadge({ segment, isLast }: { segment: LineSegment; isLast: boolean }) {
  const color = LINE_COLORS[segment.line];
  const name = LINE_DISPLAY_NAMES[segment.line];
  const stops = segment.stations.length - 1;

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
        <span className="opacity-70">{stops} stop{stops !== 1 ? 's' : ''}</span>
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

function StationPath({ route }: { route: MetroRoute }) {
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
      <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide font-medium">Route</p>
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
              name={station.name}
              isFirst={i === 0}
              isLast={!hasMore && i === visibleStart.length - 1}
              isInterchange={isInterchange}
              lineColor={lineColor}
              showConnector={i < visibleStart.length - 1 || hasMore}
            />
          );
        })}

        {hasMore && (
          <div className="flex items-start gap-3 py-1">
            <div className="flex flex-col items-center" style={{ width: '12px' }}>
              <div className="w-0.5 h-full bg-white/15 flex-grow" style={{ minHeight: '24px' }} />
            </div>
            <span className="text-xs text-gray-500 py-1 italic">
              · · · {hiddenCount} more station{hiddenCount !== 1 ? 's' : ''} · · ·
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
              name={station.name}
              isFirst={false}
              isLast={isLast}
              isInterchange={isInterchange}
              lineColor={lineColor}
              showConnector={!isLast}
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
}

function StationRow({ name, isFirst, isLast, isInterchange, lineColor, showConnector }: StationRowProps) {
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
          <span className="ml-2 text-xs opacity-60">(Interchange)</span>
        )}
      </span>
    </div>
  );
}
