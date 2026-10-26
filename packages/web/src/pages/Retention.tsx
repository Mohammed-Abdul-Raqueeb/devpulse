import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { formatPercent } from '@devpulse/shared';
import { api, type CohortReport } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useDateRange } from '../hooks/useDateRange';
import { ErrorNotice } from '../components/ErrorNotice';
import { RangePicker } from '../components/RangePicker';
import { RetentionGrid } from '../components/RetentionGrid';

const PERIODS: Array<CohortReport['period']> = ['day', 'week', 'month'];

/** Cohort retention: does anybody come back? */
export function Retention(): JSX.Element {
  const { slug = '' } = useParams();
  const { preset, range, setPreset } = useDateRange();
  const [period, setPeriod] = useState<CohortReport['period']>('week');

  const report = useAsync(
    () => api.analytics.retention(slug, range, period, 8),
    [slug, range.from, range.to, period],
  );

  if (report.error) return <ErrorNotice error={report.error} onRetry={report.reload} />;

  const rows = report.data?.rows ?? [];
  const cohorts = rows.filter((row) => row.size > 0);

  // Average of the first return period across cohorts that have one, which is
  // the single number people actually want from this screen.
  const firstReturn = cohorts
    .map((row) => row.rates[1])
    .filter((rate): rate is number => rate !== undefined);
  const averageReturn =
    firstReturn.length === 0 ? null : firstReturn.reduce((a, b) => a + b, 0) / firstReturn.length;

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Retention</h1>
          <p className="page__subtitle">
            {averageReturn === null
              ? 'Not enough history yet to measure returns.'
              : `${formatPercent(averageReturn)} of visitors return the following ${period}.`}
          </p>
        </div>
        <RangePicker value={preset} onChange={setPreset} />
      </header>

      <section className="panel">
        <header className="panel__header">
          <h2 className="panel__title">Cohorts</h2>
          <div className="segmented" role="radiogroup" aria-label="Cohort period">
            {PERIODS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={period === option}
                className={`segmented__option ${period === option ? 'is-selected' : ''}`}
                onClick={() => setPeriod(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </header>

        <RetentionGrid rows={rows} period={period} loading={report.loading} />

        <p className="panel__hint">
          A visitor belongs to the cohort of their first ever visit, not their first visit in this
          range — so widening the range does not move anyone between cohorts.
        </p>
      </section>
    </div>
  );
}
