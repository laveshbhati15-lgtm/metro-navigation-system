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
    <div className="rounded-2xl p-4 sm:p-5 border border-slate-800 bg-slate-900/90 shadow-xl backdrop-blur-md animate-fade-in space-y-4">
      {/* Header with Metrics & Expand Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
              {t('itinerary.title')}
            </h3>
          </div>
          <p className="text-[11px] text-gray-400 font-mono">
            {route.totalStations} {t('planner.stations').toLowerCase()} • {formatDuration(route.totalTimeSeconds)}{' '}
            <span className="text-gray-500">{t('hero.est')}</span> • ₹{fare.amount}{' '}
            <span className="text-gray-500">{t('hero.est')}</span>
          </p>
        </div>

        <button
          type="button"
          id="btn-toggle-all-stops"
          onClick={() => setExpandAllStops(!expandAllStops)}
          className="text-xs font-mono px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-cyan-300 hover:text-white border border-white/10 transition-colors flex items-center gap-1.5"
        >
          <span>{expandAllStops ? t('itinerary.collapseStops') : t('itinerary.expandStops')}</span>
          <span>{expandAllStops ? '▲' : '▼'}</span>
        </button>
      </div>

      {/* Segments & Transfer Blocks */}
      <div className="space-y-4">
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
      <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
        <span className="text-base">✓</span>
        <div className="leading-snug">
          <p className="font-semibold text-white">
            {t('itinerary.arriveAt', { station: getStationDisplayName(lastStation, i18n.language) })}
          </p>
          <p className="text-[11px] text-emerald-400/80">
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
    <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-3.5 space-y-3">
      {/* Line Segment Header Strip */}
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: lineColor }}
          />
          <span className="text-xs font-bold text-white font-display">
            {lineName}
          </span>
          <span className="text-[10px] font-mono text-gray-400 bg-white/5 px-2 py-0.5 rounded border border-white/5">
            {stopsLabel} • ~{formatDuration(segment.durationSeconds)}{' '}
            <span className="text-gray-500">{t('hero.est')}</span>
          </span>
        </div>

        {intermediateStations.length > 0 && !expandAll && (
          <button
            type="button"
            onClick={() => setIsLocallyExpanded(!isLocallyExpanded)}
            className="text-[11px] font-mono text-cyan-400 hover:text-white transition-colors flex items-center gap-1"
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
              className="w-3 h-3 rounded-full border-2 border-white"
              style={{ backgroundColor: isFirstSegment ? '#10b981' : lineColor }}
            />
            <span
              className="w-0.5 flex-grow my-0.5"
              style={{
                backgroundColor: `${lineColor}60`,
                minHeight: isExpanded && intermediateStations.length > 0 ? '16px' : '24px',
              }}
            />
          </div>
          <div>
            <p className="font-semibold text-white flex items-center gap-1.5 flex-wrap">
              <span>{isFirstSegment ? t('itinerary.boardAt') : t('itinerary.continueOn')}</span>
              <strong className="text-cyan-200">{startDisplayName}</strong>
              {startSecondaryName && (
                <span className="text-[10px] text-gray-500 font-normal">
                  ({startSecondaryName})
                </span>
              )}
              <button
                type="button"
                onClick={() => setIndoorStation(startStation)}
                className="text-[10px] font-mono text-cyan-400 hover:text-white px-1.5 py-0.5 rounded bg-white/5 border border-white/10 hover:border-cyan-400/40 transition-colors"
                title={t('itinerary.guideTooltip', { station: startDisplayName })}
              >
                {t('itinerary.guideBtn')}
              </button>
            </p>
            <p className="text-[10px] text-gray-400 font-mono mt-0.5">
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
                      style={{ backgroundColor: `${lineColor}35` }}
                    />
                  )}
                </div>
                <div className="flex items-center justify-between w-full pr-2 text-gray-300">
                  <span className="text-[11px]">
                    <span className="text-gray-500 font-mono mr-1.5 text-[10px]">
                      {idx + 1}.
                    </span>
                    {getStationDisplayName(station, currentLang)}
                  </span>
                  {station.isInterchange && (
                    <span className="text-[9px] font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
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
              <span className="w-0.5 h-4 bg-white/20" />
            </div>
            <span className="text-[11px] text-gray-500 font-mono italic">
              {t('hero.intermediateStopsCount', { count: intermediateStations.length })}
            </span>
          </div>
        ) : null}

        {/* End of Segment / Alighting or Transfer Station */}
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
            <span
              className="w-3 h-3 rounded-full border-2 border-white"
              style={{ backgroundColor: isLastSegment ? '#ef4444' : '#a855f7' }}
            />
          </div>
          <div>
            <p className="font-semibold text-white flex items-center gap-1.5 flex-wrap">
              <span>{isLastSegment ? t('hero.alightAt') : t('itinerary.arriveAt', { station: '' }).trim()}</span>
              <strong className={isLastSegment ? 'text-emerald-300' : 'text-purple-300'}>
                {endDisplayName}
              </strong>
              <button
                type="button"
                onClick={() => setIndoorStation(endStation)}
                className="text-[10px] font-mono text-cyan-400 hover:text-white px-1.5 py-0.5 rounded bg-white/5 border border-white/10 hover:border-cyan-400/40 transition-colors"
                title={t('itinerary.guideTooltip', { station: endDisplayName })}
              >
                {t('itinerary.guideBtn')}
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Dedicated Interchange Guidance Block (if this segment ends with a transfer) */}
      {interchangeAtEnd && nextLine && (
        <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-500/30 text-purple-200 text-xs flex items-start gap-2.5 mt-2">
          <span className="text-lg shrink-0 mt-0.5">🔄</span>
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-white">
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
                className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 hover:text-white border border-purple-500/40 transition-colors flex items-center gap-1"
              >
                <span>{t('indoor.guideBadge')}</span>
                <span>➔</span>
              </button>
            </div>
            <p className="text-[11px] text-purple-200 leading-relaxed">
              {t('itinerary.changeLine', { line: getLocalizedLineName(nextLine, currentLang) })}
            </p>
            <p className="text-[10px] text-purple-300/80 font-mono">
              {t('itinerary.walkingFriction')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
