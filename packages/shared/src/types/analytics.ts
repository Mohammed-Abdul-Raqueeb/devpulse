/** Query and response shapes for the aggregation endpoints. */

/** Bucket width for time series. */
export type Granularity = 'hour' | 'day' | 'week' | 'month';

/** Metrics the aggregation engine can compute. */
export type Metric = 'events' | 'visitors' | 'sessions' | 'bounceRate' | 'avgSessionSeconds';

/** A half-open interval [from, to). Both ends are ISO 8601. */
export interface TimeRange {
  from: string;
  to: string;
}

export interface MetricQuery extends TimeRange {
  projectId: string;
  metric: Metric;
  granularity: Granularity;
  /** Equality filters applied to columns or `properties.*` paths. */
  filters?: Record<string, string>;
}

export interface SeriesPoint {
  /** Start of the bucket, ISO 8601. */
  bucket: string;
  value: number;
}

export interface MetricSeries {
  metric: Metric;
  granularity: Granularity;
  points: SeriesPoint[];
  total: number;
  /** Same metric over the immediately preceding window, for deltas. */
  previousTotal: number;
}

/** One row of a "top N" breakdown, e.g. top pages or referrers. */
export interface BreakdownRow {
  key: string;
  value: number;
  share: number;
}

export interface Breakdown {
  dimension: string;
  rows: BreakdownRow[];
  /** Rows beyond the requested limit, collapsed. */
  otherValue: number;
}

/** The payload backing the dashboard overview screen. */
export interface OverviewStats {
  range: TimeRange;
  visitors: number;
  events: number;
  sessions: number;
  bounceRate: number;
  avgSessionSeconds: number;
  topPages: BreakdownRow[];
  topReferrers: BreakdownRow[];
  devices: BreakdownRow[];
  countries: BreakdownRow[];
}

/** A funnel definition: ordered event names a visitor must hit. */
export interface FunnelStepDefinition {
  name: string;
  eventName: string;
}

export interface FunnelStepResult extends FunnelStepDefinition {
  visitors: number;
  /** Fraction of the previous step that reached this one. */
  conversionFromPrevious: number;
  /** Fraction of step one that reached this one. */
  conversionFromStart: number;
}

export interface FunnelResult {
  steps: FunnelStepResult[];
  windowDays: number;
}
