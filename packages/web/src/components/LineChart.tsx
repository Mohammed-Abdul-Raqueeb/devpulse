import { useMemo, useState } from 'react';
import { formatCompact } from '@devpulse/shared';
import type { SeriesPoint } from '@devpulse/shared';

interface LineChartProps {
  points: SeriesPoint[];
  /** Formats a y value for the tooltip and axis. Defaults to compact numbers. */
  format?: (value: number) => string;
  label?: string;
  height?: number;
}

const PADDING = { top: 16, right: 16, bottom: 28, left: 44 };
const VIEWBOX_WIDTH = 720;

/**
 * A hand-rolled SVG line chart.
 *
 * The dashboard needs one chart shape, and an inline SVG keeps the bundle ~40kB
 * smaller than a charting library would while remaining fully themeable with
 * CSS variables. The viewBox is fixed and the SVG scales, so the component does
 * not need to measure its container.
 */
export function LineChart({
  points,
  format = formatCompact,
  label = 'value',
  height = 240,
}: LineChartProps): JSX.Element {
  const [hovered, setHovered] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const innerWidth = VIEWBOX_WIDTH - PADDING.left - PADDING.right;
    const innerHeight = height - PADDING.top - PADDING.bottom;
    const max = Math.max(1, ...points.map((p) => p.value));

    // A single point has no span to divide by; place it at the left edge.
    const stepX = points.length > 1 ? innerWidth / (points.length - 1) : 0;

    const coords = points.map((point, index) => ({
      x: PADDING.left + index * stepX,
      y: PADDING.top + innerHeight - (point.value / max) * innerHeight,
      point,
    }));

    return { coords, max, innerHeight, innerWidth };
  }, [points, height]);

  if (points.length === 0) {
    return (
      <div className="chart chart--empty" style={{ height }}>
        <p>No data for this range.</p>
      </div>
    );
  }

  const linePath = geometry.coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
    .join(' ');

  const areaPath = `${linePath} L${geometry.coords.at(-1)!.x.toFixed(2)},${(
    PADDING.top + geometry.innerHeight
  ).toFixed(2)} L${PADDING.left.toFixed(2)},${(PADDING.top + geometry.innerHeight).toFixed(2)} Z`;

  const active = hovered === null ? null : geometry.coords[hovered];

  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${height}`}
        role="img"
        aria-label={`${label} over time`}
        preserveAspectRatio="none"
        className="chart__svg"
      >
        {gridLines(geometry.max, geometry.innerHeight, format)}

        <path d={areaPath} className="chart__area" />
        <path d={linePath} className="chart__line" />

        {active ? (
          <g className="chart__cursor">
            <line
              x1={active.x}
              x2={active.x}
              y1={PADDING.top}
              y2={PADDING.top + geometry.innerHeight}
            />
            <circle cx={active.x} cy={active.y} r={4} />
          </g>
        ) : null}

        {/* Invisible hit areas: wide enough to hover comfortably on a touch screen. */}
        {geometry.coords.map((c, index) => (
          <rect
            key={c.point.bucket}
            x={c.x - geometry.innerWidth / Math.max(1, points.length) / 2}
            y={PADDING.top}
            width={geometry.innerWidth / Math.max(1, points.length)}
            height={geometry.innerHeight}
            fill="transparent"
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </svg>

      <figcaption className="chart__caption">
        {active ? (
          <>
            <strong>{format(active.point.value)}</strong>
            <span>{formatBucket(active.point.bucket)}</span>
          </>
        ) : (
          <span>
            {points.length} buckets · peak {format(geometry.max)}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** Four horizontal reference lines, labelled on the left. */
function gridLines(
  max: number,
  innerHeight: number,
  format: (value: number) => string,
): JSX.Element[] {
  const steps = 4;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const value = (max / steps) * (steps - i);
    const y = PADDING.top + (innerHeight / steps) * i;
    return (
      <g key={i} className="chart__grid">
        <line x1={PADDING.left} x2={VIEWBOX_WIDTH - PADDING.right} y1={y} y2={y} />
        <text x={PADDING.left - 8} y={y + 4} textAnchor="end">
          {format(value)}
        </text>
      </g>
    );
  });
}

function formatBucket(bucket: string): string {
  return new Date(bucket).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
  });
}
