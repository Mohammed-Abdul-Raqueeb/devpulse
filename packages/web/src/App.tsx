import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Shell } from './components/Shell';
import { Events } from './pages/Events';
import { Funnels } from './pages/Funnels';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { Projects } from './pages/Projects';
import { Settings } from './pages/Settings';

export function App(): JSX.Element {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}

function Router(): JSX.Element {
  const { user, initializing } = useAuth();

  // Rendering routes before the stored session is verified would flash the login
  // screen for an already-signed-in user.
  if (initializing) {
    return (
      <div className="boot">
        <p>Loading DevPulse…</p>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Projects />} />
        <Route path="/p/:slug" element={<Overview />} />
        <Route path="/p/:slug/events" element={<Events />} />
        <Route path="/p/:slug/funnels" element={<Funnels />} />
        <Route path="/p/:slug/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
