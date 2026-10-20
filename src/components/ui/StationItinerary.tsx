import { useState } from 'react';
import type { MetroRoute, LineSegment, LineCode } from '@/core/graph/types';
import { LINE_COLORS, LINE_DISPLAY_NAMES } from '@/utils/lineColors';
import { formatDuration, estimateFare } from '@/utils/formatters';
import { useJourneyStore } from '@/store/journeyStore';
import { metroGraph } from '@/core/graph/MetroGraph';

interface StationItineraryProps {
  route: MetroRoute;
}

export function StationItinerary({ route }: StationItineraryProps) {
  const [expandAllStops, setExpandAllStops] = useState(false);
  const fare = estimateFare(route.totalStations);

  if (!route || route.lineSegments.length === 0) return null;

  return (
    <div className="glass-card p-5 border border-white/10 bg-navy-900/90 shadow-2xl rounded-2xl animate-fade-in space-y-4">
      {/* Header with Metrics & Expand Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
              Station-by-Station Itinerary
            </h3>
          </div>
          <p className="text-[11px] text-gray-400 font-mono">
            {route.totalStations} stations • {formatDuration(route.totalTimeSeconds)}{' '}
            <span className="text-gray-500">(est.)</span> • ₹{fare.amount}{' '}
            <span className="text-gray-500">(est.)</span>
          </p>
        </div>

        <button
          type="button"
          id="btn-toggle-all-stops"
          onClick={() => setExpandAllStops(!expandAllStops)}
          className="text-xs font-mono px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-cyan-300 hover:text-white border border-white/10 transition-colors flex items-center gap-1.5"
        >
          <span>{expandAllStops ? 'Collapse Intermediate Stops' : 'Expand All Stops'}</span>
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
          />
        ))}
      </div>

      {/* Journey Completion Banner */}
      <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
        <span className="text-base">✓</span>
        <div className="leading-snug">
          <p className="font-semibold text-white">
            Arrive at {route.stations[route.stations.length - 1].name}
          </p>
          <p className="text-[11px] text-emerald-400/80">
            End of journey. Exit through designated automatic fare collection gates.
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
  interchangeAtEnd: { id: string; name: string } | null;
  nextLine: LineCode | null;
}

function SegmentBlock({
  segment,
  isFirstSegment,
  isLastSegment,
  expandAll,
  interchangeAtEnd,
  nextLine,
}: SegmentBlockProps) {
  const [isLocallyExpanded, setIsLocallyExpanded] = useState(false);
  const isExpanded = expandAll || isLocallyExpanded;
  const setIndoorStation = useJourneyStore((s) => s.setIndoorStation);

  const lineColor = LINE_COLORS[segment.line] || '#0284c7';
  const lineName = LINE_DISPLAY_NAMES[segment.line] || `${segment.line} Line`;
  const stopCount = segment.stations.length - 1;
  const startStation = segment.stations[0];
  const endStation = segment.stations[segment.stations.length - 1];
  const intermediateStations = segment.stations.slice(1, -1);

  return (
    <div className="rounded-xl bg-navy-800/60 border border-white/[0.06] p-3.5 space-y-3">
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
            {stopCount} stop{stopCount !== 1 ? 's' : ''} • ~{formatDuration(segment.durationSeconds)}{' '}
            <span className="text-gray-500">(est.)</span>
          </span>
        </div>

        {intermediateStations.length > 0 && !expandAll && (
          <button
            type="button"
            onClick={() => setIsLocallyExpanded(!isLocallyExpanded)}
            className="text-[11px] font-mono text-cyan-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <span>{isExpanded ? 'Hide Stops' : `${intermediateStations.length} intermediate stops`}</span>
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
            <p className="font-semibold text-white flex items-center gap-1.5">
              <span>{isFirstSegment ? 'Board at' : 'Continue on'}</span>
              <strong className="text-cyan-200">{startStation.name}</strong>
              {startStation.nameHindi && (
                <span className="text-[10px] text-gray-500 font-normal">
                  ({startStation.nameHindi})
                </span>
              )}
              <button
                type="button"
                onClick={() => setIndoorStation(startStation)}
                className="text-[10px] font-mono text-cyan-400 hover:text-white px-1.5 py-0.5 rounded bg-white/5 border border-white/10 hover:border-cyan-400/40 transition-colors"
                title={`View indoor and accessible layout for ${startStation.name}`}
              >
                ♿ Guide
              </button>
            </p>
            <p className="text-[10px] text-gray-400 font-mono mt-0.5">
              Direction towards {endStation.name}
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
                    {station.name}
                  </span>
                  {station.isInterchange && (
                    <span className="text-[9px] font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                      Interchange
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
              Traversing {intermediateStations.length} intermediate stop{intermediateStations.length !== 1 ? 's' : ''}
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
            <p className="font-semibold text-white flex items-center gap-1.5">
              <span>{isLastSegment ? 'Alight at' : 'Arrive at transfer node'}</span>
              <strong className={isLastSegment ? 'text-emerald-300' : 'text-purple-300'}>
                {endStation.name}
              </strong>
              <button
                type="button"
                onClick={() => setIndoorStation(endStation)}
                className="text-[10px] font-mono text-cyan-400 hover:text-white px-1.5 py-0.5 rounded bg-white/5 border border-white/10 hover:border-cyan-400/40 transition-colors"
                title={`View indoor and accessible layout for ${endStation.name}`}
              >
                ♿ Guide
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
                Concourse Transfer at {interchangeAtEnd.name}
              </p>
              <button
                type="button"
                onClick={() => {
                  const st = metroGraph.getStation(interchangeAtEnd.id);
                  if (st) setIndoorStation(st);
                }}
                className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 hover:text-white border border-purple-500/40 transition-colors flex items-center gap-1"
              >
                <span>♿ Transfer Guide</span>
                <span>➔</span>
              </button>
            </div>
            <p className="text-[11px] text-purple-200 leading-relaxed">
              Alight from the <strong style={{ color: lineColor }}>{lineName}</strong> and proceed to the{' '}
              <strong style={{ color: LINE_COLORS[nextLine] || '#38bdf8' }}>
                {LINE_DISPLAY_NAMES[nextLine] || `${nextLine} Line`}
              </strong>{' '}
              platform via the station concourse.
            </p>
            <p className="text-[10px] text-purple-300/80 font-mono">
              Calibrated pedestrian walking friction: ~3 min (180s) included in total travel time.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
