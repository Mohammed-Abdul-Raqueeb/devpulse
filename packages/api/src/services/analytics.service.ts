import {
  BOUNCE_EVENT_THRESHOLD,
  enumerateBuckets,
  previousRange,
  referrerHost,
  type Breakdown,
  type BreakdownRow,
  type Granularity,
  type Metric,
  type MetricSeries,
  type OverviewStats,
  type SeriesPoint,
  type TimeRange,
} from '@devpulse/shared';
import { getDb } from '../db/client.js';
import { badRequest } from '../lib/errors.js';
import { bucketExpression, buildWhere, resolveDimension } from './query.builder.js';

export interface MetricOptions extends TimeRange {
  projectId: string;
  metric: Metric;
  granularity: Granularity;
  filters?: Record<string, string>;
}

/** The SQL aggregate behind each counting metric. */
const METRIC_AGGREGATES: Record<Metric, string> = {
  events: 'COUNT(*)',
  visitors: 'COUNT(DISTINCT anonymous_id)',
  sessions: 'COUNT(DISTINCT session_id)',
  // Session metrics need a per-session rollup first; see sessionMetricSeries.
  bounceRate: '0',
  avgSessionSeconds: '0',
};

/** A time series for one metric, zero-padded so the chart has no gaps. */
export function metricSeries(options: MetricOptions): MetricSeries {
  const { metric, granularity } = options;

  if (metric === 'bounceRate' || metric === 'avgSessionSeconds') {
    return sessionMetricSeries(options);
  }

  const points = countSeries(options);
  const total = points.reduce((sum, p) => sum + p.value, 0);
  const previous = previousRange({ from: options.from, to: options.to });
  const previousTotal = countSeries({ ...options, ...previous }).reduce((s, p) => s + p.value, 0);

  return { metric, granularity, points, total, previousTotal };
}

function countSeries(options: MetricOptions): SeriesPoint[] {
  const aggregate = METRIC_AGGREGATES[options.metric];
  const where = buildWhere(options.projectId, options.from, options.to, options.filters);
  const bucket = bucketExpression(options.granularity);

  const rows = getDb()
    .prepare(
      `SELECT ${bucket} AS bucket, ${aggregate} AS value
       FROM events WHERE ${where.sql}
       GROUP BY bucket ORDER BY bucket ASC`,
    )
    .all(...where.params) as Array<{ bucket: string; value: number }>;

  return padBuckets(rows, options, options.granularity);
}

/** Fills missing buckets with zero so a sparse result still renders a continuous line. */
function padBuckets(
  rows: Array<{ bucket: string; value: number }>,
  range: TimeRange,
  granularity: Granularity,
): SeriesPoint[] {
  const byBucket = new Map(rows.map((r) => [r.bucket, r.value]));
  return enumerateBuckets(range, granularity).map((bucket) => ({
    bucket,
    value: byBucket.get(bucket) ?? 0,
  }));
}

/** Bounce rate and average session length aggregate over sessions, not raw events. */
function sessionMetricSeries(options: MetricOptions): MetricSeries {
  const where = buildWhere(options.projectId, options.from, options.to, options.filters);
  const bucket = bucketExpression(options.granularity, 'MIN(timestamp)');

  const rows = getDb()
    .prepare(
      `SELECT bucket,
              AVG(is_bounce) AS bounce_rate,
              AVG(duration_seconds) AS avg_duration
       FROM (
         SELECT ${bucket} AS bucket,
                CASE WHEN COUNT(*) <= ${BOUNCE_EVENT_THRESHOLD} THEN 1.0 ELSE 0.0 END AS is_bounce,
                (julianday(MAX(timestamp)) - julianday(MIN(timestamp))) * 86400.0 AS duration_seconds
         FROM events WHERE ${where.sql}
         GROUP BY session_id
       )
       GROUP BY bucket ORDER BY bucket ASC`,
    )
    .all(...where.params) as Array<{ bucket: string; bounce_rate: number; avg_duration: number }>;

  const pick = (r: (typeof rows)[number]): number =>
    options.metric === 'bounceRate' ? r.bounce_rate : r.avg_duration;

  const points = padBuckets(
    rows.map((r) => ({ bucket: r.bucket, value: round(pick(r)) })),
    options,
    options.granularity,
  );

  // Averaging the per-bucket averages would weight a quiet hour as heavily as a
  // busy one, so the window total is recomputed from scratch.
  const total = sessionMetricTotal(options);
  const previous = previousRange({ from: options.from, to: options.to });
  const previousTotal = sessionMetricTotal({ ...options, ...previous });

  return { metric: options.metric, granularity: options.granularity, points, total, previousTotal };
}

function sessionMetricTotal(options: MetricOptions): number {
  const where = buildWhere(options.projectId, options.from, options.to, options.filters);
  const row = getDb()
    .prepare(
      `SELECT AVG(is_bounce) AS bounce_rate, AVG(duration_seconds) AS avg_duration
       FROM (
         SELECT CASE WHEN COUNT(*) <= ${BOUNCE_EVENT_THRESHOLD} THEN 1.0 ELSE 0.0 END AS is_bounce,
                (julianday(MAX(timestamp)) - julianday(MIN(timestamp))) * 86400.0 AS duration_seconds
         FROM events WHERE ${where.sql}
         GROUP BY session_id
       )`,
    )
    .get(...where.params) as { bounce_rate: number | null; avg_duration: number | null };

  const value = options.metric === 'bounceRate' ? row.bounce_rate : row.avg_duration;
  return round(value ?? 0);
}

export interface BreakdownOptions extends TimeRange {
  projectId: string;
  dimension: string;
  limit: number;
  filters?: Record<string, string>;
}

/** Top N values for one dimension, with everything else collapsed into otherValue. */
export function breakdown(options: BreakdownOptions): Breakdown {
  const column = resolveDimension(options.dimension);
  if (!column) throw badRequest(`Cannot break down by "${options.dimension}"`);

  const where = buildWhere(options.projectId, options.from, options.to, options.filters);

  const rows = getDb()
    .prepare(
      `SELECT COALESCE(${column}, '(none)') AS key, COUNT(DISTINCT anonymous_id) AS value
       FROM events WHERE ${where.sql}
       GROUP BY key ORDER BY value DESC`,
    )
    .all(...where.params) as Array<{ key: string; value: number }>;

  const normalized = options.dimension === 'referrer' ? groupByHost(rows) : rows;
  const grandTotal = normalized.reduce((sum, r) => sum + r.value, 0);
  const top = normalized.slice(0, options.limit);
  const otherValue = grandTotal - top.reduce((sum, r) => sum + r.value, 0);

  return {
    dimension: options.dimension,
    rows: top.map((r) => ({ ...r, share: grandTotal === 0 ? 0 : round(r.value / grandTotal) })),
    otherValue,
  };
}

/** Collapses full referrer URLs down to their host so one site is a single row. */
function groupByHost(
  rows: Array<{ key: string; value: number }>,
): Array<{ key: string; value: number }> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const host = row.key === '(none)' ? 'direct' : referrerHost(row.key);
    totals.set(host, (totals.get(host) ?? 0) + row.value);
  }
  return [...totals.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value);
}

/** Everything the dashboard overview needs, in one call instead of eight. */
export function overview(
  projectId: string,
  range: TimeRange,
  filters: Record<string, string> = {},
): OverviewStats {
  const base = { projectId, filters, ...range };
  const totals = scalarTotals(projectId, range, filters);

  const topRows = (dimension: string, limit = 8): BreakdownRow[] =>
    breakdown({ ...base, dimension, limit }).rows;

  return {
    range,
    visitors: totals.visitors,
    events: totals.events,
    sessions: totals.sessions,
    bounceRate: sessionMetricTotal({ ...base, metric: 'bounceRate', granularity: 'day' }),
    avgSessionSeconds: sessionMetricTotal({
      ...base,
      metric: 'avgSessionSeconds',
      granularity: 'day',
    }),
    topPages: topRows('url'),
    topReferrers: topRows('referrer'),
    devices: topRows('device', 5),
    countries: topRows('country'),
  };
}

function scalarTotals(
  projectId: string,
  range: TimeRange,
  filters: Record<string, string>,
): { events: number; visitors: number; sessions: number } {
  const where = buildWhere(projectId, range.from, range.to, filters);
  return getDb()
    .prepare(
      `SELECT COUNT(*) AS events,
              COUNT(DISTINCT anonymous_id) AS visitors,
              COUNT(DISTINCT session_id) AS sessions
       FROM events WHERE ${where.sql}`,
    )
    .get(...where.params) as { events: number; visitors: number; sessions: number };
}

/** Distinct visitors seen in the last five minutes. */
export function liveVisitors(projectId: string): number {
  const since = new Date(Date.now() - 5 * 60_000).toISOString();
  const row = getDb()
    .prepare(
      `SELECT COUNT(DISTINCT anonymous_id) AS value
       FROM events WHERE project_id = ? AND timestamp >= ?`,
    )
    .get(projectId, since) as { value: number };
  return row.value;
}

/** Four decimal places: enough for a percentage, short enough to keep JSON small. */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
