import { useTranslation } from 'react-i18next';

interface LanguageSwitcherProps {
  className?: string;
}

export function LanguageSwitcher({ className = '' }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();
  const currentLang = i18n.language?.startsWith('hi') ? 'hi' : 'en';

  const setLanguage = (lang: 'en' | 'hi') => {
    if (currentLang !== lang) {
      i18n.changeLanguage(lang);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Language selector / भाषा चयनकर्ता"
      className={`inline-flex items-center p-0.5 rounded-xl bg-navy-900/90 backdrop-blur-md border border-white/10 hover:border-cyan-500/40 transition-colors shadow-sm text-xs font-mono select-none ${className}`}
    >
      {/* Globe Icon */}
      <span className="pl-1.5 pr-0.5 text-cyan-400/80 flex items-center justify-center" aria-hidden="true">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="9" strokeWidth="1.6" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.6}
            d="M3.6 9h16.8M3.6 15h16.8M12 3a14.3 14.3 0 013 9 14.3 14.3 0 01-3 9 14.3 14.3 0 01-3-9 14.3 14.3 0 013-9z"
          />
        </svg>
      </span>

      {/* English Option */}
      <button
        type="button"
        role="radio"
        id="lang-btn-en"
        aria-checked={currentLang === 'en'}
        onClick={() => setLanguage('en')}
        className={`px-2 py-0.5 rounded-lg transition-all duration-200 text-[11px] font-semibold leading-tight flex items-center ${
          currentLang === 'en'
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-glow-cyan/20'
            : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
        }`}
      >
        EN
      </button>

      {/* Subtle Separator */}
      <span className="text-white/20 text-[10px] px-0.5 select-none" aria-hidden="true">
        |
      </span>

      {/* Hindi Option */}
      <button
        type="button"
        role="radio"
        id="lang-btn-hi"
        aria-checked={currentLang === 'hi'}
        onClick={() => setLanguage('hi')}
        className={`px-2 py-0.5 rounded-lg transition-all duration-200 text-[11px] font-semibold font-hindi leading-tight flex items-center ${
          currentLang === 'hi'
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-glow-cyan/20'
            : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
        }`}
      >
        हिंदी
      </button>
    </div>
  );
}

export default LanguageSwitcher;
