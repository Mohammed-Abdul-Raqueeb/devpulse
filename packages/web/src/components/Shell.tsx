import type { ReactNode } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ThemeToggle } from './ThemeToggle';

const PROJECT_TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'events', label: 'Events', end: false },
  { to: 'funnels', label: 'Funnels', end: false },
  { to: 'retention', label: 'Retention', end: false },
  { to: 'settings', label: 'Settings', end: false },
];

/** App chrome: brand, project tabs and the account menu. */
export function Shell({ children }: { children: ReactNode }): JSX.Element {
  const { slug } = useParams();
  const { user, logout } = useAuth();

  return (
    <div className="shell">
      <header className="shell__bar">
        <Link to="/" className="shell__brand">
          <span className="shell__logo" aria-hidden="true" />
          DevPulse
        </Link>

        {slug ? (
          <nav className="shell__tabs" aria-label="Project sections">
            {PROJECT_TABS.map((tab) => (
              <NavLink
                key={tab.label}
                to={`/p/${slug}${tab.to ? `/${tab.to}` : ''}`}
                end={tab.end}
                className={({ isActive }) => `shell__tab ${isActive ? 'is-active' : ''}`}
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        ) : (
          <span className="shell__tabs" />
        )}

        <div className="shell__account">
          <ThemeToggle />
          {user?.role !== 'viewer' ? (
            <Link to="/team" className="shell__tab">
              Team
            </Link>
          ) : null}
          <span className="shell__user" title={user?.email}>
            {user?.name} · {user?.role}
          </span>
          <button type="button" className="button button--ghost" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="shell__main">{children}</main>

      <footer className="shell__footer">
        <p>
          DevPulse · self-hosted analytics ·{' '}
          <a href="https://github.com/Mohammed-Abdul-Raqueeb/devpulse">source</a>
        </p>
      </footer>
    </div>
  );
}
