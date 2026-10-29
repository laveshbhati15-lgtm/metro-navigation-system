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
});
