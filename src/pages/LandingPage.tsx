/**
 * LandingPage — METROVERSE: Delhi After Dark
 *
 * Implements the premium visual redesign & architectural composition:
 * - Layer 0: Three.js 3D WebGL architectural night city & moving metro viaduct.
 * - Layer 1: Dedicated page-spanning MetroverseRailway viaduct & articulated 3-car EMU train.
 * - Layer 2: Editorial headlines, interactive journey selector, and storytelling sections.
 *
 * Fully preserves:
 * - 93-station dataset, real Dijkstra route solver, From/To selector syncing,
 *   Zustand journeyStore, and interactive Leaflet map link at /planner.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { metroGraph } from '@/core/graph/MetroGraph';
import { planRoutes } from '@/core/algorithm/routePlanner';
import { estimateFare, formatDuration } from '@/utils/formatters';
import { useJourneyStore } from '@/store/journeyStore';
import { MetroverseRailway } from '@/features/landing/MetroverseRailway';
import type { MetroRoute, Station } from '@/core/graph/types';
import { LINE_COLORS } from '@/utils/lineColors';
import { AuthNavControl } from '@/components/auth/AuthNavControl';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useTranslation } from 'react-i18next';
import { getStationDisplayName, getStationSecondaryName, getLocalizedLineName } from '@/i18n';

/* ─── Hook: Accessible Reduced Motion ───────────────────────────── */
function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

/* ─── Main Landing Page Component ───────────────────────────────── */
export function LandingPage() {
  const reduced = useReducedMotion();
  const pageContainerRef = useRef<HTMLDivElement>(null);

  // Selected route state shared across Hero, Rajiv Chowk, and the Railway
  const [selectedRoute, setSelectedRoute] = useState<MetroRoute | null>(null);

  return (
    <div
      ref={pageContainerRef}
      className="relative min-h-screen bg-[#020409] text-slate-100 overflow-x-hidden selection:bg-cyan-500/30 selection:text-cyan-200"
    >
      {/* ── 3D PERSPECTIVE DELHI METRO CITY & MOVING TRAIN ── */}
      <MetroverseRailway
        reduced={reduced}
        selectedRoute={selectedRoute}
        triggerContainerRef={pageContainerRef}
      />

      {/* ── LAYER 2: FOREGROUND EDITORIAL & INTERACTIVE CONTENT ── */}
      <div className="relative z-20 pointer-events-auto">
        <MetroverseNav />
        <MetroverseHero
          selectedRoute={selectedRoute}
          onRouteCalculated={setSelectedRoute}
        />
        <RajivChowkSection activeRoute={selectedRoute} />
        <ArchitectureSection />
        <CartographySection />
        <TerminalSection />
        <MetroverseFooter />
      </div>
    </div>
  );
}

/* ─── Navigation Header ─────────────────────────────────────────── */
function MetroverseNav() {
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-50 bg-[#020409]/85 backdrop-blur-md border-b border-white/[0.07] h-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-full flex items-center justify-between">
        {/* Brand identity */}
        <a href="/" className="flex items-center gap-3 group" aria-label={t('nav.brand')}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400 via-cyan-400 to-blue-600 p-[1.5px] transition-transform duration-200 group-hover:scale-105">
            <div className="w-full h-full bg-[#03050c] rounded-[6px] flex items-center justify-center">
              <svg className="w-4 h-4 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="3" y="6" width="18" height="12" rx="2" strokeWidth="1.8" />
                <line x1="7" y1="10" x2="17" y2="10" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="8" cy="18" r="1.2" fill="currentColor" />
                <circle cx="16" cy="18" r="1.2" fill="currentColor" />
              </svg>
            </div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-bold font-display text-white text-sm sm:text-base tracking-tight">
                {t('nav.brand')}
              </span>
              <span className="text-[9px] font-semibold font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/25">
                {t('nav.edition')}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono tracking-wider -mt-0.5">
              {t('nav.tagline')}
            </span>
          </div>
        </a>

        {/* Desktop Anchor Links */}
        <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-slate-300">
          <a href="#hero-stage" className="hover:text-cyan-300 transition-colors">{t('nav.routeFinder')}</a>
          <a href="#rajiv-chowk" className="hover:text-cyan-300 transition-colors">{t('nav.rajivChowkNexus')}</a>
          <a href="#architecture" className="hover:text-cyan-300 transition-colors">{t('nav.graphEngine')}</a>
          <a href="#cartography" className="hover:text-cyan-300 transition-colors">{t('nav.cartography')}</a>
        </nav>

        {/* Right Status & Launch CTA */}
        <div className="flex items-center gap-2 sm:gap-3.5">
          <span className="hidden lg:inline-flex items-center gap-2 text-[11px] text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {t('nav.systemStatus')}
          </span>
          <Link
            to="/planner"
            id="nav-launch-planner-btn"
            className="text-xs px-3 sm:px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-glow-cyan/20 border border-cyan-400/30 transition-all flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>{t('nav.openPlanner')}</span>
            <svg className="w-3.5 h-3.5 hidden xs:inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
          <LanguageSwitcher />
          <AuthNavControl />
        </div>
      </div>
    </header>
  );
}

/* ─── Hero Section: Bold Left-Side Editorial + Journey Selector ─── */
interface MetroverseHeroProps {
  selectedRoute: MetroRoute | null;
  onRouteCalculated: (route: MetroRoute | null) => void;
}

function MetroverseHero({ selectedRoute, onRouteCalculated }: MetroverseHeroProps) {
  const { t } = useTranslation();

  return (
    <section
      id="hero-stage"
      className="relative pt-10 sm:pt-16 pb-20 sm:pb-28 border-b border-white/[0.06] scroll-mt-16 overflow-hidden"
      aria-label="Metroverse Hero"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        {/* Split Layout: Left side contains Headline + Route Selector; Right side opens to City & Viaduct */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">

          {/* Left Column (7 cols): Editorial Headline + From/To Selector */}
          <div className="lg:col-span-7 flex flex-col justify-start text-left z-20">
            {/* System Micro-Label */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-cyan-400/30 text-cyan-300 text-[11px] font-mono tracking-wider uppercase mb-3.5 w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span>{t('hero.digitalTwin')}</span>
            </div>

            {/* Bold Editorial Headline */}
            <h1 className="text-3xl sm:text-5xl xl:text-5.5xl font-extrabold font-display text-white tracking-tight leading-[1.08] mb-3">
              {t('hero.headlinePart1')}{' '}
              <span className="block bg-gradient-to-r from-yellow-300 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                {t('hero.headlinePart2')}
              </span>
            </h1>

            {/* Concise Supporting Copy */}
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed mb-6 font-normal">
              {t('hero.subtitle')}
            </p>

            {/* ── FROM/TO JOURNEY SELECTOR PLACED DIRECTLY BELOW HEADLINE ── */}
            <HeroJourneySelector
              selectedRoute={selectedRoute}
              onRouteCalculated={onRouteCalculated}
            />

            {/* Metric Pills Strip */}
            <div className="grid grid-cols-4 gap-2.5 w-full mt-4">
              {[
                { v: '124', l: t('planner.stations') },
                { v: '3', l: t('hero.stops') },
                { v: '<1ms', l: 'Dijkstra' },
                { v: '180s', l: t('rajivChowk.concourseFriction') },
              ].map(item => (
                <div key={item.l} className="bg-[#050914]/60 backdrop-blur-sm rounded-xl p-2.5 text-center border border-white/[0.06]">
                  <p className="text-sm font-bold font-display text-white">{item.v}</p>
                  <p className="text-[10px] text-slate-400 font-mono truncate">{item.l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column (5 cols): Reserved open space for elevated railway and train */}
          <div className="lg:col-span-5 min-h-[340px] lg:min-h-[480px] pointer-events-none select-none" aria-hidden="true" />

        </div>
      </div>
    </section>
  );
}

/* ─── Searchable Station Combobox (Hero) ────────────────────────── */
interface HeroStationComboboxProps {
  id: string;
  label: string;
  valueId: string;
  placeholder?: string;
  onChange: (stationId: string) => void;
  excludeId?: string;
  allStations: Station[];
}

function HeroStationCombobox({
  id,
  label,
  valueId,
  placeholder,
  onChange,
  excludeId,
  allStations,
}: HeroStationComboboxProps) {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedStation = useMemo(
    () => allStations.find(s => s.id === valueId) || null,
    [allStations, valueId]
  );

  useEffect(() => {
    if (selectedStation) {
      setQuery(getStationDisplayName(selectedStation, i18n.language));
    } else {
      setQuery('');
    }
  }, [selectedStation, i18n.language]);

  const filteredStations = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allStations
      .filter(s => s.id !== excludeId)
      .filter(s => {
        if (!q) return true;
        if (s.name.toLowerCase().includes(q)) return true;
        if (s.nameHindi && s.nameHindi.toLowerCase().includes(q)) return true;
        if (s.lines.some(l => l.toLowerCase().includes(q))) return true;
        return false;
      })
      .slice(0, 8);
  }, [allStations, excludeId, query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (station: Station) => {
    onChange(station.id);
    setQuery(getStationDisplayName(station, i18n.language));
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        return;
      }
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => Math.min(prev + 1, filteredStations.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredStations[highlightedIndex]) {
          handleSelect(filteredStations[highlightedIndex]);
        } else if (filteredStations.length > 0) {
          handleSelect(filteredStations[0]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <label htmlFor={id} className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
        {label}
      </label>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </span>

        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={`${id}-listbox`}
          autoComplete="off"
          value={query}
          placeholder={placeholder || t('hero.searchPlaceholder')}
          onChange={e => {
            setQuery(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full bg-[#080d1e]/90 border border-white/[0.12] rounded-xl pl-9 pr-8 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 transition-colors font-sans"
        />

        {query.length > 0 && (
          <button
            type="button"
            aria-label={`Clear ${label}`}
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Floating Suggestions Dropdown */}
      {isOpen && filteredStations.length > 0 && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto bg-[#070c1c] border border-white/15 rounded-xl shadow-2xl divide-y divide-white/[0.05]"
        >
          {filteredStations.map((station, idx) => {
            const secondary = getStationSecondaryName(station, i18n.language);
            return (
              <li
                key={station.id}
                role="option"
                aria-selected={idx === highlightedIndex}
                onMouseEnter={() => setHighlightedIndex(idx)}
                onMouseDown={e => {
                  e.preventDefault();
                  handleSelect(station);
                }}
                className={`flex items-center justify-between px-3 py-2 text-xs cursor-pointer transition-colors ${
                  idx === highlightedIndex ? 'bg-blue-600/30 text-white' : 'text-slate-200 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex gap-1 shrink-0">
                    {station.lines.map(line => (
                      <span
                        key={line}
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: LINE_COLORS[line] || '#0284c7' }}
                        title={getLocalizedLineName(line, i18n.language)}
                      />
                    ))}
                  </span>
                  <span className="font-medium truncate">
                    {getStationDisplayName(station, i18n.language)}
                  </span>
                  {secondary && (
                    <span className="text-[10px] text-slate-500 font-normal truncate hidden sm:inline">
                      ({secondary})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {station.isInterchange && (
                    <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {t('search.interchangeBadge')}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500 hidden sm:inline">
                    {station.lines.map(l => getLocalizedLineName(l, i18n.language)).join(' / ')}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ─── Compact Journey Selector Card (Hero) ──────────────────────── */
interface HeroJourneySelectorProps {
  selectedRoute: MetroRoute | null;
  onRouteCalculated: (route: MetroRoute | null) => void;
}

function HeroJourneySelector({ onRouteCalculated }: HeroJourneySelectorProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setSource = useJourneyStore(s => s.setSource);
  const setDestination = useJourneyStore(s => s.setDestination);
  const calculateRoutes = useJourneyStore(s => s.calculateRoutes);

  // All verified stations sorted alphabetically
  const allStations = useMemo(() => {
    return metroGraph.getAllStations().sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  // Default origin & destination: Kashmere Gate ➔ Rajiv Chowk
  const [fromId, setFromId] = useState<string>('KASHMERE_GATE');
  const [toId, setToId]     = useState<string>('RAJIV_CHOWK');
  const [showBreakdown, setShowBreakdown] = useState<boolean>(false);

  // Real Dijkstra route result
  const calculatedRoute = useMemo(() => {
    if (!fromId || !toId || fromId === toId) return null;
    const routes = planRoutes(metroGraph, fromId, toId);
    return routes.length > 0 ? routes[0] : null;
  }, [fromId, toId]);

  // Sync route with parent
  useEffect(() => {
    onRouteCalculated(calculatedRoute);
  }, [calculatedRoute, onRouteCalculated]);

  // Sync state with journeyStore
  useEffect(() => {
    if (fromId && toId && fromId !== toId) {
      const srcStation = metroGraph.getStation(fromId) ?? null;
      const dstStation = metroGraph.getStation(toId) ?? null;
      if (srcStation && dstStation) {
        setSource(srcStation);
        setDestination(dstStation);
        calculateRoutes();
      }
    }
  }, [fromId, toId, setSource, setDestination, calculateRoutes]);

  const handleSwap = () => {
    setFromId(toId);
    setToId(fromId);
  };

  const handleOpenPlanner = () => {
    const srcStation = metroGraph.getStation(fromId) ?? null;
    const dstStation = metroGraph.getStation(toId) ?? null;
    if (srcStation && dstStation) {
      setSource(srcStation);
      setDestination(dstStation);
      calculateRoutes();
    }
    navigate('/planner');
  };

  return (
    <div className="w-full bg-[#050914]/80 backdrop-blur-md border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-2xl">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/[0.07]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
            {t('hero.quickRouteFinder')}
          </h3>
        </div>
        <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
          {t('hero.dijkstraSolver')}
        </span>
      </div>

      {/* Selectors Row */}
      <div className="grid grid-cols-1 sm:grid-cols-11 gap-2.5 items-center mb-3">
        {/* From Station */}
        <div className="sm:col-span-5">
          <HeroStationCombobox
            id="hero-from-combobox"
            label={t('hero.fromLabel')}
            valueId={fromId}
            onChange={setFromId}
            excludeId={toId}
            allStations={allStations}
          />
        </div>

        {/* Swap Button */}
        <div className="sm:col-span-1 flex justify-center pt-2 sm:pt-4">
          <button
            type="button"
            onClick={handleSwap}
            aria-label={t('hero.swapAria')}
            className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-cyan-300 border border-white/10 transition-colors group"
          >
            <svg className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>
        </div>

        {/* To Station */}
        <div className="sm:col-span-5">
          <HeroStationCombobox
            id="hero-to-combobox"
            label={t('hero.toLabel')}
            valueId={toId}
            onChange={setToId}
            excludeId={fromId}
            allStations={allStations}
          />
        </div>
      </div>

      {/* Calculated Results / States */}
      {fromId && toId && fromId === toId ? (
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs text-center font-mono mb-3">
          {t('hero.identicalError')}
        </div>
      ) : !fromId || !toId ? (
        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] text-slate-400 text-xs text-center font-mono mb-3">
          {t('hero.selectPrompt')}
        </div>
      ) : calculatedRoute ? (
        <div className="bg-[#030610]/85 rounded-xl p-3 border border-white/[0.08] mb-3">
          {/* Summary Stat Grid */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs pb-2 border-b border-white/[0.06]">
            <div>
              <span className="text-[10px] text-slate-400 font-mono block">{t('hero.estimatedTime')}</span>
              <span className="font-bold text-white font-display mt-0.5 block">
                {formatDuration(calculatedRoute.totalTimeSeconds)} <span className="text-[9px] text-slate-400 font-normal font-sans">{t('hero.est')}</span>
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-mono block">{t('hero.stops')}</span>
              <span className="font-bold text-white font-display mt-0.5 block">
                {t('hero.stationsCount', { count: calculatedRoute.totalStations })}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-mono block">{t('hero.lineChanges')}</span>
              <span className="font-bold text-amber-300 font-display mt-0.5 block truncate">
                {calculatedRoute.interchangeCount === 0
                  ? t('hero.direct')
                  : t('hero.transferCount', { count: calculatedRoute.interchangeCount })}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-mono block">{t('hero.estimatedFare')}</span>
              <span className="font-bold text-emerald-400 font-display mt-0.5 block">
                ₹{estimateFare(calculatedRoute.totalStations).amount} <span className="text-[9px] text-slate-400 font-normal font-sans">{t('hero.est')}</span>
              </span>
            </div>
          </div>

          {/* Line Segments Corridor Strip */}
          <div className="flex items-center gap-1.5 pt-2.5 flex-wrap">
            {calculatedRoute.lineSegments.map((seg, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium"
                style={{
                  backgroundColor: `${LINE_COLORS[seg.line] || '#0284c7'}15`,
                  border: `1px solid ${LINE_COLORS[seg.line] || '#0284c7'}35`,
                  color: LINE_COLORS[seg.line] || '#38bdf8',
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: LINE_COLORS[seg.line] || '#0284c7' }}
                />
                <span>{getLocalizedLineName(seg.line, i18n.language)}</span>
                <span className="opacity-75 font-mono text-[10px]">
                  ({t('hero.stopsInSegment', { count: seg.stations.length - 1 })})
                </span>
                {idx < calculatedRoute.lineSegments.length - 1 && (
                  <span className="text-slate-400 ml-1">➔</span>
                )}
              </span>
            ))}
          </div>

          {/* Collapsible Step-by-Step Directions */}
          <div className="mt-2.5 pt-2 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="w-full flex items-center justify-between text-[11px] font-mono text-cyan-300 hover:text-white transition-colors py-1"
            >
              <span>{showBreakdown ? t('hero.hideDirections') : t('hero.viewDirections')}</span>
              <span>{showBreakdown ? '▲' : '▼'}</span>
            </button>

            {showBreakdown && (
              <div className="mt-2.5 space-y-2 pt-2 border-t border-white/[0.05] text-xs">
                {/* Interchange Alert if any */}
                {calculatedRoute.interchangeCount > 0 && calculatedRoute.interchanges.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-200 text-xs flex items-start gap-2">
                    <span className="text-base shrink-0">🔄</span>
                    <div>
                      <p className="font-semibold text-white">
                        {t('hero.transferAt', {
                          station: getStationDisplayName(calculatedRoute.interchanges[0], i18n.language),
                        })}
                      </p>
                      <p className="text-[11px] text-purple-200 mt-0.5">
                        {t('hero.transferDesc', {
                          line1: getLocalizedLineName(calculatedRoute.lineSegments[0]?.line, i18n.language),
                          line2: getLocalizedLineName(calculatedRoute.lineSegments[1]?.line, i18n.language),
                        })}
                      </p>
                    </div>
                  </div>
                )}

                {/* Steps List */}
                <ol className="space-y-1.5 font-sans pl-1">
                  <li className="flex items-center gap-2 text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    <span>
                      {t('hero.boardAt')}{' '}
                      <strong className="text-white">
                        {getStationDisplayName(calculatedRoute.stations[0], i18n.language)}
                      </strong>
                    </span>
                  </li>
                  {calculatedRoute.totalStations > 2 && (
                    <li className="pl-4 text-[11px] text-slate-400 border-l border-white/10 ml-1 py-0.5">
                      {t('hero.intermediateStopsCount', { count: calculatedRoute.totalStations - 2 })}
                    </li>
                  )}
                  {calculatedRoute.interchanges.map(ic => (
                    <li key={ic.id} className="flex items-center gap-2 text-purple-300">
                      <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                      <span>
                        {t('hero.interchangeAt')}{' '}
                        <strong className="text-white">
                          {getStationDisplayName(ic, i18n.language)}
                        </strong>
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center gap-2 text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                    <span>
                      {t('hero.alightAt')}{' '}
                      <strong className="text-white">
                        {getStationDisplayName(
                          calculatedRoute.stations[calculatedRoute.stations.length - 1],
                          i18n.language
                        )}
                      </strong>
                    </span>
                  </li>
                </ol>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-2.5 rounded-xl bg-white/[0.02] text-center text-xs text-slate-500 mb-3 font-mono">
          {t('hero.noRouteFound')}
        </div>
      )}

      {/* Action Buttons Row */}
      <div className="flex flex-col sm:flex-row items-center gap-2.5">
        <button
          id="hero-open-planner-btn"
          type="button"
          onClick={handleOpenPlanner}
          disabled={!calculatedRoute}
          className="btn-primary text-xs w-full sm:flex-1 py-2.5 flex items-center justify-center gap-2 font-semibold shadow-glow-cyan/25"
        >
          <span>{t('hero.openFullMap')}</span>
          <svg className="w-3.5 h-3.5 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>

        <a
          href="#rajiv-chowk"
          className="btn-ghost text-xs w-full sm:w-auto px-4 py-2.5 flex items-center justify-center gap-1.5 font-medium text-slate-300 hover:text-white"
        >
          <span>{t('hero.inspectRajivChowk')}</span>
        </a>
      </div>
    </div>
  );
}

/* ─── Rajiv Chowk Interchange Section ───────────────────────────── */
interface RajivChowkSectionProps {
  activeRoute: MetroRoute | null;
}

function RajivChowkSection({ activeRoute }: RajivChowkSectionProps) {
  const { t, i18n } = useTranslation();
  const passesRajivChowk = useMemo(() => {
    if (!activeRoute) return false;
    return activeRoute.stations.some(s => s.id === 'RAJIV_CHOWK');
  }, [activeRoute]);

  const hasInterchange = activeRoute ? activeRoute.interchangeCount > 0 : false;

  return (
    <section
      id="rajiv-chowk"
      className="py-20 sm:py-28 border-b border-white/[0.06] scroll-mt-16 relative"
      aria-label={t('rajivChowk.title')}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">

          {/* Left Column (7 cols): Content & Itinerary Diagnostics */}
          <div className="lg:col-span-7 text-left">
            <div className="inline-flex items-center gap-2 text-[11px] font-mono tracking-widest uppercase text-purple-400 mb-3 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              <span>{t('rajivChowk.badge')}</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold font-display text-white tracking-tight">
              {t('rajivChowk.title')}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-2.5 mb-6 leading-relaxed max-w-xl">
              {t('rajivChowk.description')}
            </p>

            {/* Translucent Corridor Specs Card */}
            <div className="bg-[#050814]/60 border border-white/[0.07] rounded-2xl p-5 mb-4 backdrop-blur-sm">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/[0.06]">
                <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  {t('rajivChowk.intersectingCorridors')}
                </h3>
                <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  {t('rajivChowk.transferNode')}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div className="p-3 rounded-xl bg-[#030610]/80 border border-yellow-500/25">
                  <span className="text-xs font-bold text-white block">{t('rajivChowk.yellowLineTitle')}</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">{t('rajivChowk.yellowLineDesc')}</span>
                  <span className="text-[10px] font-mono text-yellow-400 font-semibold mt-1 block">{t('rajivChowk.yellowLineStns')}</span>
                </div>

                <div className="p-3 rounded-xl bg-[#030610]/80 border border-blue-500/25">
                  <span className="text-xs font-bold text-white block">{t('rajivChowk.blueLineTitle')}</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">{t('rajivChowk.blueLineDesc')}</span>
                  <span className="text-[10px] font-mono text-blue-400 font-semibold mt-1 block">{t('rajivChowk.blueLineStns')}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-mono text-slate-400 pt-2 border-t border-white/[0.05]">
                <span>{t('rajivChowk.concourseFriction')}</span>
                <span className="text-cyan-400 font-bold">{t('rajivChowk.concourseFrictionValue')}</span>
              </div>
            </div>

            {/* Active Route Interchange Diagnostics */}
            <div className="bg-[#050814]/60 border border-cyan-500/20 rounded-2xl p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-white/[0.06]">
                <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  {t('rajivChowk.diagnostics')}
                </h3>
                <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                  {t('rajivChowk.calculatedState')}
                </span>
              </div>

              {activeRoute ? (
                <div>
                  <div className="p-3 rounded-xl bg-[#030610]/80 border border-white/[0.07] mb-3">
                    <span className="text-[10px] font-mono uppercase text-slate-500 block mb-0.5">
                      {t('rajivChowk.activeItinerary')}
                    </span>
                    <p className="text-sm font-bold text-white">
                      {getStationDisplayName(activeRoute.stations[0], i18n.language)} ➔{' '}
                      {getStationDisplayName(
                        activeRoute.stations[activeRoute.stations.length - 1],
                        i18n.language
                      )}
                    </p>
                    <span className="text-[11px] font-mono text-cyan-300 mt-0.5 block">
                      {t('hero.stopsInSegment', { count: activeRoute.totalStations })} •{' '}
                      {formatDuration(activeRoute.totalTimeSeconds)} {t('rajivChowk.totalTime')}
                    </span>
                  </div>

                  <div className={`p-3 rounded-xl border text-xs leading-relaxed ${
                    passesRajivChowk && hasInterchange
                      ? 'bg-purple-500/10 border-purple-500/30 text-purple-200'
                      : passesRajivChowk
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                      : 'bg-white/[0.02] border-white/10 text-slate-300'
                  }`}>
                    <span className="font-semibold block mb-0.5">
                      {passesRajivChowk && hasInterchange
                        ? t('rajivChowk.transferRequiredTitle')
                        : passesRajivChowk
                        ? t('rajivChowk.continuousPassageTitle')
                        : t('rajivChowk.singleBranchTitle')}
                    </span>
                    <p className="text-[11px] opacity-90">
                      {passesRajivChowk && hasInterchange
                        ? t('rajivChowk.transferRequiredDesc')
                        : passesRajivChowk
                        ? t('rajivChowk.continuousPassageDesc')
                        : t('rajivChowk.singleBranchDesc')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[#030610]/80 border border-white/5 text-center">
                  <p className="text-xs text-slate-400 mb-0.5">{t('rajivChowk.noJourneyCalculated')}</p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    {t('rajivChowk.selectPrompt')}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column (5 cols): Reserved space for Rajiv Chowk Viaduct Nexus */}
          <div className="lg:col-span-5 min-h-[300px] lg:min-h-[440px] pointer-events-none select-none" aria-hidden="true" />

        </div>
      </div>
    </section>
  );
}

/* ─── Algorithmic Architecture Section ──────────────────────────── */
function ArchitectureSection() {
  const { t } = useTranslation();

  const points = [
    {
      num: t('architecture.p1Num'),
      title: t('architecture.p1Title'),
      desc: t('architecture.p1Desc'),
    },
    {
      num: t('architecture.p2Num'),
      title: t('architecture.p2Title'),
      desc: t('architecture.p2Desc'),
    },
    {
      num: t('architecture.p3Num'),
      title: t('architecture.p3Title'),
      desc: t('architecture.p3Desc'),
    },
    {
      num: t('architecture.p4Num'),
      title: t('architecture.p4Title'),
      desc: t('architecture.p4Desc'),
    },
  ];

  return (
    <section
      id="architecture"
      className="py-20 sm:py-28 border-b border-white/[0.06] scroll-mt-16 relative"
      aria-label={t('architecture.title')}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">

          {/* Left Column (8 cols): Title & 2x2 Cards Grid */}
          <div className="lg:col-span-8 text-left">
            <div className="inline-flex items-center gap-2 text-[11px] font-mono tracking-widest uppercase text-cyan-400 mb-3 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span>{t('architecture.badge')}</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold font-display text-white tracking-tight">
              {t('architecture.title')}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-2 mb-8 leading-relaxed max-w-xl">
              {t('architecture.subtitle')}
            </p>

            {/* 2x2 Clean Translucent Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {points.map(p => (
                <div
                  key={p.num}
                  className="bg-[#050814]/60 border border-white/[0.06] backdrop-blur-sm rounded-xl p-5 flex flex-col justify-between hover:border-cyan-500/30 transition-all"
                >
                  <div>
                    <span className="text-2xl font-extrabold font-mono text-slate-500 block mb-2">
                      {p.num}
                    </span>
                    <h3 className="text-sm font-bold font-display text-white mb-2">
                      {p.title}
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed font-normal">
                      {p.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column (4 cols): Open Space for Hauz Khas viaduct concourse */}
          <div className="lg:col-span-4 min-h-[240px] lg:min-h-[380px] pointer-events-none select-none" aria-hidden="true" />

        </div>
      </div>
    </section>
  );
}

/* ─── Interactive Cartography Centerpiece Teaser ────────────────── */
function CartographySection() {
  const { t } = useTranslation();

  return (
    <section
      id="cartography"
      className="py-20 sm:py-28 border-b border-white/[0.06] scroll-mt-16 relative"
      aria-label={t('cartography.title')}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">

          {/* Left Text & Interactive Preview Card (7 cols) */}
          <div className="lg:col-span-7 text-left">
            <div className="inline-flex items-center gap-2 text-[11px] font-mono tracking-widest uppercase text-blue-400 mb-3 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span>{t('cartography.badge')}</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold font-display text-white tracking-tight leading-tight mb-3">
              {t('cartography.title')}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-5 font-normal max-w-xl">
              {t('cartography.subtitle')}
            </p>

            <ul className="space-y-2 mb-6 text-xs text-slate-300 max-w-xl">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>{t('cartography.bullet1')}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                <span>{t('cartography.bullet2')}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                <span>{t('cartography.bullet3')}</span>
              </li>
            </ul>

            {/* Embedded High-Contrast Map Teaser Card */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#050814]/80 p-4 shadow-xl backdrop-blur-md mb-6 max-w-xl">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">
                    {t('cartography.cardBadge')}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-cyan-300">{t('cartography.cardTech')}</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-3">
                {t('cartography.cardDesc')}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-yellow-500/15 text-yellow-300 border border-yellow-500/25">{t('cartography.cardYellow')}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/25">{t('cartography.cardBlue')}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/25">{t('cartography.cardViolet')}</span>
              </div>
            </div>

            <Link
              to="/planner"
              className="btn-primary text-xs sm:text-sm px-6 py-3 inline-flex items-center gap-2 shadow-glow-cyan/25 font-semibold"
            >
              <span>{t('cartography.cta')}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>

          {/* Right Column (5 cols): Reserved open corridor for the 3D railway viaduct and moving train */}
          <div className="lg:col-span-5 min-h-[260px] lg:min-h-[420px] pointer-events-none select-none" aria-hidden="true" />

        </div>
      </div>
    </section>
  );
}

/* ─── Terminal Portal / Final Call to Action ────────────────────── */
function TerminalSection() {
  const { t } = useTranslation();

  return (
    <section
      id="terminal-portal"
      className="py-22 sm:py-30 border-b border-white/[0.06] relative"
      aria-label={t('terminal.title')}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column (7 cols): Content & Action Buttons */}
          <div className="lg:col-span-7 text-left">
            <div className="inline-flex items-center gap-2 text-[11px] font-mono tracking-widest uppercase text-cyan-400 mb-3 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>{t('terminal.badge')}</span>
            </div>

            <h2 className="text-3xl sm:text-5xl font-extrabold font-display text-white tracking-tight mb-4">
              {t('terminal.title')}
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 max-w-lg leading-relaxed mb-7 font-normal">
              {t('terminal.subtitle')}
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <Link
                to="/planner"
                className="btn-primary text-xs sm:text-sm px-7 py-3.5 flex items-center justify-center gap-2 font-semibold shadow-glow-cyan/25 w-full sm:w-auto"
              >
                <span>{t('terminal.launchPlanner')}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
              <a
                href="#hero-stage"
                className="btn-ghost text-xs sm:text-sm px-6 py-3.5 flex items-center justify-center gap-2 font-medium text-slate-300 hover:text-white w-full sm:w-auto"
              >
                <span>{t('terminal.backToTop')}</span>
              </a>
            </div>
          </div>

          {/* Right Column (5 cols): Reserved space for Terminus Platform */}
          <div className="lg:col-span-5 min-h-[220px] pointer-events-none select-none" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ────────────────────────────────────────────────────── */
function MetroverseFooter() {
  const { t } = useTranslation();

  return (
    <footer className="bg-[#020409]/90 backdrop-blur-md py-12 text-xs text-slate-500 border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-8">
          <div className="md:col-span-5">
            <span className="font-bold font-display text-white text-sm tracking-tight block mb-2">
              {t('footer.brand')}
            </span>
            <p className="text-slate-400 max-w-sm leading-relaxed mb-3 text-xs">
              {t('footer.about')}
            </p>
            <p className="text-[10px] text-slate-500">
              {t('footer.disclaimer')}
            </p>
          </div>

          <div className="md:col-span-3">
            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-300 font-semibold mb-3">
              {t('footer.sectionsTitle')}
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li><Link to="/planner" className="hover:text-cyan-300 transition-colors">{t('nav.planner')}</Link></li>
              <li><a href="#hero-stage" className="hover:text-cyan-300 transition-colors">{t('nav.routeFinder')}</a></li>
              <li><a href="#rajiv-chowk" className="hover:text-cyan-300 transition-colors">{t('nav.rajivChowkNexus')}</a></li>
              <li><a href="#architecture" className="hover:text-cyan-300 transition-colors">{t('nav.graphEngine')}</a></li>
            </ul>
          </div>

          <div className="md:col-span-4">
            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-300 font-semibold mb-3">
              {t('footer.archTitle')}
            </h4>
            <ul className="space-y-1.5 text-xs font-mono text-slate-400">
              <li>React 19 + TypeScript</li>
              <li>Three.js 3D WebGL Perspective</li>
              <li>Elevated Viaduct & Articulated EMU Fleet</li>
              <li>Leaflet 1.9 Cartography</li>
              <li>{t('footer.testsStatus')}</li>
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
          <p>{t('footer.rights')}</p>
          <span className="font-mono text-cyan-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            {t('footer.testsStatus')}
          </span>
        </div>
      </div>
    </footer>
  );
}
