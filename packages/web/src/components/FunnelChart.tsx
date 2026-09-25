import { formatCompact, formatPercent } from '@devpulse/shared';
import type { FunnelStepResult } from '@devpulse/shared';

interface FunnelChartProps {
  steps: FunnelStepResult[];
  loading?: boolean;
}

/**
 * Horizontal funnel bars with the drop-off called out between steps.
 *
 * Each bar is sized against step one, so the shape of the funnel is the
 * cumulative conversion. The number that matters most for finding a problem is
 * the step-to-step drop, so that is the one rendered in the gap between bars.
 */
export function FunnelChart({ steps, loading = false }: FunnelChartProps): JSX.Element {
  if (loading) {
    return (
      <div className="funnel funnel--loading">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="funnel__step funnel__step--skeleton" />
        ))}
      </div>
    );
  }

  const entry = steps[0]?.visitors ?? 0;

  if (entry === 0) {
    return <p className="funnel__empty">No visitors entered this funnel in the selected range.</p>;
  }

  return (
    <ol className="funnel">
      {steps.map((step, index) => {
        const previous = steps[index - 1];
        const dropped = previous ? previous.visitors - step.visitors : 0;

        return (
          <li key={`${step.name}-${index}`} className="funnel__step">
            {previous ? (
              <p className="funnel__drop">
                <span className="funnel__drop-rate">
                  {formatPercent(step.conversionFromPrevious, 0)} continued
                </span>
                {dropped > 0 ? (
                  <span className="funnel__drop-count">{formatCompact(dropped)} dropped off</span>
                ) : null}
              </p>
            ) : null}

            <div className="funnel__bar-wrap">
              <div
                className="funnel__bar"
                style={{ width: `${Math.max(2, step.conversionFromStart * 100)}%` }}
              >
                <span className="funnel__step-name">
                  {index + 1}. {step.name}
                </span>
              </div>
            </div>

            <p className="funnel__numbers">
              <strong>{formatCompact(step.visitors)}</strong> visitors
              <span className="funnel__cumulative">
                {formatPercent(step.conversionFromStart, 1)} of entry
              </span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
