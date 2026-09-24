import { formatPercent, relativeChange } from '@devpulse/shared';

interface StatCardProps {
  label: string;
  value: string;
  /** Raw current and previous totals, used to render the delta badge. */
  current?: number;
  previous?: number;
  /** Set when a lower number is the better outcome, e.g. bounce rate. */
  inverted?: boolean;
  loading?: boolean;
}

/**
 * One headline metric with a period-over-period delta.
 *
 * The delta is omitted rather than shown as 0% when there is no baseline: a
 * project with no prior data has not "stayed flat", it simply has nothing to
 * compare against.
 */
export function StatCard({
  label,
  value,
  current,
  previous,
  inverted = false,
  loading = false,
}: StatCardProps): JSX.Element {
  const change =
    current !== undefined && previous !== undefined ? relativeChange(current, previous) : null;

  const direction = change === null || change === 0 ? 'flat' : change > 0 ? 'up' : 'down';
  const isGood = direction === 'flat' ? null : inverted ? direction === 'down' : direction === 'up';

  return (
    <article className={`stat ${loading ? 'stat--loading' : ''}`}>
      <h3 className="stat__label">{label}</h3>
      <p className="stat__value">{loading ? '—' : value}</p>

      {change !== null && !loading ? (
        <p
          className={`stat__delta stat__delta--${isGood === null ? 'flat' : isGood ? 'good' : 'bad'}`}
        >
          <span aria-hidden="true">
            {direction === 'up' ? '▲' : direction === 'down' ? '▼' : '■'}
          </span>
          {formatPercent(Math.abs(change))}
          <span className="stat__delta-note">vs previous period</span>
        </p>
      ) : (
        <p className="stat__delta stat__delta--none">no prior data</p>
      )}
    </article>
  );
}
