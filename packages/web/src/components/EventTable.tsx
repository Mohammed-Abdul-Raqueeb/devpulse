import { normalizePath } from '@devpulse/shared';
import type { StoredEvent } from '@devpulse/shared';

interface EventTableProps {
  events: StoredEvent[];
  loading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

const KIND_LABELS: Record<string, string> = {
  pageview: 'Pageview',
  track: 'Track',
  identify: 'Identify',
  error: 'Error',
};

/** The raw event feed. Properties are collapsed to a one-line summary per row. */
export function EventTable({
  events,
  loading = false,
  onLoadMore,
  hasMore = false,
}: EventTableProps): JSX.Element {
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="table__caption">
          Most recent events first. Times are shown in your local timezone.
        </caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Kind</th>
            <th scope="col">Name</th>
            <th scope="col">Page</th>
            <th scope="col">Visitor</th>
            <th scope="col">Device</th>
            <th scope="col">Properties</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>
                <time dateTime={event.timestamp}>{formatTime(event.timestamp)}</time>
              </td>
              <td>
                <span className={`pill pill--${event.kind}`}>
                  {KIND_LABELS[event.kind] ?? event.kind}
                </span>
              </td>
              <td className="table__mono">{event.name}</td>
              <td title={event.url}>{event.url ? normalizePath(event.url) : '—'}</td>
              <td className="table__mono table__truncate">{event.anonymousId}</td>
              <td>
                {event.device}
                {event.browser ? ` · ${event.browser}` : ''}
              </td>
              <td className="table__mono table__truncate">{summarize(event.properties)}</td>
            </tr>
          ))}

          {events.length === 0 && !loading ? (
            <tr>
              <td colSpan={7} className="table__empty">
                No events yet. Send one with the snippet on the Settings page.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {hasMore ? (
        <button
          type="button"
          className="button button--ghost"
          onClick={onLoadMore}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** `{plan: "pro", seats: 4}` -> `plan=pro seats=4`, truncated to fit a cell. */
function summarize(properties: Record<string, unknown> | undefined): string {
  if (!properties) return '—';
  const entries = Object.entries(properties);
  if (entries.length === 0) return '—';
  const text = entries.map(([key, value]) => `${key}=${String(value)}`).join(' ');
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}
