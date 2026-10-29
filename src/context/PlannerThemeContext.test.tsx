import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PlannerThemeProvider,
  usePlannerTheme,
  PLANNER_THEME_STORAGE_KEY,
  DEFAULT_PLANNER_THEME,
  isValidPlannerTheme,
} from './PlannerThemeContext';

function TestConsumer() {
  const { theme, setTheme, isLight } = usePlannerTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <span data-testid="is-light">{isLight ? 'yes' : 'no'}</span>
      <button onClick={() => setTheme('light-metro')} data-testid="btn-set-light">
        Set Light
      </button>
      <button onClick={() => setTheme('midnight-blue')} data-testid="btn-set-midnight">
        Set Midnight
      </button>
      <button onClick={() => setTheme('dark-transit')} data-testid="btn-set-dark">
        Set Dark
      </button>
      <button onClick={() => setTheme('invalid-theme' as any)} data-testid="btn-set-invalid">
        Set Invalid
      </button>
    </div>
  );
}

describe('PlannerThemeContext & Storage Isolation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('validates theme names correctly with isValidPlannerTheme', () => {
    expect(isValidPlannerTheme('dark-transit')).toBe(true);
    expect(isValidPlannerTheme('light-metro')).toBe(true);
    expect(isValidPlannerTheme('midnight-blue')).toBe(true);
    expect(isValidPlannerTheme('solar')).toBe(false);
    expect(isValidPlannerTheme(null)).toBe(false);
    expect(isValidPlannerTheme(undefined)).toBe(false);
  });

  it('defaults to dark-transit when no storage exists', () => {
    render(
      <PlannerThemeProvider>
        <TestConsumer />
      </PlannerThemeProvider>
    );

    expect(screen.getByTestId('current-theme').textContent).toBe(DEFAULT_PLANNER_THEME);
    expect(screen.getByTestId('is-light').textContent).toBe('no');
  });

  it('safely falls back to dark-transit when storage has an invalid theme string', () => {
    window.localStorage.setItem(PLANNER_THEME_STORAGE_KEY, 'corrupted-theme-value');

    render(
      <PlannerThemeProvider>
        <TestConsumer />
      </PlannerThemeProvider>
    );

    expect(screen.getByTestId('current-theme').textContent).toBe('dark-transit');
  });

  it('initializes from valid stored theme in localStorage', () => {
    window.localStorage.setItem(PLANNER_THEME_STORAGE_KEY, 'light-metro');

    render(
      <PlannerThemeProvider>
        <TestConsumer />
      </PlannerThemeProvider>
    );

    expect(screen.getByTestId('current-theme').textContent).toBe('light-metro');
    expect(screen.getByTestId('is-light').textContent).toBe('yes');
  });

  it('switches themes immediately and persists exclusively to metro-planner-theme', async () => {
    const user = userEvent.setup();

    render(
      <PlannerThemeProvider>
        <TestConsumer />
      </PlannerThemeProvider>
    );

    expect(screen.getByTestId('current-theme').textContent).toBe('dark-transit');

    // Switch to light-metro
    await user.click(screen.getByTestId('btn-set-light'));
    expect(screen.getByTestId('current-theme').textContent).toBe('light-metro');
    expect(screen.getByTestId('is-light').textContent).toBe('yes');
    expect(window.localStorage.getItem(PLANNER_THEME_STORAGE_KEY)).toBe('light-metro');

    // Switch to midnight-blue
    await user.click(screen.getByTestId('btn-set-midnight'));
    expect(screen.getByTestId('current-theme').textContent).toBe('midnight-blue');
    expect(screen.getByTestId('is-light').textContent).toBe('no');
    expect(window.localStorage.getItem(PLANNER_THEME_STORAGE_KEY)).toBe('midnight-blue');

    // Switch back to dark-transit
    await user.click(screen.getByTestId('btn-set-dark'));
    expect(screen.getByTestId('current-theme').textContent).toBe('dark-transit');
    expect(window.localStorage.getItem(PLANNER_THEME_STORAGE_KEY)).toBe('dark-transit');
  });

  it('ignores invalid theme updates without crashing', async () => {
    const user = userEvent.setup();

    render(
      <PlannerThemeProvider>
        <TestConsumer />
      </PlannerThemeProvider>
    );

    await user.click(screen.getByTestId('btn-set-invalid'));
    expect(screen.getByTestId('current-theme').textContent).toBe('dark-transit');
    expect(window.localStorage.getItem(PLANNER_THEME_STORAGE_KEY)).toBeNull();
  });

  it('handles cross-tab storage sync events safely', () => {
    render(
      <PlannerThemeProvider>
        <TestConsumer />
      </PlannerThemeProvider>
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: PLANNER_THEME_STORAGE_KEY,
          newValue: 'midnight-blue',
        })
      );
    });

    expect(screen.getByTestId('current-theme').textContent).toBe('midnight-blue');
  });
});

