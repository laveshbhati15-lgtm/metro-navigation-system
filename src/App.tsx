import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { LandingPage } from '@/pages/LandingPage';
import { PlannerPage } from '@/pages/PlannerPage';
import { TicketsPage } from '@/pages/TicketsPage';
import { LoginPage } from '@/pages/LoginPage';
import { SignupPage } from '@/pages/SignupPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ProfilePage } from '@/pages/ProfilePage';

function NotFound() {
  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center text-center px-6 selection:bg-cyan-500/30">
      <div className="glass-card p-8 sm:p-12 max-w-md border border-white/10 shadow-card">
        <p className="text-6xl font-extrabold font-display gradient-text mb-4">404</p>
        <h1 className="text-lg font-bold text-white mb-2">Station Not Found</h1>
        <p className="text-gray-400 text-xs mb-6 font-sans">
          The requested track or page does not exist in the Delhi Metro network.
        </p>
        <Link to="/" className="btn-primary text-xs py-2.5 px-6">
          ← Return to Metro Home
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
