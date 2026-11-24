import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Login from './pages/Login';
import Home from './pages/Home';
import Landing from './pages/Landing';
import Onboarding from './pages/Onboarding';
import AcceptInvite from './pages/AcceptInvite';
import WeddingLayout from './pages/WeddingLayout';
import Settings from './pages/Settings';
import Billing from './pages/Billing';
import Overview from './features/Overview';
import Tasks from './features/Tasks';
import Vendors from './features/Vendors';
import Budget from './features/Budget';
import Guests from './features/Guests';
import Seating from './features/Seating';
import WeddingDay from './features/WeddingDay';
import Vision from './features/Vision';
import Files from './features/Files';
import Hashtags from './features/Hashtags';
import { ModuleGate } from './pages/ModuleGate';

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return null;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  return <>{children}</>;
}

/** Signed-out visitors see the landing page; signed-in people go to their wedding. */
function Root() {
  const { session, loading } = useAuth();
  if (loading) return null;
  return session ? <Home /> : <Landing />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/" element={<Root />} />
      <Route path="/new" element={<RequireAuth><Onboarding /></RequireAuth>} />
      <Route path="/w/:weddingId" element={<RequireAuth><WeddingLayout /></RequireAuth>}>
        <Route index element={<Overview />} />
        <Route path="tasks" element={<ModuleGate module="tasks"><Tasks /></ModuleGate>} />
        <Route path="vendors" element={<ModuleGate module="vendors"><Vendors /></ModuleGate>} />
        <Route path="budget" element={<ModuleGate module="budget"><Budget /></ModuleGate>} />
        <Route path="guests" element={<ModuleGate module="guests"><Guests /></ModuleGate>} />
        <Route path="seating" element={<ModuleGate module="seating"><Seating /></ModuleGate>} />
        <Route path="day" element={<ModuleGate module="day"><WeddingDay /></ModuleGate>} />
        <Route path="vision" element={<ModuleGate module="vision"><Vision /></ModuleGate>} />
        <Route path="files" element={<ModuleGate module="files"><Files /></ModuleGate>} />
        <Route path="hashtags" element={<ModuleGate module="hashtags"><Hashtags /></ModuleGate>} />
        <Route path="settings" element={<Settings />} />
        <Route path="billing" element={<Billing />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
