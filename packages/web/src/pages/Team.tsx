import { useState } from 'react';
import type { Role } from '@devpulse/shared';
import { api, ApiError } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { ErrorNotice } from '../components/ErrorNotice';
import { Skeleton } from '../components/Skeleton';

const ROLES: Role[] = ['viewer', 'admin', 'owner'];

const ROLE_HELP: Record<Role, string> = {
  viewer: 'Reads analytics for their own projects.',
  admin: 'Creates and configures projects, rotates write keys.',
  owner: 'Everything, including deleting projects and managing the team.',
};

/** Team administration: roles, removal, and your own password. */
export function Team(): JSX.Element {
  const { user } = useAuth();
  const team = useAsync(() => api.users.list(), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = user?.role === 'owner';

  const changeRole = async (id: string, role: Role): Promise<void> => {
    setBusyId(id);
    setError(null);
    try {
      await api.users.updateRole(id, role);
      team.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change that role');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string, name: string): Promise<void> => {
    if (!window.confirm(`Remove ${name}? Their projects and events are deleted with them.`)) return;

    setBusyId(id);
    setError(null);
    try {
      await api.users.remove(id);
      team.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that account');
    } finally {
      setBusyId(null);
    }
  };

  if (team.error) return <ErrorNotice error={team.error} onRetry={team.reload} />;

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Team</h1>
          <p className="page__subtitle">
            {canManage
              ? 'Owners can change roles and remove accounts.'
              : 'Only an owner can change roles.'}
          </p>
        </div>
      </header>

      {error ? (
        <p className="notice notice--error notice--compact" role="alert">
          {error}
        </p>
      ) : null}

      <section className="panel">
        <h2 className="panel__title">Members</h2>

        {team.loading ? (
          <Skeleton rows={3} height={32} />
        ) : (
          <ul className="project-list">
            {team.data?.data.map((member) => (
              <li key={member.id} className="project-list__item">
                <div>
                  <strong>{member.name}</strong>
                  <span className="project-list__meta"> {member.email}</span>
                  <p className="field__hint">{ROLE_HELP[member.role]}</p>
                </div>

                <div className="panel__actions">
                  <label className="field field--inline">
                    <span className="field__label">Role</span>
                    <select
                      className="field__input"
                      value={member.role}
                      disabled={!canManage || busyId === member.id}
                      onChange={(e) => void changeRole(member.id, e.target.value as Role)}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    className="button button--danger"
                    // Removing yourself mid-session leaves a valid token for an
                    // account that no longer exists, so the API refuses it too.
                    disabled={!canManage || member.id === user?.id || busyId === member.id}
                    onClick={() => void remove(member.id, member.name)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PasswordPanel />
    </div>
  );
}

function PasswordPanel(): JSX.Element {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    setError(null);

    try {
      const res = await api.users.changePassword(currentPassword, newPassword);
      setResult(
        res.revoked > 0
          ? `Password changed. ${res.revoked} other session(s) were signed out.`
          : 'Password changed.',
      );
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      const detail = err instanceof ApiError ? err.details[0]?.message : null;
      setError(detail ?? (err instanceof Error ? err.message : 'Could not change the password'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2 className="panel__title">Your password</h2>
      <p className="panel__hint">
        Changing it signs out every other session, which is the point of changing it after a
        suspected compromise.
      </p>

      <form className="auth__form" onSubmit={(e) => void submit(e)}>
        <label className="field">
          <span className="field__label">Current password</span>
          <input
            type="password"
            className="field__input"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field__label">New password</span>
          <input
            type="password"
            className="field__input"
            autoComplete="new-password"
            required
            minLength={10}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <span className="field__hint">At least 10 characters.</span>
        </label>

        {error ? (
          <p className="notice notice--error notice--compact" role="alert">
            {error}
          </p>
        ) : null}
        {result ? (
          <p className="notice notice--success notice--compact" role="status">
            {result}
          </p>
        ) : null}

        <button type="submit" className="button" disabled={busy}>
          {busy ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </section>
  );
}
