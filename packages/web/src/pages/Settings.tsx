import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { formatCompact } from '@devpulse/shared';
import { api } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { ErrorNotice } from '../components/ErrorNotice';

/** Project settings: the write key, the install snippet and retention. */
export function Settings(): JSX.Element {
  const { slug = '' } = useParams();
  const project = useAsync(() => api.projects.get(slug), [slug]);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (project.error) return <ErrorNotice error={project.error} onRetry={project.reload} />;

  const snippet = buildSnippet(rotatedKey ?? 'YOUR_WRITE_KEY');

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access needs a secure context; the textarea is selectable anyway.
    }
  };

  const rotate = async (): Promise<void> => {
    if (!project.data) return;
    const confirmed = window.confirm(
      'Rotating the key immediately stops the old one working. Any site still using it will stop reporting. Continue?',
    );
    if (!confirmed) return;

    const res = await api.projects.rotateKey(project.data.project.id);
    setRotatedKey(res.writeKey);
  };

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Settings</h1>
          <p className="page__subtitle">{project.data?.project.name}</p>
        </div>
      </header>

      <section className="panel">
        <h2 className="panel__title">Install snippet</h2>
        <p className="panel__hint">
          Paste this before <code>&lt;/body&gt;</code> on every page you want to track.
        </p>

        <textarea className="code-block" readOnly rows={12} value={snippet} spellCheck={false} />

        <div className="panel__actions">
          <button type="button" className="button" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy snippet'}
          </button>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel__title">Write key</h2>
        <p className="panel__hint">
          The key is stored hashed, so it can only be shown once. If you have lost it, rotate it.
        </p>

        {rotatedKey ? (
          <div className="notice notice--success">
            <div>
              <p className="notice__title">New write key</p>
              <code className="notice__code">{rotatedKey}</code>
              <p className="notice__detail">
                Copy it now — it will not be shown again after you leave this page.
              </p>
            </div>
          </div>
        ) : null}

        <div className="panel__actions">
          <button type="button" className="button button--danger" onClick={() => void rotate()}>
            Rotate write key
          </button>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel__title">Data</h2>
        <dl className="definition-list">
          <dt>Events stored</dt>
          <dd>{formatCompact(project.data?.stats.events ?? 0)}</dd>
          <dt>Retention</dt>
          <dd>{project.data?.project.retentionDays ?? 0} days</dd>
          <dt>Allowed origins</dt>
          <dd>
            {project.data?.project.allowedOrigins.length
              ? project.data.project.allowedOrigins.join(', ')
              : 'any origin'}
          </dd>
          <dt>Project slug</dt>
          <dd className="table__mono">{project.data?.project.slug}</dd>
        </dl>
      </section>
    </div>
  );
}

/**
 * The tracking snippet.
 *
 * It batches events and flushes on `pagehide` via `sendBeacon`, because a normal
 * fetch is cancelled when the page unloads and the last pageview of a visit is
 * exactly the one that would be lost.
 */
function buildSnippet(writeKey: string): string {
  return `<script>
(function () {
  var ENDPOINT = ${JSON.stringify(window.location.origin)} + '/api/ingest';
  var KEY = '${writeKey}';
  var queue = [];
  var anon = localStorage.getItem('dp_anon') || 'anon_' + Math.random().toString(36).slice(2, 14);
  var session = sessionStorage.getItem('dp_ses') || 'ses_' + Math.random().toString(36).slice(2, 14);
  localStorage.setItem('dp_anon', anon);
  sessionStorage.setItem('dp_ses', session);

  function flush(useBeacon) {
    if (!queue.length) return;
    var body = JSON.stringify({ events: queue.splice(0, queue.length), sdk: 'snippet/1.0' });
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT + '?key=' + KEY, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Write-Key': KEY },
        body: body,
        keepalive: true,
      });
    }
  }

  window.devpulse = function (name, properties) {
    queue.push({
      kind: 'track', name: name, anonymousId: anon, sessionId: session,
      timestamp: new Date().toISOString(), url: location.href, properties: properties || {},
    });
    if (queue.length >= 20) flush(false);
  };

  queue.push({
    kind: 'pageview', name: 'page_view', anonymousId: anon, sessionId: session,
    timestamp: new Date().toISOString(), url: location.href, referrer: document.referrer,
  });

  setInterval(function () { flush(false); }, 10000);
  addEventListener('pagehide', function () { flush(true); });
})();
</script>`;
}
