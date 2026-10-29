import React, { useState, useRef, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { metroGraph } from '@/core/graph/MetroGraph';
import type { Station } from '@/core/graph/types';
import { LINE_COLORS } from '@/utils/lineColors';
import { cn } from '@/utils/cn';
import { getStationDisplayName, getStationSecondaryName, getLocalizedLineName } from '@/i18n';

interface StationSearchProps {
  label: string;
  placeholder?: string;
  value: Station | null;
  onChange: (station: Station | null) => void;
  excludeId?: string;   // Prevent selecting the same station as the other field
  id?: string;
  variant?: 'default' | 'planner';
}

export function StationSearch({
  label,
  placeholder,
  value,
  onChange,
  excludeId,
  id: propId,
  variant = 'default',
}: StationSearchProps) {
  const { t, i18n } = useTranslation();
  const autoId = useId();
  const inputId = propId ?? autoId;

  const defaultPlaceholder = placeholder ?? t('search.typeStationPrompt');

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Station[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Major network hubs offered as quick picks when query is empty
  const HUB_STATION_IDS = [
    'RAJIV_CHOWK',
    'KASHMERE_GATE',
    'MANDI_HOUSE',
    'CENTRAL_SECRETARIAT',
    'BOTANICAL_GARDEN',
    'HAUZ_KHAS',
    'YAMUNA_BANK',
    'KAROL_BAGH',
    'NOIDA_ELECTRONIC_CITY',
    'DWARKA_SEC_21',
  ];

  const getHubStations = (): Station[] => {
    return HUB_STATION_IDS
      .map(id => metroGraph.getStation(id))
      .filter((s): s is Station => Boolean(s) && s?.id !== excludeId);
  };

  // Sync display text with the externally-set value and active language
  useEffect(() => {
    if (value) {
      setQuery(getStationDisplayName(value, i18n.language));
      setIsOpen(false);
    } else {
      setQuery('');
    }
  }, [value, i18n.language]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    onChange(null); // Clear selection when user types

    if (q.trim().length === 0) {
      const hubs = getHubStations();
      setSuggestions(hubs);
      setIsOpen(hubs.length > 0);
      setHighlightedIndex(-1);
      return;
    }

    const results = metroGraph
      .searchStations(q, 10)
      .filter(s => s.id !== excludeId);

    setSuggestions(results);
    setIsOpen(results.length > 0);
    setHighlightedIndex(0); // Highlight top match by default for quick Enter
  }

  function handleSelect(station: Station) {
    onChange(station);
    setQuery(getStationDisplayName(station, i18n.language));
    setIsOpen(false);
    setSuggestions([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        const results = query.trim().length > 0
          ? metroGraph.searchStations(query, 10).filter(s => s.id !== excludeId)
          : getHubStations();
        setSuggestions(results);
        setIsOpen(results.length > 0);
        setHighlightedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(i => {
          const next = Math.min(i + 1, suggestions.length - 1);
          scrollOptionIntoView(next);
          return next;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(i => {
          const prev = Math.max(i - 1, 0);
          scrollOptionIntoView(prev);
          return prev;
        });
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
          handleSelect(suggestions[highlightedIndex]);
        } else if (suggestions.length > 0) {
          handleSelect(suggestions[0]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        if (value) setQuery(getStationDisplayName(value, i18n.language));
        break;
    }
  }

  function scrollOptionIntoView(index: number) {
    const el = document.getElementById(`${inputId}-option-${index}`);
    el?.scrollIntoView({ block: 'nearest' });
  }

  function handleClear() {
    onChange(null);
    setQuery('');
    setSuggestions(getHubStations());
    setIsOpen(false);
    inputRef.current?.focus();
  }

  function handleFocus() {
    if (query.trim().length === 0) {
      const hubs = getHubStations();
      setSuggestions(hubs);
      setIsOpen(hubs.length > 0);
      setHighlightedIndex(-1);
    } else {
      const results = metroGraph.searchStations(query, 10).filter(s => s.id !== excludeId);
      setSuggestions(results);
      setIsOpen(results.length > 0);
      setHighlightedIndex(-1);
    }
  }

  const isOrigin = label.toLowerCase().includes('from') || label.toLowerCase().includes('origin') || label.includes('प्रारंभिक');
  const isPlanner = variant === 'planner';

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center justify-between mb-1.5">
        <label
          htmlFor={inputId}
          className={cn(
            'flex items-center gap-2 font-mono uppercase tracking-wider font-semibold',
            isPlanner ? 'text-[11px] text-[var(--planner-text-secondary)]' : 'text-xs text-gray-300'
          )}
        >
          <span
            className={cn(
              'rounded-full inline-block shrink-0',
              isPlanner
                ? isOrigin ? 'w-2 h-2 bg-emerald-500' : 'w-2 h-2 bg-rose-500'
                : isOrigin ? 'w-2.5 h-2.5 bg-emerald-400 ring-4 ring-emerald-500/20' : 'w-2.5 h-2.5 bg-rose-400 ring-4 ring-rose-500/20'
            )}
          />
          <span>{label}</span>
        </label>
        {value && (
          <span className={cn(
            'font-mono flex items-center gap-1.5',
            isPlanner ? 'text-[10px] text-[var(--planner-text-secondary)]' : 'text-[11px] text-cyan-400/90'
          )}>
            <div className="flex items-center gap-1">
              {value.lines.map(l => (
                <span
                  key={l}
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: LINE_COLORS[l] }}
                  title={getLocalizedLineName(l, i18n.language)}
                />
              ))}
            </div>
            <span>{value.lines.map(l => getLocalizedLineName(l, i18n.language)).join(', ')}</span>
          </span>
        )}
      </div>

      <div className="relative group">
        {/* Departure / Arrival Transit Icon */}
        <span className={cn(
          'absolute top-1/2 -translate-y-1/2 pointer-events-none transition-colors',
          isPlanner ? 'left-3 text-[var(--planner-text-muted)]' : 'left-3.5'
        )}>
          {isOrigin ? (
            <svg className={cn('w-4 h-4', isPlanner ? 'text-emerald-500' : 'text-emerald-400')} viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="9" strokeWidth="2" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
          ) : (
            <svg className={cn('w-4 h-4', isPlanner ? 'text-rose-500' : 'text-rose-400')} viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <circle cx="12" cy="11" r="2.5" fill="currentColor" />
            </svg>
          )}
        </span>

        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={`${inputId}-listbox`}
          aria-activedescendant={
            highlightedIndex >= 0 ? `${inputId}-option-${highlightedIndex}` : undefined
          }
          autoComplete="off"
          className={cn(
            'w-full font-sans text-sm font-medium transition-all duration-200',
            isPlanner
              ? 'bg-[var(--planner-input-bg)] border border-[var(--planner-input-border)] rounded-lg pl-9 pr-8 py-2.5 text-[var(--planner-text-primary)] placeholder-[var(--planner-text-muted)] focus:outline-none focus:border-[var(--planner-input-focus)] focus:ring-1 focus:ring-[var(--planner-accent-subtle)] hover:border-[var(--planner-border-highlight)] shadow-xs'
              : 'bg-slate-900/90 border border-slate-700/80 rounded-xl pl-10 pr-9 py-2.5 sm:py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/25 hover:border-slate-600 shadow-inner',
            value && (isPlanner ? 'border-[var(--planner-border-highlight)]' : 'border-cyan-500/50 bg-slate-900'),
          )}
          placeholder={defaultPlaceholder}
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
        />

        {/* Clear button */}
        {(query.length > 0) && (
          <button
            type="button"
            aria-label={t('search.clearAria')}
            className={cn(
              'absolute top-1/2 -translate-y-1/2 transition-colors p-1',
              isPlanner ? 'right-2.5 text-[var(--planner-text-muted)] hover:text-[var(--planner-text-primary)]' : 'right-3 text-gray-500 hover:text-gray-200'
            )}
            onClick={handleClear}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <ul
          ref={listRef}
          id={`${inputId}-listbox`}
          role="listbox"
          aria-label={t('search.suggestionsAria', { label })}
          className={cn(
            'absolute z-50 mt-1 w-full max-h-64 overflow-y-auto shadow-2xl animate-fade-in',
            isPlanner
              ? 'bg-[var(--planner-surface)] border border-[var(--planner-border)] rounded-lg divide-y divide-[var(--planner-border-subtle)]'
              : 'bg-navy-900 border border-white/15 rounded-xl backdrop-blur-xl divide-y divide-white/[0.04]'
          )}
        >
          {query.trim().length === 0 && (
            <li className={cn(
              'px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider flex items-center justify-between pointer-events-none select-none',
              isPlanner ? 'text-[var(--planner-text-muted)] bg-[var(--planner-surface-subtle)] border-b border-[var(--planner-border-subtle)]' : 'text-cyan-400/90 bg-cyan-950/40 border-b border-white/5'
            )}>
              <span>{t('search.hubsHeader')}</span>
              <span>{t('search.oneClickSelect')}</span>
            </li>
          )}
          {suggestions.map((station, index) => {
            const displayName = getStationDisplayName(station, i18n.language);
            const secondaryName = getStationSecondaryName(station, i18n.language);

            return (
              <li
                key={station.id}
                id={`${inputId}-option-${index}`}
                role="option"
                aria-selected={index === highlightedIndex}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
                  'first:rounded-t-xl last:rounded-b-xl',
                  index === highlightedIndex
                    ? 'bg-[var(--planner-accent-subtle)] text-[var(--planner-text-primary)] font-medium'
                    : isPlanner
                      ? 'text-[var(--planner-text-primary)] hover:bg-[var(--planner-surface-hover)]'
                      : 'text-gray-200 hover:bg-white/5',
                )}
                onMouseEnter={() => setHighlightedIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent blur before click registers
                  handleSelect(station);
                }}
              >
                {/* Line color dots */}
                <span className="flex gap-1 flex-shrink-0">
                  {station.lines.map(line => (
                    <span
                      key={line}
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: LINE_COLORS[line] }}
                      title={getLocalizedLineName(line, i18n.language)}
                    />
                  ))}
                </span>

                {/* Station info */}
                <span className="flex flex-col min-w-0">
                  <span className="font-medium text-sm truncate flex items-center gap-1.5">
                    <span>{displayName}</span>
                    {secondaryName && (
                      <span className={cn(
                        'text-[11px] font-normal',
                        isPlanner ? 'text-[var(--planner-text-muted)]' : 'text-gray-500'
                      )}>
                        ({secondaryName})
                      </span>
                    )}
                  </span>
                  {station.isInterchange && (
                    <span className="text-xs text-amber-500 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                      </svg>
                      {t('search.interchangeBadge')}
                    </span>
                  )}
                </span>

                {/* Line name labels */}
                <span className={cn(
                  'ml-auto text-xs hidden sm:block',
                  isPlanner ? 'text-[var(--planner-text-muted)]' : 'text-gray-500'
                )}>
                  {station.lines.map(l => getLocalizedLineName(l, i18n.language)).join(' / ')}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
