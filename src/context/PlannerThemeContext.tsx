import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type PlannerTheme = 'dark-transit' | 'light-metro' | 'midnight-blue';

export const THEMES: { id: PlannerTheme; nameKey: string; descKey: string; icon: string }[] = [
  {
    id: 'dark-transit',
    nameKey: 'theme.darkTransit',
    descKey: 'theme.darkTransitDesc',
    icon: '🌑',
  },
  {
    id: 'light-metro',
    nameKey: 'theme.lightMetro',
    descKey: 'theme.lightMetroDesc',
    icon: '☀️',
  },
  {
    id: 'midnight-blue',
    nameKey: 'theme.midnightBlue',
    descKey: 'theme.midnightBlueDesc',
    icon: '🌌',
  },
];

export const PLANNER_THEME_STORAGE_KEY = 'metro-planner-theme';
export const DEFAULT_PLANNER_THEME: PlannerTheme = 'dark-transit';

export function isValidPlannerTheme(val: unknown): val is PlannerTheme {
  return val === 'dark-transit' || val === 'light-metro' || val === 'midnight-blue';
}

function getStoredPlannerTheme(): PlannerTheme {
  if (typeof window === 'undefined') return DEFAULT_PLANNER_THEME;
  try {
    const stored = window.localStorage.getItem(PLANNER_THEME_STORAGE_KEY);
    if (isValidPlannerTheme(stored)) {
      return stored;
    }
  } catch {
    // localStorage restricted or disabled
  }
  return DEFAULT_PLANNER_THEME;
}

interface PlannerThemeContextValue {
  theme: PlannerTheme;
  setTheme: (theme: PlannerTheme) => void;
  isLight: boolean;
}

const PlannerThemeContext = createContext<PlannerThemeContextValue>({
  theme: DEFAULT_PLANNER_THEME,
  setTheme: () => {},
  isLight: false,
});

export function PlannerThemeProvider({
  children,
  initialTheme,
}: {
  children: ReactNode;
  initialTheme?: PlannerTheme;
}) {
  const [theme, setThemeState] = useState<PlannerTheme>(() => initialTheme ?? getStoredPlannerTheme());

  const setTheme = (newTheme: PlannerTheme) => {
    if (!isValidPlannerTheme(newTheme)) return;
    setThemeState(newTheme);
    try {
      window.localStorage.setItem(PLANNER_THEME_STORAGE_KEY, newTheme);
    } catch {
      // Storage write error handling
    }
  };

  // Sync state if storage changes in another tab
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === PLANNER_THEME_STORAGE_KEY && isValidPlannerTheme(e.newValue)) {
        setThemeState(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return (
    <PlannerThemeContext.Provider
      value={{
        theme,
        setTheme,
        isLight: theme === 'light-metro',
      }}
    >
      {children}
    </PlannerThemeContext.Provider>
  );
}

export function usePlannerTheme(): PlannerThemeContextValue {
  return useContext(PlannerThemeContext);
}

