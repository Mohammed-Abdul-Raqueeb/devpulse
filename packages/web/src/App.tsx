import { Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Shell } from './components/Shell';
import { Events } from './pages/Events';
import { Funnels } from './pages/Funnels';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';
import { Overview } from './pages/Overview';
import { Projects } from './pages/Projects';
import { Retention } from './pages/Retention';
import { Settings } from './pages/Settings';
import { Team } from './pages/Team';

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
      {/* Scoped to the routed screen, so a broken page keeps the shell usable. */}
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Projects />} />
          <Route path="/p/:slug" element={<Overview />} />
          <Route path="/p/:slug/events" element={<Events />} />
          <Route path="/p/:slug/funnels" element={<Funnels />} />
          <Route path="/p/:slug/retention" element={<Retention />} />
          <Route path="/p/:slug/settings" element={<Settings />} />
          <Route path="/team" element={<Team />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ErrorBoundary>
    </Shell>
  );
}
