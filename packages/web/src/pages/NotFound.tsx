import { Link } from 'react-router-dom';

/**
 * Shown for an unknown route.
 *
 * A redirect would be simpler, but it hides the mistake: a stale bookmark or a
 * mistyped slug silently lands on the project list and looks like the project
 * vanished. Saying so is more useful.
 */
export function NotFound(): JSX.Element {
  return (
    <div className="page">
      <section className="panel panel--centered">
        <h1 className="page__title">Nothing here</h1>
        <p className="panel__hint">
          That page does not exist. If you followed a link to a project, it may have been renamed or
          deleted — its slug is part of the URL.
        </p>
        <div className="panel__actions">
          <Link className="button" to="/">
            Back to projects
          </Link>
        </div>
      </section>
    </div>
  );
}
