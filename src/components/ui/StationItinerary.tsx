import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetroRoute, LineSegment, LineCode } from '@/core/graph/types';
import { LINE_COLORS } from '@/utils/lineColors';
import { formatDuration, estimateFare } from '@/utils/formatters';
import { useJourneyStore } from '@/store/journeyStore';
import { metroGraph } from '@/core/graph/MetroGraph';
import { getStationDisplayName, getStationSecondaryName, getLocalizedLineName } from '@/i18n';

interface StationItineraryProps {
  route: MetroRoute;
}

export function StationItinerary({ route }: StationItineraryProps) {
  const { t, i18n } = useTranslation();
  const [expandAllStops, setExpandAllStops] = useState(false);
  const fare = estimateFare(route.totalStations);

  if (!route || route.lineSegments.length === 0) return null;

  const lastStation = route.stations[route.stations.length - 1];

  return (
    <div className="rounded-xl p-4 sm:p-5 border border-[var(--planner-border)] bg-[var(--planner-surface)] text-[var(--planner-text-primary)] shadow-xs animate-fade-in space-y-4 font-sans transition-colors">
      {/* Header with Metrics & Expand Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--planner-border-subtle)]">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="w-2 h-2 rounded-full bg-[var(--planner-accent-text)]" />
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--planner-text-primary)]">
              {t('itinerary.title')}
            </h3>
          </div>
          <p className="text-[11px] text-[var(--planner-text-secondary)] font-mono">
            {route.totalStations} {t('planner.stations').toLowerCase()} • {formatDuration(route.totalTimeSeconds)}{' '}
            <span className="text-[var(--planner-text-muted)]">{t('hero.est')}</span> • ₹{fare.amount}
          </p>
        </div>

        <button
          type="button"
          id="btn-toggle-all-stops"
          onClick={() => setExpandAllStops(!expandAllStops)}
          className="text-xs font-mono px-2.5 py-1 rounded-md bg-[var(--planner-surface-subtle)] hover:bg-[var(--planner-surface-hover)] text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)] border border-[var(--planner-border)] transition-colors flex items-center gap-1.5 shadow-xs"
        >
          <span>{expandAllStops ? t('itinerary.collapseStops') : t('itinerary.expandStops')}</span>
          <span>{expandAllStops ? '▲' : '▼'}</span>
        </button>
      </div>

      {/* Segments & Transfer Blocks */}
      <div className="space-y-3.5">
        {route.lineSegments.map((segment, segIdx) => (
          <SegmentBlock
            key={`${segment.line}-${segIdx}`}
            segment={segment}
            isFirstSegment={segIdx === 0}
            isLastSegment={segIdx === route.lineSegments.length - 1}
            expandAll={expandAllStops}
            interchangeAtEnd={
              segIdx < route.lineSegments.length - 1
                ? route.interchanges.find(
                    (ic) => ic.id === segment.stations[segment.stations.length - 1].id
                  ) || segment.stations[segment.stations.length - 1]
                : null
            }
            nextLine={route.lineSegments[segIdx + 1]?.line ?? null}
            currentLang={i18n.language}
          />
        ))}
      </div>

      {/* Journey Completion Banner */}
      <div className="flex items-center gap-2.5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 text-xs font-sans">
        <span className="text-sm font-bold">✓</span>
        <div className="leading-snug">
          <p className="font-semibold text-[var(--planner-text-primary)]">
            {t('itinerary.arriveAt', { station: getStationDisplayName(lastStation, i18n.language) })}
          </p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
            {t('itinerary.endOfJourney')}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Segment Block ─────────────────────────────────────────────────────────────

interface SegmentBlockProps {
  segment: LineSegment;
  _segmentIndex?: number;
  isFirstSegment: boolean;
  isLastSegment: boolean;
  expandAll: boolean;
  interchangeAtEnd: { id: string; name: string; nameHindi?: string } | null;
  nextLine: LineCode | null;
  currentLang: string;
}

function SegmentBlock({
  segment,
  isFirstSegment,
  isLastSegment,
  expandAll,
  interchangeAtEnd,
  nextLine,
  currentLang,
}: SegmentBlockProps) {
  const { t } = useTranslation();
  const [isLocallyExpanded, setIsLocallyExpanded] = useState(false);
  const isExpanded = expandAll || isLocallyExpanded;
  const setIndoorStation = useJourneyStore((s) => s.setIndoorStation);

  const lineColor = LINE_COLORS[segment.line] || '#0284c7';
  const lineName = getLocalizedLineName(segment.line, currentLang);
  const stopCount = segment.stations.length - 1;
  const startStation = segment.stations[0];
  const endStation = segment.stations[segment.stations.length - 1];
  const intermediateStations = segment.stations.slice(1, -1);

  const startDisplayName = getStationDisplayName(startStation, currentLang);
  const startSecondaryName = getStationSecondaryName(startStation, currentLang);
  const endDisplayName = getStationDisplayName(endStation, currentLang);

  const stopsLabel = currentLang === 'hi'
    ? `${stopCount} स्टॉप`
    : `${stopCount} stop${stopCount !== 1 ? 's' : ''}`;

  return (
    <div className="rounded-lg bg-[var(--planner-surface-subtle)] border border-[var(--planner-border)] p-3 space-y-2.5 transition-colors">
      {/* Line Segment Header Strip */}
      <div className="flex items-center justify-between pb-2 border-b border-[var(--planner-border-subtle)]">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: lineColor }}
          />
          <span className="text-xs font-bold text-[var(--planner-text-primary)]">
            {lineName}
          </span>
          <span className="text-[10px] font-mono text-[var(--planner-text-secondary)] bg-[var(--planner-surface)] px-2 py-0.5 rounded border border-[var(--planner-border)]">
            {stopsLabel} • ~{formatDuration(segment.durationSeconds)}
          </span>
        </div>

        {intermediateStations.length > 0 && !expandAll && (
          <button
            type="button"
            onClick={() => setIsLocallyExpanded(!isLocallyExpanded)}
            className="text-[11px] font-mono text-[var(--planner-accent-text)] hover:opacity-80 transition-opacity flex items-center gap-1"
          >
            <span>
              {isExpanded
                ? t('itinerary.hideStops')
                : t('itinerary.intermediateStops', { count: intermediateStations.length })}
            </span>
            <span>{isExpanded ? '▲' : '▼'}</span>
          </button>
        )}
      </div>

      {/* Timeline Steps */}
      <div className="pl-1 space-y-2 text-xs">
        {/* Origin / Boarding Station */}
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
            <span
              className="w-2.5 h-2.5 rounded-full border border-[var(--planner-surface)]"
              style={{ backgroundColor: isFirstSegment ? '#10b981' : lineColor }}
            />
            <span
              className="w-0.5 flex-grow my-0.5"
              style={{
                backgroundColor: `${lineColor}50`,
                minHeight: isExpanded && intermediateStations.length > 0 ? '16px' : '22px',
              }}
            />
          </div>
          <div>
            <p className="font-semibold text-[var(--planner-text-primary)] flex items-center gap-1.5 flex-wrap">
              <span className="text-[var(--planner-text-secondary)] font-normal">{isFirstSegment ? t('itinerary.boardAt') : t('itinerary.continueOn')}</span>
              <strong className="text-[var(--planner-text-primary)]">{startDisplayName}</strong>
              {startSecondaryName && (
                <span className="text-[10px] text-[var(--planner-text-muted)] font-normal">
                  ({startSecondaryName})
                </span>
              )}
              <button
                type="button"
                onClick={() => setIndoorStation(startStation)}
                className="text-[10px] font-mono text-[var(--planner-accent-text)] hover:opacity-80 px-1.5 py-0.5 rounded bg-[var(--planner-surface)] border border-[var(--planner-border)] transition-opacity shadow-xs"
                title={t('itinerary.guideTooltip', { station: startDisplayName })}
              >
                {t('itinerary.guideBtn')}
              </button>
            </p>
            <p className="text-[10px] text-[var(--planner-text-secondary)] font-mono mt-0.5">
              {t('itinerary.directionTowards', { station: endDisplayName })}
            </p>
          </div>
        </div>

        {/* Intermediate Stations List (Expanded or Collapsed) */}
        {isExpanded ? (
          <div className="space-y-1.5 pl-0.5">
            {intermediateStations.map((station, idx) => (
              <div key={station.id} className="flex items-center gap-3">
                <div className="flex flex-col items-center flex-shrink-0">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: lineColor }}
                  />
                  {idx < intermediateStations.length - 1 && (
                    <span
                      className="w-0.5 h-3 my-0.5"
                      style={{ backgroundColor: `${lineColor}30` }}
                    />
                  )}
                </div>
                <div className="flex items-center justify-between w-full pr-2 text-[var(--planner-text-secondary)]">
                  <span className="text-[11px]">
                    <span className="text-[var(--planner-text-muted)] font-mono mr-1.5 text-[10px]">
                      {idx + 1}.
                    </span>
                    {getStationDisplayName(station, currentLang)}
                  </span>
                  {station.isInterchange && (
                    <span className="text-[9px] font-mono text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      {t('search.interchangeBadge')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : intermediateStations.length > 0 ? (
          <div className="flex items-center gap-3 py-0.5">
            <div className="flex flex-col items-center flex-shrink-0">
              <span className="w-0.5 h-4 bg-[var(--planner-border)]" />
            </div>
            <span className="text-[11px] text-[var(--planner-text-muted)] font-mono italic">
              {t('hero.intermediateStopsCount', { count: intermediateStations.length })}
            </span>
          </div>
        ) : null}

        {/* End of Segment / Alighting or Transfer Station */}
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
            <span
              className="w-2.5 h-2.5 rounded-full border border-[var(--planner-surface)]"
              style={{ backgroundColor: isLastSegment ? '#ef4444' : '#a855f7' }}
            />
          </div>
          <div>
            <p className="font-semibold text-[var(--planner-text-primary)] flex items-center gap-1.5 flex-wrap">
              <span className="text-[var(--planner-text-secondary)] font-normal">{isLastSegment ? t('hero.alightAt') : t('itinerary.arriveAt', { station: '' }).trim()}</span>
              <strong className={isLastSegment ? 'text-emerald-500' : 'text-purple-500'}>
                {endDisplayName}
              </strong>
              <button
                type="button"
                onClick={() => setIndoorStation(endStation)}
                className="text-[10px] font-mono text-[var(--planner-accent-text)] hover:opacity-80 px-1.5 py-0.5 rounded bg-[var(--planner-surface)] border border-[var(--planner-border)] transition-opacity shadow-xs"
                title={t('itinerary.guideTooltip', { station: endDisplayName })}
              >
                {t('itinerary.guideBtn')}
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Dedicated Interchange Guidance Block */}
      {interchangeAtEnd && nextLine && (
        <div className="p-2.5 rounded-md bg-purple-500/10 border border-purple-500/25 text-purple-600 dark:text-purple-200 text-xs flex items-start gap-2.5 mt-2 font-sans">
          <span className="text-base shrink-0 mt-0.5">🔄</span>
          <div className="space-y-1 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-[var(--planner-text-primary)]">
                {t('itinerary.transferAt', {
                  station: interchangeAtEnd.nameHindi && currentLang === 'hi'
                    ? interchangeAtEnd.nameHindi
                    : interchangeAtEnd.name,
                })}
              </p>
              <button
                type="button"
                onClick={() => {
                  const st = metroGraph.getStation(interchangeAtEnd.id);
                  if (st) setIndoorStation(st);
                }}
                className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-purple-500/15 hover:bg-purple-500/25 text-purple-600 dark:text-purple-300 border border-purple-500/30 transition-colors flex items-center gap-1"
              >
                <span>{t('indoor.guideBadge')}</span>
                <span>➔</span>
              </button>
            </div>
            <p className="text-[11px] text-purple-600 dark:text-purple-300 leading-snug">
              {t('itinerary.changeLine', { line: getLocalizedLineName(nextLine, currentLang) })}
            </p>
            <p className="text-[10px] text-[var(--planner-text-muted)] font-mono">
              {t('itinerary.walkingFriction')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
