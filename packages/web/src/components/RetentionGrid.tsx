import { formatCompact, formatPercent } from '@devpulse/shared';
import type { CohortRow } from '../lib/api';

interface RetentionGridProps {
  rows: CohortRow[];
  period: 'day' | 'week' | 'month';
  loading?: boolean;
}

const PERIOD_LABELS: Record<RetentionGridProps['period'], string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

/**
 * The classic cohort triangle: one row per cohort, one column per period since.
 *
 * Cells are shaded by retention rate rather than coloured by threshold, because
 * the question this answers is "where does the drop-off happen", and a gradient
 * shows that at a glance where buckets would hide it.
 */
export function RetentionGrid({ rows, period, loading = false }: RetentionGridProps): JSX.Element {
  if (loading) {
    return <div className="skeleton skeleton--block" style={{ height: 240 }} aria-hidden="true" />;
  }

  const populated = rows.filter((row) => row.size > 0);

  if (populated.length === 0) {
    return (
      <p className="funnel__empty">
        No cohorts in this range. Retention needs visitors whose first ever visit falls inside the
        window.
      </p>
    );
  }

  const columns = Math.max(...populated.map((row) => row.retained.length));

  return (
    <div className="table-wrap">
      <table className="table retention">
        <caption className="table__caption">
          Each row is the visitors first seen in that {PERIOD_LABELS[period].toLowerCase()}, and
          each column is how many returned that many {PERIOD_LABELS[period].toLowerCase()}s later.
        </caption>
        <thead>
          <tr>
            <th scope="col">Cohort</th>
            <th scope="col">Visitors</th>
            {Array.from({ length: columns }, (_, i) => (
              <th key={i} scope="col">
                {PERIOD_LABELS[period]} {i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {populated.map((row) => (
            <tr key={row.cohort}>
              <th scope="row" className="retention__cohort">
                {formatCohort(row.cohort, period)}
              </th>
              <td className="retention__size">{formatCompact(row.size)}</td>

              {Array.from({ length: columns }, (_, i) => {
                const rate = row.rates[i];

                // A cohort that has not existed long enough gets a blank cell,
                // not a zero — those mean very different things.
                if (rate === undefined) {
                  return <td key={i} className="retention__cell retention__cell--future" />;
                }

                return (
                  <td
                    key={i}
                    className="retention__cell"
                    style={{ backgroundColor: shade(rate) }}
                    title={`${row.retained[i]} of ${row.size} visitors`}
                  >
                    {formatPercent(rate, 0)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Maps a rate to a translucent accent fill.
 *
 * Opacity rather than a hue ramp, so the shading works unchanged in both themes
 * and stays legible to anyone who cannot distinguish the hues.
 */
function shade(rate: number): string {
  const alpha = Math.min(0.9, 0.08 + rate * 0.82);
  return `color-mix(in srgb, var(--accent) ${Math.round(alpha * 100)}%, transparent)`;
}

function formatCohort(iso: string, period: RetentionGridProps['period']): string {
  const date = new Date(iso);
  if (period === 'month') {
    return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
