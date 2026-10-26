import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import hi from './locales/hi';
import type { LineCode, Station } from '@/core/graph/types';

export const STORAGE_LANG_KEY = 'delhi_metro_lang';

// Retrieve stored language or default to English
const getSavedLanguage = (): 'en' | 'hi' => {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_LANG_KEY);
      if (stored === 'en' || stored === 'hi') {
        return stored;
      }
    } catch {
      // Fallback if localStorage is inaccessible
    }
  }
  return 'en';
};

const initialLang = getSavedLanguage();

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
    },
    lng: initialLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    react: {
      useSuspense: false,
    },
  });

// Keep document.documentElement.lang in sync & persist
if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLang;
}

i18n.on('languageChanged', (lng: string) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng;
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_LANG_KEY, lng);
    } catch {
      // Ignore localStorage write errors
    }
  }
});

/**
 * Returns localized station name based on active language.
 * Preserves the underlying data/ID while rendering the preferred language.
 */
export function getStationDisplayName(
  station: Station | null | undefined,
  currentLang?: string
): string {
  if (!station) return '';
  const lang = currentLang || i18n.language || 'en';
  if (lang === 'hi' && station.nameHindi) {
    return station.nameHindi;
  }
  return station.name;
}

/**
 * Returns the secondary station name (for subtext or hints).
 * If active language is Hindi, returns English name; if English, returns Hindi name.
 */
export function getStationSecondaryName(
  station: Station | null | undefined,
  currentLang?: string
): string | null {
  if (!station) return null;
  const lang = currentLang || i18n.language || 'en';
  if (lang === 'hi') {
    return station.name;
  }
  return station.nameHindi || null;
}

/**
 * Returns localized line display name.
 */
export function getLocalizedLineName(line: LineCode | string, currentLang?: string): string {
  const lang = currentLang || i18n.language || 'en';
  const resource = lang === 'hi' ? hi : en;
  const lineKey = line as keyof typeof en.lines;
  return resource.lines[lineKey] || `${line} Line`;
}

export default i18n;
