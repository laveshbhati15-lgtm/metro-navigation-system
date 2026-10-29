import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlannerTheme, THEMES, type PlannerTheme } from '@/context/PlannerThemeContext';
import { cn } from '@/utils/cn';

export function PlannerThemeSwitcher() {
  const { t } = useTranslation();
  const { theme, setTheme } = usePlannerTheme();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside or ESC
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const currentThemeObj = THEMES.find((item) => item.id === theme) || THEMES[0];

  const handleSelect = (selectedTheme: PlannerTheme) => {
    setTheme(selectedTheme);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        id="btn-planner-theme-switch"
        aria-label={`Theme: ${t(currentThemeObj.nameKey)}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono transition-colors border shadow-xs',
          'bg-[var(--planner-surface)] border-[var(--planner-border)] text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)] hover:border-[var(--planner-border-highlight)]'
        )}
      >
        <span className="text-xs" aria-hidden="true">{currentThemeObj.icon}</span>
        <span className="hidden md:inline font-sans text-xs font-medium">
          {t(currentThemeObj.nameKey)}
        </span>
        <svg
          className={cn('w-3 h-3 text-[var(--planner-text-muted)] transition-transform duration-200', isOpen && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Popover / Dropdown Menu */}
      {isOpen && (
        <div
          role="menu"
          aria-label={t('theme.title')}
          className={cn(
            'absolute right-0 mt-1.5 w-60 rounded-lg p-1.5 z-[1100] border transition-all animate-fade-in shadow-xl',
            'bg-[var(--planner-surface)] border-[var(--planner-border)] text-[var(--planner-text-primary)]'
          )}
          style={{ boxShadow: 'var(--planner-dropdown-shadow)' }}
        >
          <div className="px-2.5 py-1.5 mb-1 border-b border-[var(--planner-border-subtle)] flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--planner-text-muted)]">
              {t('theme.title')}
            </span>
            <span className="text-[10px] font-mono text-[var(--planner-accent-text)]">
              3 Modes
            </span>
          </div>

          <div className="space-y-1">
            {THEMES.map((item) => {
              const isSelected = item.id === theme;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  id={`btn-theme-${item.id}`}
                  onClick={() => handleSelect(item.id)}
                  className={cn(
                    'w-full text-left px-2.5 py-2 rounded-md transition-colors flex items-center justify-between group',
                    isSelected
                      ? 'bg-[var(--planner-accent-subtle)] text-[var(--planner-text-primary)] font-medium border border-[var(--planner-border-highlight)]'
                      : 'hover:bg-[var(--planner-surface-hover)] text-[var(--planner-text-secondary)] hover:text-[var(--planner-text-primary)] border border-transparent'
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    {/* Visual Color Preview Swatch */}
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center border shadow-xs text-[10px]',
                        item.id === 'dark-transit' && 'bg-[#070b14] border-slate-700 text-blue-400',
                        item.id === 'light-metro' && 'bg-white border-slate-300 text-blue-600',
                        item.id === 'midnight-blue' && 'bg-[#020617] border-blue-900 text-sky-400'
                      )}
                      aria-hidden="true"
                    >
                      {item.icon}
                    </div>

                    <div>
                      <p className="text-xs font-semibold leading-tight font-sans">
                        {t(item.nameKey)}
                      </p>
                      <p className="text-[10px] text-[var(--planner-text-muted)] font-mono leading-tight mt-0.5">
                        {t(item.descKey)}
                      </p>
                    </div>
                  </div>

                  {isSelected && (
                    <span className="text-[var(--planner-accent-text)] font-bold text-xs" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

