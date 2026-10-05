import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { formatCompact, formatDuration, formatPercent, normalizePath } from '@devpulse/shared';
import { api } from '../lib/api';
import { useAsync, usePolling } from '../hooks/useAsync';
import { useDateRange } from '../hooks/useDateRange';
import { BarList } from '../components/BarList';
import { LineChart } from '../components/LineChart';
import { RangePicker } from '../components/RangePicker';
import { StatCard } from '../components/StatCard';
import { ErrorNotice } from '../components/ErrorNotice';

type SeriesMetric = 'visitors' | 'events' | 'sessions';

/** The landing screen: headline numbers, one trend chart and four breakdowns. */
export function Overview(): JSX.Element {
  const { slug = '' } = useParams();
  const { preset, range, granularity, setPreset } = useDateRange();
  const [metric, setMetric] = useState<SeriesMetric>('visitors');

  const stats = useAsync(() => api.analytics.overview(slug, range), [slug, range.from, range.to]);
  const series = useAsync(
    () => api.analytics.series(slug, range, metric, granularity),
    [slug, range.from, range.to, metric, granularity],
  );
  const live = useAsync(() => api.analytics.live(slug), [slug]);

  // Refresh the online count without touching the heavier aggregate queries.
  const reloadLive = useCallback(() => live.reload(), [live]);
  usePolling(reloadLive, 30_000);

  if (stats.error) return <ErrorNotice error={stats.error} onRetry={stats.reload} />;

  const data = stats.data;

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Overview</h1>
          <p className="page__subtitle">
            {new Date(range.from).toLocaleDateString()} – {new Date(range.to).toLocaleDateString()}
          </p>
        </div>
        <RangePicker value={preset} onChange={setPreset} liveVisitors={live.data?.visitors} />
      </header>

      <section className="stats-grid">
        <StatCard
          label="Visitors"
          value={formatCompact(data?.visitors ?? 0)}
          loading={stats.loading}
        />
        <StatCard label="Events" value={formatCompact(data?.events ?? 0)} loading={stats.loading} />
        <StatCard
          label="Sessions"
          value={formatCompact(data?.sessions ?? 0)}
          loading={stats.loading}
        />
        <StatCard
          label="Bounce rate"
          value={formatPercent(data?.bounceRate ?? 0)}
          inverted
          loading={stats.loading}
        />
        <StatCard
          label="Avg. session"
          value={formatDuration(data?.avgSessionSeconds ?? 0)}
          loading={stats.loading}
        />
      </section>

      <section className="panel">
        <header className="panel__header">
          <h2 className="panel__title">Trend</h2>
          <div className="segmented" role="radiogroup" aria-label="Metric">
            {(['visitors', 'events', 'sessions'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={metric === option}
                className={`segmented__option ${metric === option ? 'is-selected' : ''}`}
                onClick={() => setMetric(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </header>

        {series.error ? (
          <ErrorNotice error={series.error} onRetry={series.reload} compact />
        ) : (
          <LineChart points={series.data?.points ?? []} label={metric} />
        )}
      </section>

      <div className="grid-2">
        <BarList
          title="Top pages"
          rows={data?.topPages ?? []}
          renderKey={normalizePath}
          loading={stats.loading}
        />
        <BarList title="Top referrers" rows={data?.topReferrers ?? []} loading={stats.loading} />
        <BarList title="Devices" rows={data?.devices ?? []} loading={stats.loading} />
        <BarList title="Countries" rows={data?.countries ?? []} loading={stats.loading} />
      </div>
    </div>
  );
}
