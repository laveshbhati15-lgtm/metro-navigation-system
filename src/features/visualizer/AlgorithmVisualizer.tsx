import { useState, useEffect, useRef, useMemo } from 'react';
import { useJourneyStore } from '@/store/journeyStore';
import { metroGraph } from '@/core/graph/MetroGraph';
import { bfs, type BFSResult } from '@/core/algorithm/bfs';
import { LINE_COLORS } from '@/utils/lineColors';
import { formatDuration } from '@/utils/formatters';
import type { Station } from '@/core/graph/types';

export type AlgorithmMode = 'dijkstra' | 'bfs' | 'comparison';

export function AlgorithmVisualizer() {
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
      <div className="glass-card p-8 text-center space-y-6 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mx-auto text-blue-400">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <h3 className="text-xl font-bold font-display text-white mb-2">Transit Algorithm Lab</h3>
          <p className="text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
            Select an origin and destination station in the Journey Planner and click <strong>&quot;Calculate Optimal Route&quot;</strong> to visually compare Dijkstra&apos;s algorithm and Breadth-First Search (BFS) on the Delhi Metro network.
          </p>
        </div>

        <div className="pt-4 border-t border-white/10 max-w-md mx-auto">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">Try A Benchmark Journey</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
            <button
              type="button"
              onClick={() => handleLoadPreset('KASHMERE_GATE', 'BOTANICAL_GARDEN')}
              className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors text-xs"
            >
              <div className="flex items-center gap-1.5 font-medium text-white mb-1">
                <span className="w-2 h-2 rounded-full bg-[#7b2d8b]" />
                <span className="w-2 h-2 rounded-full bg-[#2176ae]" />
                Kashmere Gate → Botanical Garden
              </div>
              <span className="text-gray-500">Violet to Blue interchange</span>
            </button>
            <button
              type="button"
              onClick={() => handleLoadPreset('CHANDNI_CHOWK', 'KAROL_BAGH')}
              className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors text-xs"
            >
              <div className="flex items-center gap-1.5 font-medium text-white mb-1">
                <span className="w-2 h-2 rounded-full bg-[#f4c430]" />
                <span className="w-2 h-2 rounded-full bg-[#2176ae]" />
                Chandni Chowk → Karol Bagh
              </div>
              <span className="text-gray-500">Rajiv Chowk transfer hub</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Visualizer Header & Mode Switcher ── */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-cyan-300 border border-blue-500/30">
                Algorithm Lab
              </span>
              <span className="text-xs text-gray-400 font-mono">124-Vertex Transit Graph G = (V, E)</span>
            </div>
            <h3 className="text-lg font-bold font-display text-white">
              {source?.name} <span className="text-gray-500">→</span> {destination?.name}
            </h3>
          </div>

          <button
            id="btn-vis-return-map"
            type="button"
            onClick={() => setActiveView('map')}
            className="btn-ghost text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-gray-300 hover:text-white"
          >
            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Return to Map
          </button>
        </div>

        {/* Algorithm Lab Mode Selector */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-navy-950/80 border border-white/10 w-fit">
          <button
            type="button"
            id="tab-mode-dijkstra"
            onClick={() => setMode('dijkstra')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mode === 'dijkstra'
                ? 'bg-blue-600 text-white shadow-glow-blue'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Dijkstra (Weighted MinHeap)
          </button>
          <button
            type="button"
            id="tab-mode-bfs"
            onClick={() => setMode('bfs')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mode === 'bfs'
                ? 'bg-blue-600 text-white shadow-glow-blue'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            BFS (Unweighted FIFO Queue)
          </button>
          <button
            type="button"
            id="tab-mode-comparison"
            onClick={() => setMode('comparison')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mode === 'comparison'
                ? 'bg-purple-600 text-white shadow-glow-purple'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Side-by-Side Comparison Lab
          </button>
        </div>
      </div>

      {/* ── MODE 1 & 2: STEP-BY-STEP SCRUBBER & ANIMATION (DIJKSTRA / BFS) ── */}
      {mode !== 'comparison' && (
        <>
          {/* Playback Controls & Scrubber */}
          <div className="glass-card p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                <span>
                  {mode === 'dijkstra' ? 'MinHeap Extraction Step' : 'FIFO Queue Step'}{' '}
                  <strong className="text-white font-mono">{currentStepIndex + 1}</strong> of{' '}
                  <strong className="text-gray-300 font-mono">{totalSteps}</strong>
                </span>
                <span className="text-gray-400 font-mono">
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
                className="w-full h-2 bg-navy-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
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
                  title="Reset to first step"
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 hover:text-white transition-colors"
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
                  title="Previous step"
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 hover:text-white transition-colors"
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
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-1.5 transition-colors shadow-lg shadow-blue-500/20"
                >
                  {isPlaying ? (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                      </svg>
                      Pause
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      {currentStepIndex >= totalSteps - 1 ? 'Replay' : 'Play'}
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
                  title="Next step"
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 hover:text-white transition-colors"
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
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Speed Selector */}
              <div className="flex items-center gap-1 bg-navy-800 border border-white/10 rounded-lg p-1 text-xs">
                <span className="text-gray-400 text-[10px] uppercase font-semibold px-1">Speed:</span>
                {[0.5, 1, 2, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpeed(s)}
                    className={`px-2 py-0.5 rounded font-medium transition-colors ${
                      speed === s ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Active Step Inspection Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Step Explanation Card */}
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                  {mode === 'dijkstra' ? 'MinHeap Node Finalization' : 'FIFO Breadth Extraction'}
                </h4>
                {visitedStation?.id === destination?.id && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">
                    Target Reached
                  </span>
                )}
              </div>

              {visitedStation ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor:
                          visitedStation.lines.length > 0
                            ? LINE_COLORS[visitedStation.lines[0]]
                            : '#3b82f6',
                      }}
                    />
                    <div>
                      <h4 className="text-base font-bold text-white">{visitedStation.name}</h4>
                      <p className="text-xs text-gray-400">
                        Lines: {visitedStation.lines.join(', ')}{' '}
                        {visitedStation.isInterchange && '• [Interchange Station]'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white/5 border border-white/8 rounded-xl p-3.5 text-xs text-gray-300 leading-relaxed space-y-2">
                    {mode === 'dijkstra' ? (
                      <>
                        <p>
                          <strong>Extracted from MinHeap:</strong> &quot;{visitedStation.name}&quot; with lowest tentative travel cost of{' '}
                          <span className="text-amber-300 font-medium">
                            {formatDuration(currentDijkstraStep?.distances[visitedStation.id] ?? 0)}
                          </span>.
                        </p>
                        <p>
                          Because edge travel times and concourse transfer penalties are strictly non-negative, this tentative distance is guaranteed optimal and is marked <strong>Finalized</strong>.
                        </p>
                      </>
                    ) : (
                      <>
                        <p>
                          <strong>Popped from FIFO Queue:</strong> &quot;{visitedStation.name}&quot; at breadth depth{' '}
                          <span className="text-cyan-300 font-mono font-bold">
                            {currentBFSStep?.currentDepth ?? 0} hops
                          </span>{' '}
                          from origin.
                        </p>
                        <p>
                          BFS explores unweighted concentric circles. It treats every inter-station track connection as exactly 1 unit of distance regardless of actual speed or transfer walk.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500">No active node snapshot.</p>
              )}

              {/* State Counters */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-center">
                <div className="bg-navy-800 rounded-lg p-2.5">
                  <p className="text-lg font-bold text-emerald-400 font-mono">
                    {mode === 'dijkstra'
                      ? currentDijkstraStep?.finalizedNodes.length ?? 0
                      : currentBFSStep?.visitedNodes.length ?? 0}
                  </p>
                  <p className="text-[11px] text-gray-400 uppercase font-medium">
                    {mode === 'dijkstra' ? 'Finalized Nodes' : 'Visited Vertices'}
                  </p>
                </div>
                <div className="bg-navy-800 rounded-lg p-2.5">
                  <p className="text-lg font-bold text-blue-400 font-mono">
                    {mode === 'dijkstra'
                      ? currentDijkstraStep?.priorityQueue.length ?? 0
                      : currentBFSStep?.queue.length ?? 0}
                  </p>
                  <p className="text-[11px] text-gray-400 uppercase font-medium">
                    {mode === 'dijkstra' ? 'In MinHeap Queue' : 'In FIFO Queue'}
                  </p>
                </div>
              </div>
            </div>

            {/* Live Queue Inspection Card */}
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                  {mode === 'dijkstra' ? 'MinHeap Priority Queue Frontier' : 'FIFO Queue Frontier'}
                </h4>
                <span className="text-xs text-gray-500 font-mono">
                  {mode === 'dijkstra'
                    ? `${currentDijkstraStep?.priorityQueue.length ?? 0} candidate(s)`
                    : `${currentBFSStep?.queue.length ?? 0} in queue`}
                </span>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {mode === 'dijkstra' ? (
                  currentDijkstraStep?.priorityQueue && currentDijkstraStep.priorityQueue.length > 0 ? (
                    currentDijkstraStep.priorityQueue.slice(0, 8).map((item, idx) => {
                      const st = metroGraph.getStation(item.node);
                      return (
                        <div
                          key={`${item.node}-${idx}`}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs border ${
                            idx === 0
                              ? 'bg-blue-600/20 border-blue-500/40 text-white font-medium'
                              : 'bg-white/5 border-white/8 text-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="text-[10px] text-gray-500 font-mono w-4">#{idx + 1}</span>
                            <span className="truncate">{st?.name ?? item.node}</span>
                          </div>
                          <span className="font-mono text-amber-300 ml-2 flex-shrink-0">
                            {formatDuration(item.dist)}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-gray-500 italic py-4 text-center">Queue empty</p>
                  )
                ) : (
                  currentBFSStep?.queue && currentBFSStep.queue.length > 0 ? (
                    currentBFSStep.queue.slice(0, 8).map((nodeId, idx) => {
                      const st = metroGraph.getStation(nodeId);
                      return (
                        <div
                          key={`${nodeId}-${idx}`}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs border ${
                            idx === 0
                              ? 'bg-blue-600/20 border-blue-500/40 text-white font-medium'
                              : 'bg-white/5 border-white/8 text-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="text-[10px] text-gray-500 font-mono w-4">#{idx + 1}</span>
                            <span className="truncate">{st?.name ?? nodeId}</span>
                          </div>
                          <span className="font-mono text-cyan-300 ml-2 flex-shrink-0">
                            Depth {currentBFSStep.hopDistances[nodeId] ?? '?'}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-gray-500 italic py-4 text-center">FIFO Queue empty</p>
                  )
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── MODE 3: SIDE-BY-SIDE COMPARISON LAB ── */}
      {mode === 'comparison' && bfsResult && dijkstraResult?.route && (
        <div className="space-y-6">
          {/* Comparison Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Dijkstra Column */}
            <div className="glass-card p-5 border border-blue-500/30 bg-navy-900/90 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <h4 className="text-base font-bold text-white font-display">Dijkstra&apos;s Algorithm</h4>
                  <p className="text-xs text-blue-300 font-mono">Weighted MinHeap Priority Queue</p>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  O((V+E)logV)
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-lg bg-navy-800/80 border border-white/5">
                  <span className="text-[10px] text-gray-400 font-mono block">Estimated Time</span>
                  <span className="text-sm font-bold text-emerald-400 block mt-0.5 font-display">
                    {formatDuration(dijkstraResult.route.totalTimeSeconds)}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-navy-800/80 border border-white/5">
                  <span className="text-[10px] text-gray-400 font-mono block">Line Transfers</span>
                  <span className="text-sm font-bold text-amber-300 block mt-0.5 font-display">
                    {dijkstraResult.route.interchangeCount}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-navy-800/80 border border-white/5">
                  <span className="text-[10px] text-gray-400 font-mono block">Stations</span>
                  <span className="text-sm font-bold text-white block mt-0.5 font-display">
                    {dijkstraResult.route.totalStations}
                  </span>
                </div>
              </div>

              <div className="text-xs text-gray-300 space-y-2 bg-white/5 p-3 rounded-xl border border-white/5">
                <p>
                  <strong>Edge Weights:</strong> Evaluates actual inter-station minutes + 180s pedestrian interchange walking friction.
                </p>
                <p>
                  <strong>Exploration:</strong> Directed along fast transit corridors before penalizing line changes. Explored{' '}
                  <span className="text-cyan-300 font-mono font-bold">{dijkstraSteps.length} nodes</span>.
                </p>
              </div>
            </div>

            {/* BFS Column */}
            <div className="glass-card p-5 border border-purple-500/30 bg-navy-900/90 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <h4 className="text-base font-bold text-white font-display">Breadth-First Search (BFS)</h4>
                  <p className="text-xs text-purple-300 font-mono">Unweighted FIFO Queue</p>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  O(V+E)
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-lg bg-navy-800/80 border border-white/5">
                  <span className="text-[10px] text-gray-400 font-mono block">Estimated Time</span>
                  <span className="text-sm font-bold text-purple-300 block mt-0.5 font-display">
                    {formatDuration(bfsResult.route?.totalTimeSeconds ?? 0)}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-navy-800/80 border border-white/5">
                  <span className="text-[10px] text-gray-400 font-mono block">Line Transfers</span>
                  <span className="text-sm font-bold text-amber-300 block mt-0.5 font-display">
                    {bfsResult.route?.interchangeCount ?? 0}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-navy-800/80 border border-white/5">
                  <span className="text-[10px] text-gray-400 font-mono block">Hop Depth</span>
                  <span className="text-sm font-bold text-white block mt-0.5 font-display">
                    {bfsResult.metrics.totalHops} hops
                  </span>
                </div>
              </div>

              <div className="text-xs text-gray-300 space-y-2 bg-white/5 p-3 rounded-xl border border-white/5">
                <p>
                  <strong>Edge Weights:</strong> Unweighted (each track segment = 1 unit). Does not account for physical travel times or transfer friction.
                </p>
                <p>
                  <strong>Exploration:</strong> Expands uniformly in radial hops. Explored{' '}
                  <span className="text-purple-300 font-mono font-bold">{bfsResult.metrics.exploredNodesCount} nodes</span> with peak queue size{' '}
                  <span className="text-purple-300 font-mono font-bold">{bfsResult.metrics.queuePeakSize}</span>.
                </p>
              </div>
            </div>
          </div>

          {/* Educational Engineering Takeaway */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950/40 via-purple-950/40 to-navy-950/40 border border-cyan-500/30 text-xs text-gray-300 space-y-2">
            <h5 className="font-bold text-white flex items-center gap-2">
              <span className="text-base">💡</span>
              Algorithmic Takeaway for Metropolitan Transit Systems
            </h5>
            <p className="leading-relaxed">
              While <strong>BFS</strong> is asymptotically faster and optimal for pure unweighted hop count (station stops), it fails to capture the true cost of metropolitan journeys because switching lines requires ascending/descending escalators, navigating pedestrian concourses, and waiting for the next train (~3 to 5 minutes).
            </p>
            <p className="leading-relaxed">
              <strong>Dijkstra&apos;s algorithm</strong> incorporating a calibrated 180s concourse friction penalty ensures passengers are not recommended routes that save 1 stop but require 2 tedious line transfers.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
