import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { StoredEvent } from '@devpulse/shared';
import { api } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useDateRange } from '../hooks/useDateRange';
import { EventTable } from '../components/EventTable';
import { ErrorNotice } from '../components/ErrorNotice';
import { RangePicker } from '../components/RangePicker';

const KINDS = ['all', 'pageview', 'track', 'identify', 'error'] as const;

/** The raw event feed, with keyset pagination and a CSV export. */
export function Events(): JSX.Element {
  const { slug = '' } = useParams();
  const { preset, range, setPreset } = useDateRange();
  const [kind, setKind] = useState<(typeof KINDS)[number]>('all');
  const [name, setName] = useState('');
  const [extra, setExtra] = useState<StoredEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  /**
   * Built fresh on each call rather than held in state.
   *
   * The first page and `loadMore` must agree on the filters exactly, or page two
   * would be filtered differently from page one — and a memoised object would
   * just be another thing that can go stale.
   */
  const buildQuery = useCallback(
    (): Record<string, string | number | undefined> => ({
      ...range,
      limit: 50,
      ...(kind === 'all' ? {} : { kind }),
      ...(name.trim() ? { name: name.trim() } : {}),
    }),
    [range, kind, name],
  );

  // Changing a filter discards the accumulated pages; page one comes from here.
  const firstPage = useAsync(
    () => api.events.list(slug, buildQuery()),
    [slug, range.from, range.to, kind, name],
  );

  const loadMore = useCallback(async () => {
    const next = cursor ?? firstPage.data?.page.cursor;
    if (!next) return;

    setLoadingMore(true);
    try {
      const page = await api.events.list(slug, { ...buildQuery(), cursor: next });
      setExtra((previous) => [...previous, ...page.data]);
      setCursor(page.page.cursor);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, firstPage.data, slug, buildQuery]);

  // Reset the accumulated pages whenever the filters change.
  useEffect(() => {
    setExtra([]);
    setCursor(null);
  }, [slug, range.from, range.to, kind, name]);

  if (firstPage.error) return <ErrorNotice error={firstPage.error} onRetry={firstPage.reload} />;

  const events = [...(firstPage.data?.data ?? []), ...extra];
  const hasMore = cursor !== null || (firstPage.data?.page.hasMore ?? false);

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Events</h1>
          <p className="page__subtitle">{events.length} loaded</p>
        </div>
        <RangePicker value={preset} onChange={setPreset} />
      </header>

      <section className="toolbar">
        <div className="segmented" role="radiogroup" aria-label="Event kind">
          {KINDS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={kind === option}
              className={`segmented__option ${kind === option ? 'is-selected' : ''}`}
              onClick={() => setKind(option)}
            >
              {option}
            </button>
          ))}
        </div>

        <label className="field field--inline">
          <span className="field__label">Event name</span>
          <input
            type="search"
            className="field__input"
            placeholder="signup_completed"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <a className="button button--ghost" href={api.events.exportUrl(slug, range)} download>
          Export CSV
        </a>

        <a className="button button--ghost" href={api.events.exportNdjsonUrl(slug, range)} download>
          Export NDJSON
        </a>
      </section>

      <EventTable
        events={events}
        loading={firstPage.loading || loadingMore}
        hasMore={hasMore}
        onLoadMore={() => void loadMore()}
      />
    </div>
  );
}
