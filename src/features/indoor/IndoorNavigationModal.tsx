import { useState, useEffect, useRef } from 'react';
import type { Station } from '@/core/graph/types';
import {
  getStationIndoorLayout,
  type StationIndoorLayout,
  type IndoorWayfindingPath,
} from '@/core/data/indoorData';
import { LINE_COLORS, LINE_DISPLAY_NAMES } from '@/utils/lineColors';

interface IndoorNavigationModalProps {
  station: Station | null;
  onClose: () => void;
  isOpen: boolean;
}

export function IndoorNavigationModal({ station, onClose, isOpen }: IndoorNavigationModalProps) {
  const layout: StationIndoorLayout | null = station
    ? getStationIndoorLayout(station.id, station.name, station.lines, station.isInterchange)
    : null;

  const [customLevelId, setCustomLevelId] = useState<string | null>(null);
  const [selectedPathIndex, setSelectedPathIndex] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'wayfinding' | 'levels' | 'gates'>('wayfinding');

  const selectedLevelId = customLevelId ?? layout?.levels[0]?.id ?? '';

  // Reset tab/path when station changes
  const prevStationIdRef = useRef<string | null>(null);
  if (station && station.id !== prevStationIdRef.current) {
    prevStationIdRef.current = station.id;
    setCustomLevelId(null);
    setSelectedPathIndex(0);
    setActiveTab('wayfinding');
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !station || !layout) return null;

  const currentLevel = layout.levels.find((l) => l.id === selectedLevelId) ?? layout.levels[0];
  const activePath: IndoorWayfindingPath | null = layout.paths[selectedPathIndex] ?? layout.paths[0] ?? null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="indoor-nav-title"
      className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in"
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-navy-950 border border-white/15 rounded-2xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-white/10 bg-navy-900/95 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="indoor-nav-title" className="text-base sm:text-lg font-bold font-display text-white">
                  {layout.stationName}
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-cyan-300 border border-blue-500/30">
                  Indoor & Accessibility Guide
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {station.lines.map((l) => (
                  <span
                    key={l}
                    className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: `${LINE_COLORS[l]}20`,
                      color: LINE_COLORS[l],
                      border: `1px solid ${LINE_COLORS[l]}40`,
                    }}
                  >
                    {LINE_DISPLAY_NAMES[l]}
                  </span>
                ))}
                {station.isInterchange && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Interchange Hub
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close indoor navigation modal"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Verification & Demonstration Banner */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-5 py-2.5 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-bold">ℹ️ Demonstration Model:</span>
            <span>{layout.attribution}</span>
          </div>
          <span className="text-[10px] font-mono text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30 shrink-0 hidden sm:inline">
            DMRC Blueprint Simulation
          </span>
        </div>

        {/* Accessibility Features Strip */}
        <div className="bg-navy-900/60 px-5 py-2.5 border-b border-white/[0.06] flex flex-wrap items-center gap-4 text-xs">
          <span className="text-[11px] font-mono uppercase text-gray-400 font-semibold">
            Station Facilities:
          </span>
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Elevators to all platforms</span>
          </div>
          <div className="flex items-center gap-1.5 text-cyan-400">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>Tactile paving for visually impaired</span>
          </div>
          <div className="flex items-center gap-1.5 text-purple-400">
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            <span>Wheelchair accessible AFC smart gates</span>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="px-5 pt-3 border-b border-white/[0.08] flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('wayfinding')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all border-b-2 ${
              activeTab === 'wayfinding'
                ? 'text-cyan-300 border-cyan-400 bg-white/5'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            Turn-by-Turn Wayfinding
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('levels')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all border-b-2 ${
              activeTab === 'levels'
                ? 'text-cyan-300 border-cyan-400 bg-white/5'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            Vertical Levels & Cross-Section
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('gates')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all border-b-2 ${
              activeTab === 'gates'
                ? 'text-cyan-300 border-cyan-400 bg-white/5'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            Entrance Gates & Landmarks ({layout.gates.length})
          </button>
        </div>

        {/* Content Area with smooth scrolling */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* TAB 1: WAYFINDING */}
          {activeTab === 'wayfinding' && (
            <div className="space-y-4">
              {/* Path Selector */}
              {layout.paths.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {layout.paths.map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPathIndex(idx)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors border ${
                        selectedPathIndex === idx
                          ? 'bg-blue-600 text-white border-blue-400'
                          : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              )}

              {activePath && (
                <div className="space-y-4">
                  {/* Active Path Header Card */}
                  <div className="p-4 rounded-xl bg-navy-900/80 border border-white/10 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-white font-display">
                        {activePath.title}
                      </h4>
                      <p className="text-xs text-gray-400 mt-0.5">
                        From: <strong className="text-gray-200">{activePath.from}</strong> ➔ To:{' '}
                        <strong className="text-gray-200">{activePath.to}</strong>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center gap-1.5">
                        <span>♿</span>
                        <span>Step-Free (Simulated Model)</span>
                      </span>
                      <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-white/5 text-gray-300 border border-white/10">
                        ~{activePath.estimatedWalkMinutes} min walk
                      </span>
                    </div>
                  </div>

                  {/* Step Timeline */}
                  <div className="space-y-3 pl-2">
                    {activePath.steps.map((step, sIdx) => {
                      const icons: Record<string, string> = {
                        entrance: '🚪',
                        security: '🛡️',
                        afc_gate: '💳',
                        lift: '🛗',
                        escalator: '🪜',
                        stairs: '🪜',
                        corridor: '🚶',
                        platform: '🚆',
                        helpdesk: 'ℹ️',
                        washroom: '🚻',
                        tactile_path: '🦯',
                      };
                      return (
                        <div key={sIdx} className="flex items-start gap-3 relative">
                          {/* Step Number & Connector */}
                          <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
                            <div className="w-8 h-8 rounded-full bg-blue-600/30 border border-blue-400 flex items-center justify-center text-xs font-bold text-cyan-300">
                              {step.stepNumber}
                            </div>
                            {sIdx < activePath.steps.length - 1 && (
                              <div className="w-0.5 h-12 bg-white/15 my-1" />
                            )}
                          </div>

                          {/* Step Content */}
                          <div className="flex-1 p-3 rounded-xl bg-navy-900/60 border border-white/[0.08]">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-[11px] font-mono text-cyan-400 flex items-center gap-1.5 uppercase font-semibold">
                                <span>{icons[step.facilityType] || '📍'}</span>
                                <span>{step.facilityType.replace('_', ' ')}</span>
                              </span>
                              <span className="text-[10px] font-mono text-gray-400 bg-white/5 px-2 py-0.5 rounded">
                                {step.level}
                              </span>
                            </div>
                            <p className="text-xs sm:text-sm text-white font-medium leading-relaxed">
                              {step.instruction}
                            </p>
                            <p className="text-xs text-amber-300/80 font-mono mt-1.5 flex items-center gap-1.5">
                              <span>🚩</span>
                              <span>Landmark: {step.landmark}</span>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: VERTICAL LEVELS & CROSS-SECTION */}
          {activeTab === 'levels' && (
            <div className="space-y-5">
              {/* Level Selector Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {layout.levels.map((lvl) => (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setCustomLevelId(lvl.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedLevelId === lvl.id
                        ? 'bg-blue-600/20 border-cyan-400 text-white shadow-glow-cyan/20'
                        : 'bg-navy-900/60 border-white/10 text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="text-xs font-mono font-bold text-cyan-300 block mb-0.5">
                      {lvl.shortCode}
                    </span>
                    <span className="text-xs font-bold text-white block truncate">
                      {lvl.name}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono mt-1 block">
                      Elevation: {lvl.elevationMeters > 0 ? `+${lvl.elevationMeters}m` : `${lvl.elevationMeters}m`}
                    </span>
                  </button>
                ))}
              </div>

              {/* Station Cross-Section Blueprint Diagram */}
              <div className="p-4 rounded-xl bg-navy-900 border border-white/10 space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <h4 className="text-xs font-mono uppercase text-gray-300 font-bold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    Station Architectural Cross-Section Blueprint
                  </h4>
                  <span className="text-[10px] font-mono text-cyan-300">
                    Active Level: {currentLevel.name}
                  </span>
                </div>

                <div className="relative w-full h-48 bg-[#02050e] rounded-lg p-2 border border-white/5 flex flex-col justify-between">
                  {layout.levels.map((lvl) => {
                    const isSelected = lvl.id === currentLevel.id;
                    return (
                      <div
                        key={lvl.id}
                        onClick={() => setCustomLevelId(lvl.id)}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border ${
                          isSelected
                            ? 'bg-blue-600/30 border-cyan-400 text-white shadow-md'
                            : 'bg-white/[0.02] border-white/5 text-gray-400 hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold w-12 text-cyan-300">
                            {lvl.shortCode}
                          </span>
                          <span className="text-xs font-medium truncate max-w-xs sm:max-w-md">
                            {lvl.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] font-mono">
                          <span className="text-emerald-400">🛗 Lift Shaft</span>
                          <span className="text-gray-400">{lvl.elevationMeters}m</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Selected Level Facilities */}
              <div className="p-4 rounded-xl bg-navy-900/60 border border-white/10 space-y-3">
                <h4 className="text-xs font-mono uppercase text-gray-400 font-bold">
                  Facilities on {currentLevel.name}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {layout.facilities
                    .filter((f) => f.levelId === currentLevel.id)
                    .map((fac) => (
                      <div
                        key={fac.id}
                        className="p-2.5 rounded-lg bg-white/5 border border-white/8 flex items-start gap-2.5"
                      >
                        <span className="text-base mt-0.5">
                          {fac.type === 'lift' ? '🛗' : fac.type === 'afc_gate' ? '💳' : 'ℹ️'}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-white">{fac.name}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">{fac.locationDetails}</p>
                        </div>
                      </div>
                    ))}
                  {layout.facilities.filter((f) => f.levelId === currentLevel.id).length === 0 && (
                    <p className="text-xs text-gray-500 italic">
                      Standard platform facilities: Braille tactile strips, passenger waiting benches, and emergency help points.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: GATES & ENTRANCES */}
          {activeTab === 'gates' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">
                Choose the nearest street entrance or landmark. Gates marked with wheelchair icons feature step-free street ramps and direct elevator connections.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {layout.gates.map((gate) => (
                  <div
                    key={gate.number}
                    className="p-3.5 rounded-xl bg-navy-900/80 border border-white/10 space-y-2 hover:border-cyan-500/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white font-display flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-blue-600/30 border border-blue-400 flex items-center justify-center text-[11px] text-cyan-300 font-mono">
                          {gate.number}
                        </span>
                        {gate.name}
                      </span>
                      <span className="text-[10px] font-mono text-gray-400 bg-white/5 px-2 py-0.5 rounded">
                        {gate.direction}
                      </span>
                    </div>

                    <p className="text-xs text-gray-300 flex items-center gap-1.5">
                      <span className="text-amber-400">📍</span>
                      <span>{gate.landmark}</span>
                    </p>

                    <div className="flex items-center gap-2 pt-1 border-t border-white/5 text-[10px] font-mono">
                      {gate.hasLift && (
                        <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          ✓ Street Elevator
                        </span>
                      )}
                      {gate.hasRamp && (
                        <span className="text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                          ✓ Wheelchair Ramp
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-navy-900/90 flex items-center justify-between text-xs text-gray-400">
          <span className="font-mono text-[11px]">
            {layout.accessibilityHighlights.dedicatedHelpdeskContact || 'DMRC Passenger Care: 155370'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium text-xs transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
}
