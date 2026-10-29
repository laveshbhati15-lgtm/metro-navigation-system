import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider } from '@/context/AuthContext';
import { LandingPage } from '@/pages/LandingPage';
import { PlannerPage } from '@/pages/PlannerPage';
import { TicketsPage } from '@/pages/TicketsPage';
import { CheckoutPage } from '@/pages/CheckoutPage';
import { LoginPage } from '@/pages/LoginPage';
import { SignupPage } from '@/pages/SignupPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ProfilePage } from '@/pages/ProfilePage';

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center text-center px-6 selection:bg-cyan-500/30">
      <div className="glass-card p-8 sm:p-12 max-w-md border border-white/10 shadow-card">
        <p className="text-6xl font-extrabold font-display gradient-text mb-4">404</p>
        <h1 className="text-lg font-bold text-white mb-2">{t('common.notFoundTitle')}</h1>
        <p className="text-gray-400 text-xs mb-6 font-sans">
          {t('common.notFoundDesc')}
        </p>
        <Link to="/" className="btn-primary text-xs py-2.5 px-6">
          {t('common.returnHome')}
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/metro-pay" element={<CheckoutPage />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
