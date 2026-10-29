import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlannerThemeProvider, PLANNER_THEME_STORAGE_KEY } from '@/context/PlannerThemeContext';
import { PlannerThemeSwitcher } from './PlannerThemeSwitcher';

function renderSwitcher() {
  return render(
    <PlannerThemeProvider>
      <div data-testid="outside-area">Outside</div>
      <PlannerThemeSwitcher />
    </PlannerThemeProvider>
  );
}

describe('PlannerThemeSwitcher Component', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders theme switcher button with accessible attributes', () => {
    renderSwitcher();

    const button = screen.getByRole('button', { name: /Theme:/i });
    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('toggles dropdown menu on click', async () => {
    const user = userEvent.setup();
    renderSwitcher();

    const trigger = screen.getByRole('button', { name: /Theme:/i });
    await user.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('menu');
    expect(menu).toBeTruthy();

    // Check all three theme choices are presented
    expect(screen.getByRole('menuitemradio', { name: /Dark Transit/i })).toBeTruthy();
    expect(screen.getByRole('menuitemradio', { name: /Light Metro/i })).toBeTruthy();
    expect(screen.getByRole('menuitemradio', { name: /Midnight Blue/i })).toBeTruthy();
  });

  it('selects a new theme and updates localStorage immediately', async () => {
    const user = userEvent.setup();
    renderSwitcher();

    const trigger = screen.getByRole('button', { name: /Theme:/i });
    await user.click(trigger);

    const lightOption = screen.getByRole('menuitemradio', { name: /Light Metro/i });
    await user.click(lightOption);

    // Dropdown should close after selection
    expect(screen.queryByRole('menu')).toBeNull();
    expect(window.localStorage.getItem(PLANNER_THEME_STORAGE_KEY)).toBe('light-metro');
    expect(trigger.getAttribute('aria-label')).toContain('Light Metro');
  });

  it('closes dropdown when Escape key is pressed', async () => {
    const user = userEvent.setup();
    renderSwitcher();

    const trigger = screen.getByRole('button', { name: /Theme:/i });
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes dropdown when clicking outside', async () => {
    const user = userEvent.setup();
    renderSwitcher();

    const trigger = screen.getByRole('button', { name: /Theme:/i });
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeTruthy();

    await user.click(screen.getByTestId('outside-area'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('renders with shrink-0, title tooltip, and responsive theme label', () => {
    renderSwitcher();

    const button = screen.getByRole('button', { name: /Theme:/i });
    expect(button.id).toBe('btn-planner-theme-switch');
    expect(button.className).toContain('shrink-0');
    expect(button.getAttribute('title')).toContain('Theme:');

    // Both responsive mobile span ('Theme') and desktop span exist in DOM
    const themeSpans = button.querySelectorAll('span');
    const texts = Array.from(themeSpans).map((s) => s.textContent);
    expect(texts).toContain('Theme');
  });

  it('allows switching across all three themes: Light Metro, Midnight Blue, and Dark Transit', async () => {
    const user = userEvent.setup();
    renderSwitcher();

    const trigger = screen.getByRole('button', { name: /Theme:/i });

    // 1. Switch to Light Metro
    await user.click(trigger);
    await user.click(screen.getByRole('menuitemradio', { name: /Light Metro/i }));
    expect(window.localStorage.getItem(PLANNER_THEME_STORAGE_KEY)).toBe('light-metro');
    expect(trigger.getAttribute('aria-label')).toContain('Light Metro');

    // 2. Switch to Midnight Blue
    await user.click(trigger);
    await user.click(screen.getByRole('menuitemradio', { name: /Midnight Blue/i }));
    expect(window.localStorage.getItem(PLANNER_THEME_STORAGE_KEY)).toBe('midnight-blue');
    expect(trigger.getAttribute('aria-label')).toContain('Midnight Blue');

    // 3. Switch to Dark Transit
    await user.click(trigger);
    await user.click(screen.getByRole('menuitemradio', { name: /Dark Transit/i }));
    expect(window.localStorage.getItem(PLANNER_THEME_STORAGE_KEY)).toBe('dark-transit');
    expect(trigger.getAttribute('aria-label')).toContain('Dark Transit');
  });
});
