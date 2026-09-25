import { formatCompact, formatPercent } from '@devpulse/shared';
import type { BreakdownRow } from '@devpulse/shared';

interface BarListProps {
  title: string;
  rows: BreakdownRow[];
  /** Rendered beyond the visible rows, when the breakdown was truncated. */
  otherValue?: number;
  /** Transforms a raw key into something readable, e.g. a URL into a path. */
  renderKey?: (key: string) => string;
  loading?: boolean;
}

/**
 * A ranked list where each row carries its own inline bar.
 *
 * Bars are scaled against the largest row rather than the total, so the top
 * item always fills the width and small differences stay visible — the point of
 * this view is comparison between rows, not each row's share of everything.
 */
export function BarList({
  title,
  rows,
  otherValue = 0,
  renderKey = (key) => key,
  loading = false,
}: BarListProps): JSX.Element {
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <section className="barlist">
      <h3 className="barlist__title">{title}</h3>

      {loading ? (
        <ul className="barlist__rows">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="barlist__row barlist__row--skeleton" />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className="barlist__empty">Nothing recorded in this range.</p>
      ) : (
        <ul className="barlist__rows">
          {rows.map((row) => (
            <li key={row.key} className="barlist__row">
              <div
                className="barlist__bar"
                style={{ width: `${(row.value / max) * 100}%` }}
                aria-hidden="true"
              />
              <span className="barlist__key" title={row.key}>
                {renderKey(row.key)}
              </span>
              <span className="barlist__value">
                {formatCompact(row.value)}
                <small>{formatPercent(row.share, 0)}</small>
              </span>
            </li>
          ))}

          {otherValue > 0 ? (
            <li className="barlist__row barlist__row--other">
              <span className="barlist__key">Other</span>
              <span className="barlist__value">{formatCompact(otherValue)}</span>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
