import { useState } from 'react';
import { ApiError } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

/** Sign-in and first-run registration, on one screen. */
export function Login(): JSX.Element {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      if (mode === 'login') await login(email, password);
      else await register(email, name, password);
    } catch (err) {
      // Field-level detail is more useful than the generic message here.
      const detail = err instanceof ApiError ? err.details[0]?.message : null;
      setError(detail ?? (err instanceof Error ? err.message : 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <div className="auth__card">
        <h1 className="auth__title">DevPulse</h1>
        <p className="auth__subtitle">
          {mode === 'login' ? 'Sign in to your dashboard' : 'Create the first account'}
        </p>

        <form onSubmit={(e) => void submit(e)} className="auth__form">
          <label className="field">
            <span className="field__label">Email</span>
            <input
              type="email"
              className="field__input"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          {mode === 'register' ? (
            <label className="field">
              <span className="field__label">Name</span>
              <input
                type="text"
                className="field__input"
                autoComplete="name"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          ) : null}

          <label className="field">
            <span className="field__label">Password</span>
            <input
              type="password"
              className="field__input"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'register' ? 10 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'register' ? (
              <span className="field__hint">At least 10 characters.</span>
            ) : null}
          </label>

          {error ? (
            <p className="notice notice--error notice--compact" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="button button--block" disabled={busy}>
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          className="auth__toggle"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
        >
          {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
        </button>
      </div>
    </main>
  );
}
