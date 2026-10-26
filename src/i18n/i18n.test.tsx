import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import i18n, {
  getStationDisplayName,
  getStationSecondaryName,
  getLocalizedLineName,
  STORAGE_LANG_KEY,
} from '@/i18n';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import type { Station } from '@/core/graph/types';

const mockStation: Station = {
  id: 'RAJIV_CHOWK',
  name: 'Rajiv Chowk',
  nameHindi: 'राजीव चौक',
  lines: ['YELLOW', 'BLUE'],
  isInterchange: true,
  coordinates: { lat: 28.6328, lng: 77.2197 },
};

describe('i18n utilities', () => {
  beforeEach(async () => {
    localStorage.clear();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    localStorage.clear();
  });

  it('correctly translates station display names based on active language', () => {
    expect(getStationDisplayName(mockStation, 'en')).toBe('Rajiv Chowk');
    expect(getStationDisplayName(mockStation, 'hi')).toBe('राजीव चौक');

    // Fallback when nameHindi is undefined
    const stationWithoutHindi: Station = {
      ...mockStation,
      id: 'TEST_STATION',
      name: 'Test Station',
      nameHindi: undefined,
    };
    expect(getStationDisplayName(stationWithoutHindi, 'hi')).toBe('Test Station');
  });

  it('correctly returns secondary bilingual names', () => {
    // When in English, secondary is Hindi
    expect(getStationSecondaryName(mockStation, 'en')).toBe('राजीव चौक');
    // When in Hindi, secondary is English
    expect(getStationSecondaryName(mockStation, 'hi')).toBe('Rajiv Chowk');
  });

  it('correctly returns localized line names', () => {
    expect(getLocalizedLineName('YELLOW', 'en')).toBe('Yellow Line');
    expect(getLocalizedLineName('YELLOW', 'hi')).toBe('येलो लाइन');
    expect(getLocalizedLineName('BLUE', 'hi')).toBe('ब्लू लाइन');
    expect(getLocalizedLineName('UNKNOWN_LINE', 'en')).toBe('UNKNOWN_LINE Line');
  });
});

describe('LanguageSwitcher Component', () => {
  beforeEach(async () => {
    localStorage.clear();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    localStorage.clear();
  });

  it('renders language switcher with EN active by default', () => {
    render(<LanguageSwitcher />);

    const enButton = screen.getByRole('radio', { name: 'EN' });
    const hiButton = screen.getByRole('radio', { name: 'हिंदी' });

    expect(enButton).toBeDefined();
    expect(hiButton).toBeDefined();
    expect(enButton.getAttribute('aria-checked')).toBe('true');
    expect(hiButton.getAttribute('aria-checked')).toBe('false');
  });

  it('switches to Hindi on click, updates localStorage, and synchronizes document.documentElement.lang', async () => {
    render(<LanguageSwitcher />);

    const hiButton = screen.getByRole('radio', { name: 'हिंदी' });

    await act(async () => {
      fireEvent.click(hiButton);
    });

    expect(i18n.language).toBe('hi');
    expect(localStorage.getItem(STORAGE_LANG_KEY)).toBe('hi');
    expect(document.documentElement.lang).toBe('hi');
    expect(hiButton.getAttribute('aria-checked')).toBe('true');
  });

  it('switches back to English smoothly', async () => {
    render(<LanguageSwitcher />);

    const hiButton = screen.getByRole('radio', { name: 'हिंदी' });
    const enButton = screen.getByRole('radio', { name: 'EN' });

    await act(async () => {
      fireEvent.click(hiButton);
    });
    expect(i18n.language).toBe('hi');

    await act(async () => {
      fireEvent.click(enButton);
    });
    expect(i18n.language).toBe('en');
    expect(localStorage.getItem(STORAGE_LANG_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(enButton.getAttribute('aria-checked')).toBe('true');
  });
});
