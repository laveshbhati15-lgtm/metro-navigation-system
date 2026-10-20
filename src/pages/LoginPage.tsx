import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export function LoginPage() {
  const { user, loginWithEmail, loginWithGoogle, isConfigured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Determine redirect target
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/planner';

  // If already logged in, redirect
  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter both your email address and password.');
      return;
    }

    try {
      setError(null);
      setIsLoading(true);
      await loginWithEmail(email, password);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to sign in. Please try again.');
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
      setError(err instanceof Error ? err.message : 'Google sign-in failed. Please try again.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-950 text-gray-100 flex flex-col justify-between selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 -left-48 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
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
                Delhi Metro
              </span>
              <span className="text-[10px] text-cyan-400 font-mono block -mt-1">
                Metroverse Auth
              </span>
            </div>
          </Link>

          <Link
            to="/planner"
            className="text-xs font-mono text-gray-400 hover:text-cyan-300 transition-colors flex items-center gap-1.5"
          >
            <span>Skip to Public Planner</span>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </div>
      </header>

      {/* Main Form Container */}
      <main className="relative z-10 flex-grow flex items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="glass-card p-6 sm:p-8 border border-white/[0.09] shadow-card bg-navy-900/90 backdrop-blur-xl">
            {/* Header info */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 text-[11px] font-mono mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                Passenger Portal
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
                Welcome Back
              </h1>
              <p className="text-xs text-gray-400 mt-1 font-sans">
                Sign in to manage your Delhi Metro journey experience
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
                  <p className="font-semibold text-amber-300">Firebase Setup Required</p>
                  <p className="text-[11px] text-amber-200/90 mt-0.5 leading-relaxed">
                    Set your Firebase project keys in <code className="text-cyan-300 font-mono">.env.local</code> (or Vercel Environment Variables) to enable live authentication.
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
              id="btn-google-signin"
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
              <span>Continue with Google</span>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="h-px bg-white/[0.08] flex-1" />
              <span className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">or email</span>
              <div className="h-px bg-white/[0.08] flex-1" />
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-xs font-medium text-gray-300 mb-1.5 font-sans">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    id="login-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    disabled={isLoading || isGoogleLoading}
                    className="metro-input pl-10"
                  />
                  <svg
                    className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5 pointer-events-none"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                  </svg>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-password" className="text-xs font-medium text-gray-300 font-sans">
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={isLoading || isGoogleLoading}
                    className="metro-input pl-10 pr-10"
                  />
                  <svg
                    className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5 pointer-events-none"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-200 transition-colors text-xs font-mono"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                id="btn-login-submit"
                disabled={isLoading || isGoogleLoading || !isConfigured}
                className="w-full btn-primary py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 mt-2 shadow-glow-blue hover:shadow-glow-cyan"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Sign In</span>
                )}
              </button>
            </form>

            {/* Footer switcher */}
            <div className="mt-6 pt-5 border-t border-white/[0.08] text-center">
              <p className="text-xs text-gray-400 font-sans">
                Don&apos;t have a passenger account?{' '}
                <Link
                  to="/signup"
                  className="font-semibold text-cyan-400 hover:text-cyan-300 underline underline-offset-2 ml-1"
                >
                  Create Account
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Notice */}
      <footer className="relative z-10 border-t border-white/[0.06] py-4 text-center text-xs text-gray-500 font-mono">
        Delhi Metro Navigator · Protected with Firebase Authentication
      </footer>
    </div>
  );
}
