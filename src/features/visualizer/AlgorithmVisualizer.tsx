import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useJourneyStore } from '@/store/journeyStore';
import { metroGraph } from '@/core/graph/MetroGraph';
import { bfs, type BFSResult } from '@/core/algorithm/bfs';
import { LINE_COLORS } from '@/utils/lineColors';
import { formatDuration } from '@/utils/formatters';
import type { Station } from '@/core/graph/types';
import { getStationDisplayName } from '@/i18n';

export type AlgorithmMode = 'dijkstra' | 'bfs' | 'comparison';

export function AlgorithmVisualizer() {
  const { t, i18n } = useTranslation();
  const source = useJourneyStore((s) => s.source);
  const destination = useJourneyStore((s) => s.destination);
  const dijkstraResult = useJourneyStore((s) => s.dijkstraResult);
  const setSource = useJourneyStore((s) => s.setSource);
  const setDestination = useJourneyStore((s) => s.setDestination);
  const calculateRoutes = useJourneyStore((s) => s.calculateRoutes);
  const setActiveView = useJourneyStore((s) => s.setActiveView);

  const [mode, setMode] = useState<AlgorithmMode>('dijkstra');

  // Compute BFS result for the exact same source and destination on the exact same graph
  const bfsResult: BFSResult | null = useMemo(() => {
    if (!source || !destination || source.id === destination.id) return null;
    return bfs(metroGraph, source.id, destination.id);
  }, [source, destination]);

  // Steps depending on mode
  const dijkstraSteps = dijkstraResult?.steps ?? [];
  const bfsSteps = bfsResult?.steps ?? [];

  const activeSteps = mode === 'bfs' ? bfsSteps : dijkstraSteps;
  const totalSteps = activeSteps.length;

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1); // 0.5, 1, 2, 5

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeyRef = useRef(`${source?.id}-${destination?.id}-${mode}`);

  // Sync step index when route or mode changes
  useEffect(() => {
    const key = `${source?.id}-${destination?.id}-${mode}`;
    if (lastKeyRef.current !== key) {
      lastKeyRef.current = key;
      setCurrentStepIndex(0);
      setIsPlaying(false);
    }
  }, [source?.id, destination?.id, mode]);

  // Keyboard controls for step navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => {
          if (!p && currentStepIndex >= totalSteps - 1) {
            setCurrentStepIndex(0);
          }
          return !p;
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentStepIndex((p) => Math.min(totalSteps - 1, p + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentStepIndex((p) => Math.max(0, p - 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentStepIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentStepIndex(Math.max(0, totalSteps - 1));
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalSteps, currentStepIndex]);

  // Playback timer
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    if (currentStepIndex >= totalSteps - 1) {
      const timeout = setTimeout(() => setIsPlaying(false), 0);
      return () => clearTimeout(timeout);
    }

    const intervalMs = Math.max(80, Math.round(600 / speed));
    timerRef.current = setTimeout(() => {
      setCurrentStepIndex((prev) => {
        if (prev + 1 >= totalSteps - 1) {
          setIsPlaying(false);
          return totalSteps - 1;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, currentStepIndex, totalSteps, speed]);

  const currentDijkstraStep = dijkstraSteps[currentStepIndex] ?? null;
  const currentBFSStep = bfsSteps[currentStepIndex] ?? null;

  const currentVisitedNode =
    mode === 'bfs'
      ? currentBFSStep?.visitedNode
      : currentDijkstraStep?.visitedNode;

  // Station info for current visited node
  const visitedStation: Station | null = useMemo(() => {
    if (!currentVisitedNode) return null;
    return metroGraph.getStation(currentVisitedNode) ?? null;
  }, [currentVisitedNode]);

  // Quick preset loader
  const handleLoadPreset = (srcId: string, dstId: string) => {
    const s = metroGraph.getStation(srcId);
    const d = metroGraph.getStation(dstId);
    if (s && d) {
      setSource(s);
      setDestination(d);
      setTimeout(() => {
        calculateRoutes();
      }, 50);
    }
  };

  // If no source/destination or routes calculated
  if (!dijkstraResult || dijkstraSteps.length === 0) {
    return (
      <div className="bg-[var(--planner-surface)] border border-[var(--planner-border)] rounded-xl p-8 text-center space-y-6 animate-fade-in text-[var(--planner-text-primary)] transition-colors shadow-xs">
        <div className="w-14 h-14 rounded-xl bg-[var(--planner-accent-subtle)] border border-[var(--planner-border-highlight)] flex items-center justify-center mx-auto text-[var(--planner-accent-text)]">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <h3 className="text-xl font-bold text-[var(--planner-text-primary)] mb-2">{t('visualizer.labTitle')}</h3>
          <p className="text-sm text-[var(--planner-text-secondary)] max-w-md mx-auto leading-relaxed">
            {t('visualizer.labSubtitle')}
          </p>
        </div>

        <div className="pt-4 border-t border-[var(--planner-border-subtle)] max-w-md mx-auto">
          <p className="text-xs uppercase tracking-wider text-[var(--planner-text-muted)] font-semibold mb-3 font-mono">{t('visualizer.tryBenchmark')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
            <button
              type="button"
              onClick={() => handleLoadPreset('KASHMERE_GATE', 'BOTANICAL_GARDEN')}
              className="p-3 bg-[var(--planner-surface-subtle)] hover:bg-[var(--planner-surface-hover)] border border-[var(--planner-border)] rounded-lg transition-colors text-xs"
            >
              <div className="flex items-center gap-1.5 font-medium text-[var(--planner-text-primary)] mb-1">
                <span className="w-2 h-2 rounded-full bg-[#7b2d8b]" />
                <span className="w-2 h-2 rounded-full bg-[#2176ae]" />
                {t('visualizer.kgToBg')}
              </div>
              <span className="text-[var(--planner-text-secondary)] font-mono text-[11px]">{t('visualizer.kgToBgDesc')}</span>
            </button>
            <button
              type="button"
              onClick={() => handleLoadPreset('CHANDNI_CHOWK', 'KAROL_BAGH')}
              className="p-3 bg-[var(--planner-surface-subtle)] hover:bg-[var(--planner-surface-hover)] border border-[var(--planner-border)] rounded-lg transition-colors text-xs"
            >
              <div className="flex items-center gap-1.5 font-medium text-[var(--planner-text-primary)] mb-1">
                <span className="w-2 h-2 rounded-full bg-[#f4c430]" />
                <span className="w-2 h-2 rounded-full bg-[#2176ae]" />
                {t('visualizer.ccToKb')}
              </div>
              <span className="text-[var(--planner-text-secondary)] font-mono text-[11px]">{t('visualizer.ccToKbDesc')}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const srcDisplay = getStationDisplayName(source, i18n.language);
  const dstDisplay = getStationDisplayName(destination, i18n.language);

  return (
    <div className="space-y-4 animate-fade-in text-[var(--planner-text-primary)] font-sans transition-colors">
      {/* ── Visualizer Header & Mode Switcher ── */}
      <div className="bg-[var(--planner-surface)] border border-[var(--planner-border)] rounded-xl p-4 sm:p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--planner-accent-subtle)] text-[var(--planner-accent-text)] border border-[var(--planner-border-highlight)]">
                {t('visualizer.labBadge')}
              </span>
              <span className="text-xs text-[var(--planner-text-secondary)] font-mono">{t('visualizer.graphVertexLabel')}</span>
            </div>
            <h3 className="text-lg font-bold text-[var(--planner-text-primary)]">
              {srcDisplay} <span className="text-[var(--planner-text-muted)]">→</span> {dstDisplay}
            </h3>
          </div>

          <button
            id="btn-vis-return-map"
            type="button"
            onClick={() => setActiveView('map')}
            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--planner-surface-subtle)] hover:bg-[var(--planner-surface-hover)] border border-[var(--planner-border)] flex items-center gap-1.5 text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)] transition-colors font-mono shadow-xs"
          >
            <svg className="w-4 h-4 text-[var(--planner-accent-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            {t('visualizer.returnToMap')}
          </button>
        </div>

        {/* Algorithm Lab Mode Selector */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--planner-surface-subtle)] border border-[var(--planner-border)] w-fit shadow-xs">
          <button
            type="button"
            id="tab-mode-dijkstra"
            onClick={() => setMode('dijkstra')}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
              mode === 'dijkstra'
                ? 'bg-[var(--planner-tab-active-bg)] text-[var(--planner-tab-active-text)] border border-[var(--planner-border)] shadow-xs font-semibold'
                : 'text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)] hover:bg-[var(--planner-surface-hover)]'
            }`}
          >
            {t('visualizer.dijkstraMode')}
          </button>
          <button
            type="button"
            id="tab-mode-bfs"
            onClick={() => setMode('bfs')}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
              mode === 'bfs'
                ? 'bg-[var(--planner-tab-active-bg)] text-[var(--planner-tab-active-text)] border border-[var(--planner-border)] shadow-xs font-semibold'
                : 'text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)] hover:bg-[var(--planner-surface-hover)]'
            }`}
          >
            {t('visualizer.bfsMode')}
          </button>
          <button
            type="button"
            id="tab-mode-comparison"
            onClick={() => setMode('comparison')}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
              mode === 'comparison'
                ? 'bg-[var(--planner-tab-active-bg)] text-[var(--planner-tab-active-text)] border border-[var(--planner-border)] shadow-xs font-semibold'
                : 'text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)] hover:bg-[var(--planner-surface-hover)]'
            }`}
          >
            {t('visualizer.comparisonMode')}
          </button>
        </div>
      </div>

      {/* ── MODE 1 & 2: STEP-BY-STEP SCRUBBER & ANIMATION (DIJKSTRA / BFS) ── */}
      {mode !== 'comparison' && (
        <>
          {/* Playback Controls & Scrubber */}
          <div className="bg-[var(--planner-surface)] border border-[var(--planner-border)] rounded-xl p-4 sm:p-5 space-y-4 shadow-xs">
            <div>
              <div className="flex items-center justify-between text-xs text-[var(--planner-text-secondary)] mb-2 font-mono">
                <span>
                  {mode === 'dijkstra' ? 'MinHeap Step' : 'FIFO Step'}{' '}
                  <strong className="text-[var(--planner-text-primary)] font-mono">{currentStepIndex + 1}</strong> {t('visualizer.of')}{' '}
                  <strong className="text-[var(--planner-text-secondary)] font-mono">{totalSteps}</strong>
                </span>
                <span className="text-[var(--planner-text-muted)] font-mono">
                  {Math.round(((currentStepIndex + 1) / Math.max(1, totalSteps)) * 100)}% explored
                </span>
              </div>
              <input
                id="input-vis-scrubber"
                type="range"
                min={0}
                max={Math.max(0, totalSteps - 1)}
                value={currentStepIndex}
                onChange={(e) => {
                  setCurrentStepIndex(Number(e.target.value));
                  setIsPlaying(false);
                }}
                aria-label="Algorithm step scrubber"
                className="w-full h-2 bg-[var(--planner-surface-subtle)] border border-[var(--planner-border)] rounded-lg appearance-none cursor-pointer accent-[var(--planner-accent)]"
              />
            </div>

            {/* Toolbar Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  id="btn-vis-rewind"
                  onClick={() => {
                    setCurrentStepIndex(0);
                    setIsPlaying(false);
                  }}
                  disabled={currentStepIndex === 0}
                  title={t('visualizer.reset')}
                  className="p-2 rounded-lg bg-[var(--planner-surface-subtle)] hover:bg-[var(--planner-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)] transition-colors border border-[var(--planner-border)] shadow-xs"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                </button>

                <button
                  type="button"
                  id="btn-vis-prev"
                  onClick={() => {
                    setCurrentStepIndex((p) => Math.max(0, p - 1));
                    setIsPlaying(false);
                  }}
                  disabled={currentStepIndex === 0}
                  title={t('visualizer.stepBack')}
                  className="p-2 rounded-lg bg-[var(--planner-surface-subtle)] hover:bg-[var(--planner-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)] transition-colors border border-[var(--planner-border)] shadow-xs"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <button
                  type="button"
                  id="btn-vis-play"
                  onClick={() => {
                    if (currentStepIndex >= totalSteps - 1) {
                      setCurrentStepIndex(0);
                    }
                    setIsPlaying(!isPlaying);
                  }}
                  className="px-4 py-2 rounded-lg bg-[var(--planner-accent)] hover:opacity-90 active:opacity-100 text-white font-medium text-xs flex items-center gap-1.5 transition-opacity shadow-xs"
                >
                  {isPlaying ? (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                      </svg>
                      {t('visualizer.pause')}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      {currentStepIndex >= totalSteps - 1 ? t('visualizer.reset') : t('visualizer.play')}
                    </>
                  )}
                </button>

                <button
                  type="button"
                  id="btn-vis-next"
                  onClick={() => {
                    setCurrentStepIndex((p) => Math.min(totalSteps - 1, p + 1));
                    setIsPlaying(false);
                  }}
                  disabled={currentStepIndex >= totalSteps - 1}
                  title={t('visualizer.stepForward')}
                  className="p-2 rounded-lg bg-[var(--planner-surface-subtle)] hover:bg-[var(--planner-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)] transition-colors border border-[var(--planner-border)] shadow-xs"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                <button
                  type="button"
                  id="btn-vis-end"
                  onClick={() => {
                    setCurrentStepIndex(Math.max(0, totalSteps - 1));
                    setIsPlaying(false);
                  }}
                  disabled={currentStepIndex >= totalSteps - 1}
                  title="Jump to final path"
                  className="p-2 rounded-lg bg-[var(--planner-surface-subtle)] hover:bg-[var(--planner-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)] transition-colors border border-[var(--planner-border)] shadow-xs"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Speed Selector */}
              <div className="flex items-center gap-1 bg-[var(--planner-surface-subtle)] border border-[var(--planner-border)] rounded-lg p-1 text-xs shadow-xs">
                <span className="text-[var(--planner-text-muted)] text-[10px] uppercase font-mono font-semibold px-1">{t('visualizer.speed')}:</span>
                {[0.5, 1, 2, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpeed(s)}
                    className={`px-2 py-0.5 rounded font-mono text-xs transition-colors ${
                      speed === s ? 'bg-[var(--planner-accent)] text-white font-medium' : 'text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)]'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Active Step Inspection Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Step Explanation Card */}
            <div className="bg-[var(--planner-surface)] border border-[var(--planner-border)] rounded-xl p-4 sm:p-5 space-y-3.5 shadow-xs">
              <div className="flex items-center justify-between border-b border-[var(--planner-border-subtle)] pb-2.5">
                <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--planner-text-secondary)]">
                  {mode === 'dijkstra' ? 'MinHeap Node Finalization' : 'FIFO Breadth Extraction'}
                </h4>
                {visitedStation?.id === destination?.id && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 font-medium">
                    {t('visualizer.statusCompleted')}
                  </span>
                )}
              </div>

              {visitedStation ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor:
                          visitedStation.lines.length > 0
                            ? LINE_COLORS[visitedStation.lines[0]]
                            : '#3b82f6',
                      }}
                    />
                    <div>
                      <h4 className="text-sm font-bold text-[var(--planner-text-primary)]">
                        {getStationDisplayName(visitedStation, i18n.language)}
                      </h4>
                      <p className="text-xs text-[var(--planner-text-secondary)] font-mono">
                        Lines: {visitedStation.lines.join(', ')}{' '}
                        {visitedStation.isInterchange && `• [${t('search.interchangeBadge')}]`}
                      </p>
                    </div>
                  </div>

                  <div className="bg-[var(--planner-surface-subtle)] border border-[var(--planner-border-subtle)] rounded-lg p-3 text-xs text-[var(--planner-text-secondary)] leading-relaxed space-y-1.5 font-sans">
                    {mode === 'dijkstra' ? (
                      <>
                        <p>
                          <strong className="text-[var(--planner-text-primary)]">Extracted from MinHeap:</strong> &quot;{getStationDisplayName(visitedStation, i18n.language)}&quot; with lowest tentative cost of{' '}
                          <span className="text-amber-500 font-mono font-medium">
                            {formatDuration(currentDijkstraStep?.distances[visitedStation.id] ?? 0)}
                          </span>.
                        </p>
                        <p className="text-[11px] text-[var(--planner-text-muted)]">
                          Because edge travel times and concourse transfer penalties are strictly non-negative, this tentative distance is guaranteed optimal and is marked <strong className="text-[var(--planner-text-primary)]">Finalized</strong>.
                        </p>
                      </>
                    ) : (
                      <>
                        <p>
                          <strong className="text-[var(--planner-text-primary)]">Popped from FIFO Queue:</strong> &quot;{getStationDisplayName(visitedStation, i18n.language)}&quot; at breadth depth{' '}
                          <span className="text-[var(--planner-accent-text)] font-mono font-bold">
                            {currentBFSStep?.currentDepth ?? 0} hops
                          </span>{' '}
                          from origin.
                        </p>
                        <p className="text-[11px] text-[var(--planner-text-muted)]">
                          BFS explores unweighted concentric circles. It treats every inter-station track connection as exactly 1 unit of distance.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[var(--planner-text-muted)] font-mono">No active node snapshot.</p>
              )}

              {/* State Counters */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--planner-border-subtle)] text-center font-mono">
                <div className="bg-[var(--planner-surface-subtle)] rounded-lg p-2 border border-[var(--planner-border-subtle)]">
                  <p className="text-lg font-bold text-emerald-500">
                    {mode === 'dijkstra'
                      ? currentDijkstraStep?.finalizedNodes.length ?? 0
                      : currentBFSStep?.visitedNodes.length ?? 0}
                  </p>
                  <p className="text-[10px] text-[var(--planner-text-secondary)] uppercase">
                    {mode === 'dijkstra' ? 'Finalized Nodes' : 'Visited Vertices'}
                  </p>
                </div>
                <div className="bg-[var(--planner-surface-subtle)] rounded-lg p-2 border border-[var(--planner-border-subtle)]">
                  <p className="text-lg font-bold text-[var(--planner-accent-text)]">
                    {mode === 'dijkstra'
                      ? currentDijkstraStep?.priorityQueue.length ?? 0
                      : currentBFSStep?.queue.length ?? 0}
                  </p>
                  <p className="text-[10px] text-[var(--planner-text-secondary)] uppercase">
                    {mode === 'dijkstra' ? 'In MinHeap Queue' : 'In FIFO Queue'}
                  </p>
                </div>
              </div>
            </div>

            {/* Live Queue Inspection Card */}
            <div className="bg-[var(--planner-surface)] border border-[var(--planner-border)] rounded-xl p-4 sm:p-5 space-y-3.5 shadow-xs font-sans">
              <div className="flex items-center justify-between border-b border-[var(--planner-border-subtle)] pb-2.5">
                <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--planner-text-secondary)]">
                  {mode === 'dijkstra' ? 'MinHeap Priority Queue Frontier' : 'FIFO Queue Frontier'}
                </h4>
                <span className="text-[11px] text-[var(--planner-text-muted)] font-mono">
                  {mode === 'dijkstra'
                    ? `${currentDijkstraStep?.priorityQueue.length ?? 0} candidate(s)`
                    : `${currentBFSStep?.queue.length ?? 0} in queue`}
                </span>
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {mode === 'dijkstra' ? (
                  currentDijkstraStep?.priorityQueue && currentDijkstraStep.priorityQueue.length > 0 ? (
                    currentDijkstraStep.priorityQueue.slice(0, 8).map((item, idx) => {
                      const st = metroGraph.getStation(item.node);
                      return (
                        <div
                          key={`${item.node}-${idx}`}
                          className={`flex items-center justify-between px-3 py-1.5 rounded-md text-xs border ${
                            idx === 0
                              ? 'bg-[var(--planner-accent-subtle)] border-[var(--planner-border-highlight)] text-[var(--planner-text-primary)] font-medium'
                              : 'bg-[var(--planner-surface-subtle)] border-[var(--planner-border-subtle)] text-[var(--planner-text-secondary)]'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="text-[10px] text-[var(--planner-text-muted)] font-mono w-4">#{idx + 1}</span>
                            <span className="truncate">{st ? getStationDisplayName(st, i18n.language) : item.node}</span>
                          </div>
                          <span className="font-mono text-amber-500 ml-2 flex-shrink-0 text-xs">
                            {formatDuration(item.dist)}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-[var(--planner-text-muted)] font-mono italic py-4 text-center">Queue empty</p>
                  )
                ) : (
                  currentBFSStep?.queue && currentBFSStep.queue.length > 0 ? (
                    currentBFSStep.queue.slice(0, 8).map((nodeId, idx) => {
                      const st = metroGraph.getStation(nodeId);
                      return (
                        <div
                          key={`${nodeId}-${idx}`}
                          className={`flex items-center justify-between px-3 py-1.5 rounded-md text-xs border ${
                            idx === 0
                              ? 'bg-[var(--planner-accent-subtle)] border-[var(--planner-border-highlight)] text-[var(--planner-text-primary)] font-medium'
                              : 'bg-[var(--planner-surface-subtle)] border-[var(--planner-border-subtle)] text-[var(--planner-text-secondary)]'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="text-[10px] text-[var(--planner-text-muted)] font-mono w-4">#{idx + 1}</span>
                            <span className="truncate">{st ? getStationDisplayName(st, i18n.language) : nodeId}</span>
                          </div>
                          <span className="font-mono text-[var(--planner-accent-text)] ml-2 flex-shrink-0 text-xs">
                            Depth {currentBFSStep.hopDistances[nodeId] ?? '?'}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-[var(--planner-text-muted)] font-mono italic py-4 text-center">FIFO Queue empty</p>
                  )
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── MODE 3: SIDE-BY-SIDE COMPARISON LAB ── */}
      {mode === 'comparison' && bfsResult && dijkstraResult?.route && (
        <div className="space-y-4 font-sans">
          {/* Comparison Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Dijkstra Column */}
            <div className="bg-[var(--planner-surface)] border border-blue-500/30 rounded-xl p-4 sm:p-5 space-y-3.5 shadow-xs">
              <div className="flex items-center justify-between border-b border-[var(--planner-border-subtle)] pb-2.5">
                <div>
                  <h4 className="text-sm font-bold text-[var(--planner-text-primary)]">Dijkstra&apos;s Algorithm</h4>
                  <p className="text-xs text-[var(--planner-accent-text)] font-mono">Weighted MinHeap Priority Queue</p>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-600/20 text-blue-500 border border-blue-500/30">
                  O((V+E)logV)
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center font-mono">
                <div className="p-2 rounded-lg bg-[var(--planner-surface-subtle)] border border-[var(--planner-border-subtle)]">
                  <span className="text-[10px] text-[var(--planner-text-muted)] block">{t('hero.estimatedTime')}</span>
                  <span className="text-sm font-bold text-emerald-500 block mt-0.5">
                    {formatDuration(dijkstraResult.route.totalTimeSeconds)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-[var(--planner-surface-subtle)] border border-[var(--planner-border-subtle)]">
                  <span className="text-[10px] text-[var(--planner-text-muted)] block">{t('hero.lineChanges')}</span>
                  <span className="text-sm font-bold text-amber-500 block mt-0.5">
                    {dijkstraResult.route.interchangeCount}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-[var(--planner-surface-subtle)] border border-[var(--planner-border-subtle)]">
                  <span className="text-[10px] text-[var(--planner-text-muted)] block">{t('planner.stations')}</span>
                  <span className="text-sm font-bold text-[var(--planner-text-primary)] block mt-0.5">
                    {dijkstraResult.route.totalStations}
                  </span>
                </div>
              </div>

              <div className="text-xs text-[var(--planner-text-secondary)] space-y-1.5 bg-[var(--planner-surface-subtle)] p-3 rounded-lg border border-[var(--planner-border-subtle)] leading-relaxed">
                <p>
                  <strong className="text-[var(--planner-text-primary)]">Edge Weights:</strong> Evaluates actual inter-station minutes + 180s pedestrian interchange walking friction.
                </p>
                <p className="text-[var(--planner-text-muted)] text-[11px]">
                  <strong>Exploration:</strong> Directed along fast transit corridors. Explored{' '}
                  <span className="text-[var(--planner-accent-text)] font-mono font-semibold">{dijkstraSteps.length} nodes</span>.
                </p>
              </div>
            </div>

            {/* BFS Column */}
            <div className="bg-[var(--planner-surface)] border border-purple-500/30 rounded-xl p-4 sm:p-5 space-y-3.5 shadow-xs">
              <div className="flex items-center justify-between border-b border-[var(--planner-border-subtle)] pb-2.5">
                <div>
                  <h4 className="text-sm font-bold text-[var(--planner-text-primary)]">Breadth-First Search (BFS)</h4>
                  <p className="text-xs text-purple-500 font-mono">Unweighted FIFO Queue</p>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-600/20 text-purple-500 border border-purple-500/30">
                  O(V+E)
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center font-mono">
                <div className="p-2 rounded-lg bg-[var(--planner-surface-subtle)] border border-[var(--planner-border-subtle)]">
                  <span className="text-[10px] text-[var(--planner-text-muted)] block">{t('hero.estimatedTime')}</span>
                  <span className="text-sm font-bold text-purple-500 block mt-0.5">
                    {formatDuration(bfsResult.route?.totalTimeSeconds ?? 0)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-[var(--planner-surface-subtle)] border border-[var(--planner-border-subtle)]">
                  <span className="text-[10px] text-[var(--planner-text-muted)] block">{t('hero.lineChanges')}</span>
                  <span className="text-sm font-bold text-amber-500 block mt-0.5">
                    {bfsResult.route?.interchangeCount ?? 0}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-[var(--planner-surface-subtle)] border border-[var(--planner-border-subtle)]">
                  <span className="text-[10px] text-[var(--planner-text-muted)] block">Hop Depth</span>
                  <span className="text-sm font-bold text-[var(--planner-text-primary)] block mt-0.5">
                    {bfsResult.metrics.totalHops} hops
                  </span>
                </div>
              </div>

              <div className="text-xs text-[var(--planner-text-secondary)] space-y-1.5 bg-[var(--planner-surface-subtle)] p-3 rounded-lg border border-[var(--planner-border-subtle)] leading-relaxed">
                <p>
                  <strong className="text-[var(--planner-text-primary)]">Edge Weights:</strong> Unweighted (each track segment = 1 unit). Does not account for travel times or transfers.
                </p>
                <p className="text-[var(--planner-text-muted)] text-[11px]">
                  <strong>Exploration:</strong> Expands uniformly in radial hops. Explored{' '}
                  <span className="text-purple-500 font-mono font-semibold">{bfsResult.metrics.exploredNodesCount} nodes</span> with peak queue size{' '}
                  <span className="text-purple-500 font-mono font-semibold">{bfsResult.metrics.queuePeakSize}</span>.
                </p>
              </div>
            </div>
          </div>

          {/* Educational Engineering Takeaway */}
          <div className="p-3.5 rounded-lg bg-[var(--planner-surface-subtle)] border border-[var(--planner-border-subtle)] text-xs text-[var(--planner-text-secondary)] space-y-1.5 leading-relaxed">
            <h5 className="font-bold text-[var(--planner-text-primary)] flex items-center gap-2">
              <span>💡</span>
              Algorithmic Takeaway for Metropolitan Transit Systems
            </h5>
            <p>
              While <strong>BFS</strong> is asymptotically faster and optimal for pure unweighted hop count (station stops), it fails to capture the true cost of metropolitan journeys because switching lines requires ascending/descending concourses and waiting for the next train (~3 to 5 minutes).
            </p>
            <p className="text-[11px] text-[var(--planner-text-muted)]">
              <strong>Dijkstra&apos;s algorithm</strong> incorporating a calibrated 180s concourse friction penalty ensures passengers are not recommended routes that save 1 stop but require 2 tedious line transfers.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
