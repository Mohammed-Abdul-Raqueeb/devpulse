import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { ErrorNotice } from '../components/ErrorNotice';

/** Project picker, and the only place a project gets created. */
export function Projects(): JSX.Element {
  const projects = useAsync(() => api.projects.list(), []);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<{ slug: string; writeKey: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!name.trim()) return;

    setBusy(true);
    try {
      const res = await api.projects.create(name.trim());
      setCreated({ slug: res.project.slug, writeKey: res.writeKey });
      setName('');
      projects.reload();
    } finally {
      setBusy(false);
    }
  };

  if (projects.error) return <ErrorNotice error={projects.error} onRetry={projects.reload} />;

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Projects</h1>
          <p className="page__subtitle">Each project has its own events and write key.</p>
        </div>
      </header>

      {created ? (
        <div className="notice notice--success">
          <div>
            <p className="notice__title">Project created</p>
            <code className="notice__code">{created.writeKey}</code>
            <p className="notice__detail">
              This write key is shown once. Copy it now, then open{' '}
              <Link to={`/p/${created.slug}/settings`}>Settings</Link> for the install snippet.
            </p>
          </div>
        </div>
      ) : null}

      <section className="panel">
        <h2 className="panel__title">New project</h2>
        <form className="inline-form" onSubmit={(e) => void create(e)}>
          <label className="field field--grow">
            <span className="field__label">Name</span>
            <input
              className="field__input"
              placeholder="Acme Marketing Site"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              required
            />
          </label>
          <button type="submit" className="button" disabled={busy}>
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </form>
      </section>

      <section className="panel">
        <h2 className="panel__title">All projects</h2>

        {projects.loading ? (
          <p className="panel__hint">Loading…</p>
        ) : (projects.data?.data.length ?? 0) === 0 ? (
          <p className="panel__hint">No projects yet. Create one above to get a write key.</p>
        ) : (
          <ul className="project-list">
            {projects.data?.data.map((project) => (
              <li key={project.id} className="project-list__item">
                <Link to={`/p/${project.slug}`} className="project-list__link">
                  <strong>{project.name}</strong>
                  <span className="table__mono">{project.slug}</span>
                </Link>
                <span className="project-list__meta">
                  {project.retentionDays}d retention · created{' '}
                  {new Date(project.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
