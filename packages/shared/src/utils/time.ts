import type { Granularity, TimeRange } from '../types/analytics.js';

const MS = { hour: 3_600_000, day: 86_400_000, week: 604_800_000 } as const;

/** Truncates a date down to the start of its bucket, in UTC. */
export function floorToBucket(date: Date, granularity: Granularity): Date {
  const d = new Date(date.getTime());
  d.setUTCMilliseconds(0);
  d.setUTCSeconds(0);
  d.setUTCMinutes(0);
  if (granularity === 'hour') return d;

  d.setUTCHours(0);
  if (granularity === 'day') return d;

  if (granularity === 'week') {
    // ISO weeks start on Monday; getUTCDay() returns 0 for Sunday.
    const offset = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - offset);
    return d;
  }

  d.setUTCDate(1);
  return d;
}

/** Advances a bucket start by exactly one bucket. */
export function nextBucket(date: Date, granularity: Granularity): Date {
  if (granularity === 'month') {
    const d = new Date(date.getTime());
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d;
  }
  return new Date(date.getTime() + MS[granularity]);
}

/**
 * Every bucket start in `[from, to)`, so a sparse query result can be padded
 * with zeroes instead of leaving gaps in the chart.
 */
export function enumerateBuckets(range: TimeRange, granularity: Granularity): string[] {
  const end = new Date(range.to);
  const out: string[] = [];
  let cursor = floorToBucket(new Date(range.from), granularity);
  // Guard against a pathological range producing an unbounded array.
  for (let i = 0; cursor < end && i < 10_000; i += 1) {
    out.push(cursor.toISOString());
    cursor = nextBucket(cursor, granularity);
  }
  return out;
}

/** The window of equal length immediately before `range`, used for deltas. */
export function previousRange(range: TimeRange): TimeRange {
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  const span = to - from;
  return { from: new Date(from - span).toISOString(), to: range.from };
}

/** Picks a bucket width that keeps a range under ~120 points. */
export function suggestGranularity(range: TimeRange): Granularity {
  const hours = (Date.parse(range.to) - Date.parse(range.from)) / MS.hour;
  if (hours <= 72) return 'hour';
  if (hours <= 24 * 120) return 'day';
  if (hours <= 24 * 730) return 'week';
  return 'month';
}

/** Clamps a client-supplied timestamp into a window the server trusts. */
export function clampTimestamp(input: string | undefined, now = new Date()): string {
  if (!input) return now.toISOString();
  const parsed = Date.parse(input);
  if (Number.isNaN(parsed)) return now.toISOString();
  const maxSkewAhead = (5 * MS.hour) / 60; // 5 minutes
  const maxAge = 7 * MS.day;
  const clamped = Math.min(Math.max(parsed, now.getTime() - maxAge), now.getTime() + maxSkewAhead);
  return new Date(clamped).toISOString();
}
