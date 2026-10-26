import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

export function SignupPage() {
  const { t, i18n } = useTranslation();
  const { user, registerWithEmail, loginWithGoogle, isConfigured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/planner';

  // If already logged in, redirect
  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError(t('auth.provideValidEmail'));
      return;
    }

    if (password.length < 6) {
      setError(t('auth.passwordMinLength'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.passwordsMismatch'));
      return;
    }

    try {
      setIsLoading(true);
      await registerWithEmail(email, password, displayName);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.loading'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setError(null);
      setIsGoogleLoading(true);
      await loginWithGoogle();
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-up failed. Please try again.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const isHindi = i18n.language === 'hi';

  return (
    <div className="min-h-screen bg-navy-950 text-gray-100 flex flex-col justify-between selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 -right-48 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -left-48 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      {/* Top minimalistic bar */}
      <header className="relative z-10 border-b border-white/[0.08] bg-navy-950/80 backdrop-blur-md h-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group" aria-label="Return to Delhi Metro Home">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-glow-cyan/30 group-hover:scale-105 transition-transform duration-200">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="6" width="18" height="12" rx="3" strokeWidth="2" />
                <path d="M7 6V4a2 2 0 012-2h6a2 2 0 012 2v2" strokeWidth="2" />
                <circle cx="8" cy="18" r="1.5" fill="currentColor" />
                <circle cx="16" cy="18" r="1.5" fill="currentColor" />
                <line x1="7" y1="10" x2="17" y2="10" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <span className="text-sm font-extrabold text-white font-display tracking-tight">
                {t('nav.delhiMetro')}
              </span>
              <span className="text-[10px] text-cyan-400 font-mono block -mt-1">
                {t('auth.authPortal')}
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3 sm:gap-4">
            <LanguageSwitcher />
            <Link
              to="/planner"
              className="text-xs font-mono text-gray-400 hover:text-cyan-300 transition-colors flex items-center gap-1.5"
            >
              <span className="hidden sm:inline">{t('auth.skipToPlanner')}</span>
              <span className="sm:hidden">{t('nav.planner')}</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Form Container */}
      <main className="relative z-10 flex-grow flex items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md">
          <div className="glass-card p-6 sm:p-8 border border-white/[0.09] shadow-card bg-navy-900/90 backdrop-blur-xl">
            {/* Header info */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 text-[11px] font-mono mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                {t('auth.passengerRegistration')}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
                {t('auth.createAccountTitle')}
              </h1>
              <p className="text-xs text-gray-400 mt-1 font-sans">
                {t('auth.signUpSubtitle')}
              </p>
            </div>

            {/* Missing Configuration Notice */}
            {!isConfigured && (
              <div
                role="alert"
                className="mb-5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-sans flex items-start gap-2.5"
              >
                <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="font-semibold text-amber-300">{t('auth.firebaseRequired')}</p>
                  <p className="text-[11px] text-amber-200/90 mt-0.5 leading-relaxed">
                    {t('auth.firebaseRequiredDesc')}
                  </p>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs font-sans flex items-start gap-2.5"
              >
                <svg className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <p className="font-medium">{error}</p>
                </div>
              </div>
            )}

            {/* Google Sign-in */}
            <button
              type="button"
              id="btn-google-signup"
              onClick={handleGoogleSignIn}
              disabled={isLoading || isGoogleLoading || !isConfigured}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] active:bg-white/[0.12] border border-white/10 text-gray-200 hover:text-white text-xs font-semibold font-sans transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            >
              {isGoogleLoading ? (
                <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>{t('auth.googleSignUp')}</span>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="h-px bg-white/[0.08] flex-1" />
              <span className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">{t('auth.orWithEmail')}</span>
              <div className="h-px bg-white/[0.08] flex-1" />
            </div>

            {/* Registration Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="signup-name" className="block text-xs font-medium text-gray-300 mb-1.5 font-sans">
                  {t('auth.fullNameLabel')}
                </label>
                <input
                  id="signup-name"
                  type="text"
                  name="name"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('auth.fullNamePlaceholder')}
                  disabled={isLoading || isGoogleLoading}
                  className="metro-input"
                />
              </div>

              <div>
                <label htmlFor="signup-email" className="block text-xs font-medium text-gray-300 mb-1.5 font-sans">
                  {t('auth.emailLabel')}
                </label>
                <input
                  id="signup-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  disabled={isLoading || isGoogleLoading}
                  className="metro-input"
                />
              </div>

              <div>
                <label htmlFor="signup-password" className="block text-xs font-medium text-gray-300 mb-1.5 font-sans">
                  {t('auth.passwordLabel')} <span className="text-gray-500 text-[11px]">{t('auth.min6Chars')}</span>
                </label>
                <div className="relative">
                  <input
                    id="signup-password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={isLoading || isGoogleLoading}
                    className="metro-input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-200 transition-colors text-xs font-mono"
                    aria-label={showPassword ? t('auth.hidePasswordAria') : t('auth.showPasswordAria')}
                  >
                    {showPassword ? (isHindi ? 'छुपाएं' : 'Hide') : (isHindi ? 'दिखाएं' : 'Show')}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="signup-confirm-password" className="block text-xs font-medium text-gray-300 mb-1.5 font-sans">
                  {t('auth.confirmPasswordLabel')}
                </label>
                <input
                  id="signup-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isLoading || isGoogleLoading}
                  className="metro-input"
                />
              </div>

              <button
                type="submit"
                id="btn-signup-submit"
                disabled={isLoading || isGoogleLoading || !isConfigured}
                className="w-full btn-primary py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 mt-2 shadow-glow-blue hover:shadow-glow-cyan"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{t('auth.registering')}</span>
                  </>
                ) : (
                  <span>{t('auth.registerBtn')}</span>
                )}
              </button>
            </form>

            {/* Footer switcher */}
            <div className="mt-6 pt-5 border-t border-white/[0.08] text-center">
              <p className="text-xs text-gray-400 font-sans">
                {t('auth.haveAccountPrompt')}{' '}
                <Link
                  to="/login"
                  className="font-semibold text-cyan-400 hover:text-cyan-300 underline underline-offset-2 ml-1"
                >
                  {t('auth.signInBtn')}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/[0.06] py-4 text-center text-xs text-gray-500 font-mono">
        {t('auth.footerProtected')}
      </footer>
    </div>
  );
}
