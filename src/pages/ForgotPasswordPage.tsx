import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export function ForgotPasswordPage() {
  const { resetPassword, isConfigured } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please provide your registered email address.');
      return;
    }

    try {
      setError(null);
      setIsLoading(true);
      await resetPassword(email);
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send password reset email.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-950 text-gray-100 flex flex-col justify-between selection:bg-cyan-500/30 selection:text-cyan-200">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
      </div>

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
                Password Recovery
              </span>
            </div>
          </Link>

          <Link
            to="/login"
            className="text-xs font-mono text-gray-400 hover:text-cyan-300 transition-colors flex items-center gap-1.5"
          >
            <span>← Back to Sign In</span>
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-grow flex items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md">
          <div className="glass-card p-6 sm:p-8 border border-white/[0.09] shadow-card bg-navy-900/90 backdrop-blur-xl">
            <div className="text-center mb-6">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-3 text-cyan-300">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
              </div>
              <h1 className="text-2xl font-extrabold text-white font-display">
                Reset Password
              </h1>
              <p className="text-xs text-gray-400 mt-1.5 font-sans">
                Enter your registered email and we&apos;ll send you instructions to reset your password.
              </p>
            </div>

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
                    Set your Firebase credentials in <code className="text-cyan-300 font-mono">.env.local</code> to enable password recovery emails.
                  </p>
                </div>
              </div>
            )}

            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs font-sans flex items-start gap-2.5"
              >
                <svg className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="font-medium">{error}</p>
              </div>
            )}

            {success ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs font-sans">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold mb-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Recovery Email Dispatched</span>
                  </div>
                  <p className="text-[11px] text-emerald-200/90 leading-relaxed">
                    We sent a secure password reset link to <strong className="text-white">{email}</strong>. Check your inbox and spam folder.
                  </p>
                </div>

                <Link
                  to="/login"
                  className="w-full btn-primary py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                >
                  Return to Sign In
                </Link>

                <button
                  type="button"
                  onClick={() => setSuccess(false)}
                  className="w-full text-center text-xs font-mono text-cyan-400 hover:text-cyan-300 pt-1"
                >
                  Need to send to another address?
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="reset-email" className="block text-xs font-medium text-gray-300 mb-1.5 font-sans">
                    Email Address
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    disabled={isLoading}
                    className="metro-input"
                  />
                </div>

                <button
                  type="submit"
                  id="btn-reset-password-submit"
                  disabled={isLoading || !isConfigured}
                  className="w-full btn-primary py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-glow-blue hover:shadow-glow-cyan"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Sending Instructions...</span>
                    </>
                  ) : (
                    <span>Send Reset Instructions</span>
                  )}
                </button>

                <div className="pt-4 text-center">
                  <Link
                    to="/login"
                    className="text-xs font-mono text-gray-400 hover:text-cyan-300 transition-colors"
                  >
                    ← Back to Sign In
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/[0.06] py-4 text-center text-xs text-gray-500 font-mono">
        Delhi Metro Navigator · Protected with Firebase Authentication
      </footer>
    </div>
  );
}
