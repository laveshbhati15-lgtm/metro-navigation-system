import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { useTicketStore } from '@/features/tickets/ticketStore';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

export function ProfilePage() {
  const { t } = useTranslation();
  const { user, loading, logout, resetPassword } = useAuth();
  const navigate = useNavigate();
  const { tickets } = useTicketStore();

  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);

  const handleSendReset = async () => {
    if (!user?.email) return;
    try {
      setIsSendingReset(true);
      setResetError(null);
      await resetPassword(user.email);
      setResetSent(true);
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : 'Failed to send reset email.');
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
      navigate('/');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleCopyUid = () => {
    if (user?.uid) {
      navigator.clipboard.writeText(user.uid);
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center text-cyan-300">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <p className="font-mono text-xs text-gray-400">{t('profile.loadingCredentials')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-950 text-gray-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Navbar */}
      <header className="border-b border-white/[0.08] bg-navy-950/95 backdrop-blur-md sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group" aria-label="Delhi Metro Navigator Home">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-glow-cyan/40 group-hover:scale-105 transition-transform duration-200">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="6" width="18" height="12" rx="3" strokeWidth="2" />
                <path d="M7 6V4a2 2 0 012-2h6a2 2 0 012 2v2" strokeWidth="2" />
                <circle cx="8" cy="18" r="1.5" fill="currentColor" />
                <circle cx="16" cy="18" r="1.5" fill="currentColor" />
                <line x1="7" y1="10" x2="17" y2="10" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-extrabold text-white leading-tight font-display tracking-tight">
                {t('nav.brand')}
              </p>
              <p className="text-[11px] text-cyan-400/90 leading-tight font-mono">
                {t('profile.title')}
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-2 text-xs font-mono">
              <Link
                to="/"
                className="text-gray-300 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
              >
                {t('nav.home')}
              </Link>
              <Link
                to="/planner"
                className="text-gray-300 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
              >
                {t('nav.planner')}
              </Link>
              <Link
                to="/tickets"
                className="text-gray-300 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
              >
                {t('nav.demoTickets')} ({tickets.length})
              </Link>
            </nav>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-grow w-full">
        {!user ? (
          <div className="glass-card p-8 sm:p-12 text-center max-w-lg mx-auto">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-4 text-cyan-400">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold font-display text-white mb-2">
              {t('profile.signInRequiredTitle')}
            </h1>
            <p className="text-sm text-gray-400 mb-6 font-sans">
              {t('profile.signInRequiredDesc')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/login" className="btn-primary text-xs py-2.5 px-6">
                {t('profile.signInBtn')}
              </Link>
              <Link to="/signup" className="btn-ghost text-xs py-2.5 px-6">
                {t('profile.createAccountBtn')}
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Identity Card */}
            <div className="glass-card p-6 sm:p-8 relative overflow-hidden border border-white/[0.09]">
              <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'Passenger avatar'}
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-cyan-400/40 shadow-glow-cyan/20"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 text-white font-mono font-bold text-2xl flex items-center justify-center border border-cyan-400/30 shadow-glow-cyan/20">
                      {(user.displayName?.[0] || user.email?.[0] || 'P').toUpperCase()}
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-xl sm:text-2xl font-bold font-display text-white">
                        {user.displayName || t('nav.traveler')}
                      </h1>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-300 font-mono mt-0.5">
                      {user.email}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/25 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        {t('profile.activeSession')}
                      </span>
                      {user.emailVerified ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
                          ✓ {t('profile.emailVerified')}
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/25">
                          {t('profile.unverified')}
                        </span>
                      )}
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-white/5 text-gray-300 border border-white/10">
                        Provider: {user.providerData[0]?.providerId || 'firebase'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-mono transition-all duration-200 self-stretch sm:self-auto text-center"
                >
                  {isLoggingOut ? t('profile.signingOut') : t('profile.signOutBtn')}
                </button>
              </div>
            </div>

            {/* Account Details & Diagnostics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Profile Details */}
              <div className="glass-card p-5 sm:p-6 space-y-4">
                <h2 className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-semibold">
                  {t('profile.passengerAccount')}
                </h2>

                <div className="space-y-3 text-xs font-mono">
                  <div className="flex justify-between items-center py-1.5 border-b border-white/[0.06]">
                    <span className="text-gray-400">{t('profile.passengerUid')}</span>
                    <button
                      type="button"
                      onClick={handleCopyUid}
                      className="text-cyan-300 hover:text-white flex items-center gap-1.5 max-w-[180px] truncate"
                      title={user.uid}
                    >
                      <span className="truncate">{user.uid.slice(0, 10)}...</span>
                      <span className="text-[10px] text-gray-400">
                        {copiedUid ? `✓ ${t('profile.copiedUid')}` : `📋 ${t('profile.copyUid')}`}
                      </span>
                    </button>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-white/[0.06]">
                    <span className="text-gray-400">Member Since</span>
                    <span className="text-gray-200">
                      {user.metadata.creationTime
                        ? new Date(user.metadata.creationTime).toLocaleDateString()
                        : 'Current Session'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-white/[0.06]">
                    <span className="text-gray-400">Last Sign-in</span>
                    <span className="text-gray-200">
                      {user.metadata.lastSignInTime
                        ? new Date(user.metadata.lastSignInTime).toLocaleDateString()
                        : 'Active now'}
                    </span>
                  </div>
                </div>

                {/* Password reset action */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSendReset}
                    disabled={isSendingReset || resetSent}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-mono underline underline-offset-2 disabled:opacity-50"
                  >
                    {isSendingReset
                      ? t('profile.sendingReset')
                      : resetSent
                      ? `✓ ${t('profile.resetSuccessNotice')}`
                      : `${t('profile.sendResetBtn')} (${user.email})`}
                  </button>
                  {resetError && (
                    <p className="text-[11px] text-rose-300 mt-1">{resetError}</p>
                  )}
                </div>
              </div>

              {/* Storage & Privacy Architecture Card */}
              <div className="glass-card p-5 sm:p-6 space-y-4">
                <h2 className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-semibold">
                  {t('profile.ticketVaultHeader')}
                </h2>

                <div className="space-y-3 text-xs font-sans text-gray-300 leading-relaxed">
                  <div className="p-3 rounded-xl bg-navy-850/80 border border-white/10">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-white font-mono text-[11px]">
                        {t('profile.recentDemoTickets')}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono text-[10px]">
                        {tickets.length} Saved
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      {tickets.length === 0
                        ? t('profile.noTicketsYet')
                        : `${tickets.length} demo transit passes issued.`}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-200/90">
                    <p className="font-semibold text-cyan-300 font-mono mb-0.5">
                      {t('nav.tagline')}
                    </p>
                    <p>
                      All core navigation features (Dijkstra algorithm, station search, route calculation and interactive map) remain completely open and public without requiring an active session.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Navigation Footer */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link
                to="/planner"
                className="btn-primary text-xs py-3 px-5 text-center flex-1"
              >
                {t('profile.planJourneyBtn')}
              </Link>
              <Link
                to="/tickets"
                className="btn-ghost text-xs py-3 px-5 text-center flex-1"
              >
                {t('profile.viewAllTickets', { count: tickets.length })}
              </Link>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-white/[0.06] py-4 text-center text-xs text-gray-500 font-mono">
        {t('footer.rights')}
      </footer>
    </div>
  );
}
