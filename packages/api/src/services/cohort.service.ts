import { floorToBucket, nextBucket, type TimeRange } from '@devpulse/shared';
import { getDb } from '../db/client.js';
import { badRequest } from '../lib/errors.js';

export interface CohortOptions extends TimeRange {
  projectId: string;
  /** Cohort width. Weekly is the usual choice for a product. */
  period: 'day' | 'week' | 'month';
  /** How many periods after the first to follow each cohort for. */
  periods: number;
}

export interface CohortRow {
  /** Start of the period in which this cohort was first seen. */
  cohort: string;
  /** Visitors first seen in this period. */
  size: number;
  /**
   * Returning visitors per subsequent period, index 0 being the cohort's own
   * period. Shorter for recent cohorts, which have not had time to return.
   */
  retained: number[];
  /** `retained` as a fraction of `size`. */
  rates: number[];
}

export interface CohortReport {
  period: CohortOptions['period'];
  periods: number;
  rows: CohortRow[];
}

const MAX_PERIODS = 24;

/**
 * Cohort retention: of the visitors first seen in a period, how many came back
 * in each following one.
 *
 * The expensive part is deciding when each visitor was *first* seen, which has
 * to look at all of a project's history rather than just the requested window —
 * otherwise a visitor from last year looks like a brand new one this week, and
 * every cohort reports impossibly good retention. That first-seen lookup is a
 * single grouped scan served by `idx_events_anon`.
 */
export function computeRetention(options: CohortOptions): CohortReport {
  if (options.periods < 1 || options.periods > MAX_PERIODS) {
    throw badRequest(`periods must be between 1 and ${MAX_PERIODS}`);
  }

  const db = getDb();
  const buckets = periodBuckets(options);
  if (buckets.length === 0) return { period: options.period, periods: options.periods, rows: [] };

  const windowStart = buckets[0]!;
  const windowEnd = buckets.at(-1)!.end;

  // Visitor -> the first time they were ever seen, across all history.
  const firstSeen = new Map<string, number>(
    (
      db
        .prepare(
          `SELECT anonymous_id, MIN(timestamp) AS at
           FROM events WHERE project_id = ? AND device != 'bot'
           GROUP BY anonymous_id`,
        )
        .all(options.projectId) as Array<{ anonymous_id: string; at: string }>
    ).map((row) => [row.anonymous_id, Date.parse(row.at)]),
  );

  // Visitor -> every period index in which they were active.
  const activity = db
    .prepare(
      `SELECT DISTINCT anonymous_id, timestamp
       FROM events
       WHERE project_id = ? AND timestamp >= ? AND timestamp < ? AND device != 'bot'`,
    )
    .all(options.projectId, windowStart.start, windowEnd) as Array<{
    anonymous_id: string;
    timestamp: string;
  }>;

  const activeByVisitor = new Map<string, Set<number>>();
  for (const row of activity) {
    const index = bucketIndexOf(buckets, Date.parse(row.timestamp));
    if (index === -1) continue;
    const seen = activeByVisitor.get(row.anonymous_id) ?? new Set<number>();
    seen.add(index);
    activeByVisitor.set(row.anonymous_id, seen);
  }

  // Assign each visitor to the cohort of their first-ever period.
  const cohortMembers = buckets.map(() => new Set<string>());
  for (const [visitor, at] of firstSeen) {
    const index = bucketIndexOf(buckets, at);
    if (index !== -1) cohortMembers[index]!.add(visitor);
  }

  const rows: CohortRow[] = buckets.map((bucket, cohortIndex) => {
    const members = cohortMembers[cohortIndex]!;
    // A cohort can only be followed as far as the window extends.
    const span = Math.min(options.periods, buckets.length - cohortIndex);
    const retained: number[] = [];

    for (let offset = 0; offset < span; offset += 1) {
      let count = 0;
      for (const visitor of members) {
        if (activeByVisitor.get(visitor)?.has(cohortIndex + offset)) count += 1;
      }
      retained.push(count);
    }

    return {
      cohort: bucket.start,
      size: members.size,
      retained,
      rates: retained.map((n) => (members.size === 0 ? 0 : round(n / members.size))),
    };
  });

  return { period: options.period, periods: options.periods, rows };
}

interface Bucket {
  start: string;
  end: string;
  startMs: number;
  endMs: number;
}

function periodBuckets(options: CohortOptions): Bucket[] {
  const granularity = options.period;
  const end = Date.parse(options.to);
  const buckets: Bucket[] = [];

  let cursor = floorToBucket(new Date(options.from), granularity);

  while (cursor.getTime() < end && buckets.length < MAX_PERIODS * 2) {
    const next = nextBucket(cursor, granularity);
    buckets.push({
      start: cursor.toISOString(),
      end: next.toISOString(),
      startMs: cursor.getTime(),
      endMs: next.getTime(),
    });
    cursor = next;
  }

  return buckets;
}

function bucketIndexOf(buckets: Bucket[], at: number): number {
  return buckets.findIndex((bucket) => at >= bucket.startMs && at < bucket.endMs);
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
