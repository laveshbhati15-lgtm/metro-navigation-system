import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';

export function AuthNavControl() {
  const { t } = useTranslation();
  const { user, loading, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown on outside click or ESC key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setDropdownOpen(false);
      }
    }

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dropdownOpen]);

  // Loading state placeholder (prevents navbar button flickering during initial auth check)
  if (loading) {
    return (
      <div
        className="h-8 w-20 rounded-xl bg-white/[0.05] border border-white/10 animate-pulse flex items-center justify-center"
        aria-label="Checking passenger authentication"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/40 animate-ping" />
      </div>
    );
  }

  // Unauthenticated: Show Sign In link
  if (!user) {
    return (
      <Link
        to="/login"
        id="nav-auth-login-btn"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-medium text-cyan-300 hover:text-white bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 hover:border-cyan-400/60 shadow-sm transition-all duration-200 active:scale-95"
      >
        <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
        <span>{t('nav.signIn')}</span>
      </Link>
    );
  }

  // Authenticated: Show Avatar chip with dropdown
  const initials = user.displayName
    ? user.displayName
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : (user.email?.[0] || 'U').toUpperCase();

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
      setDropdownOpen(false);
      navigate('/');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        id="nav-user-menu-btn"
        onClick={() => setDropdownOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={dropdownOpen}
        aria-label="Open passenger user menu"
        className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-xl bg-navy-900/90 hover:bg-navy-850 border border-white/10 hover:border-cyan-500/40 transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
      >
        {/* Avatar or Photo */}
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName || 'User avatar'}
            className="w-6 h-6 rounded-lg object-cover border border-cyan-400/40"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 text-white font-mono font-bold text-[11px] flex items-center justify-center border border-cyan-400/30">
            {initials}
          </div>
        )}

        {/* Short display name or email */}
        <span className="hidden sm:inline-block max-w-[110px] truncate text-xs font-mono text-gray-200 group-hover:text-cyan-300 transition-colors">
          {user.displayName || user.email?.split('@')[0]}
        </span>

        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${
            dropdownOpen ? 'rotate-180 text-cyan-400' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {dropdownOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="nav-user-menu-btn"
          className="absolute right-0 mt-2 w-64 rounded-2xl bg-navy-900/95 backdrop-blur-xl border border-white/10 shadow-card-hover py-2 z-[2000] animate-fade-in text-xs font-sans"
        >
          {/* User Details Header */}
          <div className="px-4 py-3 border-b border-white/[0.08]">
            <p className="text-white font-semibold font-display truncate">
              {user.displayName || t('nav.traveler')}
            </p>
            <p className="text-gray-400 font-mono text-[11px] truncate mt-0.5" title={user.email || ''}>
              {user.email}
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                {t('nav.authActive')}
              </span>
              {user.emailVerified && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {t('nav.verified')}
                </span>
              )}
            </div>
          </div>

          {/* Links */}
          <div className="py-1">
            <Link
              to="/profile"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-gray-300 hover:text-white hover:bg-white/[0.06] transition-colors"
              role="menuitem"
            >
              <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{t('nav.accountProfile')}</span>
            </Link>

            <Link
              to="/planner"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-gray-300 hover:text-white hover:bg-white/[0.06] transition-colors"
              role="menuitem"
            >
              <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
              <span>{t('nav.planner')}</span>
            </Link>

            <Link
              to="/tickets"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-gray-300 hover:text-white hover:bg-white/[0.06] transition-colors"
              role="menuitem"
            >
              <span className="text-sm">🎟️</span>
              <span>{t('nav.demoTickets')}</span>
            </Link>
          </div>

          {/* Logout Action */}
          <div className="pt-1 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 transition-colors text-left disabled:opacity-50"
              role="menuitem"
            >
              <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              <span>{isLoggingOut ? t('nav.signingOut') : t('nav.signOut')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
