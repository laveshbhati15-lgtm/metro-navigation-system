import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LandingPage } from '@/pages/LandingPage';
import { PlannerPage } from '@/pages/PlannerPage';
import { TicketsPage } from '@/pages/TicketsPage';

function NotFound() {
  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center text-center px-6">
      <div>
        <p className="text-6xl font-extrabold font-display gradient-text mb-4">404</p>
        <p className="text-gray-400 mb-6">Page not found</p>
        <a href="/" className="btn-primary">← Go home</a>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/planner" element={<PlannerPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
