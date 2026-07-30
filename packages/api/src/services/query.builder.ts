import type { Granularity } from '@devpulse/shared';

/** Columns a client is allowed to filter or group by. Anything else is rejected. */
export const FILTERABLE_COLUMNS = [
  'kind',
  'name',
  'url',
  'referrer',
  'country',
  'device',
  'browser',
  'os',
  'user_id',
] as const;

export type FilterableColumn = (typeof FILTERABLE_COLUMNS)[number];

/** Maps the camelCase dimension names the API exposes to real column names. */
const DIMENSION_COLUMNS: Record<string, FilterableColumn> = {
  kind: 'kind',
  name: 'name',
  url: 'url',
  referrer: 'referrer',
  country: 'country',
  device: 'device',
  browser: 'browser',
  os: 'os',
  userId: 'user_id',
};

export interface WhereClause {
  sql: string;
  params: unknown[];
}

/**
 * Builds the WHERE fragment every analytics query shares. Values are always
 * bound as parameters; only column *names* come from code, never from input.
 */
export function buildWhere(
  projectId: string,
  from: string,
  to: string,
  filters: Record<string, string> = {},
): WhereClause {
  const conditions = ['project_id = ?', 'timestamp >= ?', 'timestamp < ?'];
  const params: unknown[] = [projectId, from, to];

  for (const [key, value] of Object.entries(filters)) {
    const column = DIMENSION_COLUMNS[key];
    if (column) {
      conditions.push(`${column} = ?`);
      params.push(value);
      continue;
    }

    // `properties.plan=pro` filters inside the JSON blob.
    if (key.startsWith('properties.')) {
      const path = key.slice('properties.'.length);
      if (isSafeJsonKey(path)) {
        conditions.push(`json_extract(properties, ?) = ?`);
        params.push(`$."${path}"`, value);
      }
      continue;
    }
    // Unknown keys are ignored rather than erroring, so adding a filter to the
    // dashboard never breaks against an older API.
  }

  return { sql: conditions.join(' AND '), params };
}

/** Resolves an API dimension name to a column, or null if it is not groupable. */
export function resolveDimension(dimension: string): FilterableColumn | null {
  return DIMENSION_COLUMNS[dimension] ?? null;
}

/**
 * SQLite has no `date_trunc`, so buckets are produced with strftime formats.
 * Each format yields a lexicographically sortable prefix.
 */
export function bucketExpression(granularity: Granularity, column = 'timestamp'): string {
  switch (granularity) {
    case 'hour':
      return `strftime('%Y-%m-%dT%H:00:00.000Z', ${column})`;
    case 'day':
      return `strftime('%Y-%m-%dT00:00:00.000Z', ${column})`;
    case 'week':
      // Shift back to the preceding Monday before truncating to a date.
      return `strftime('%Y-%m-%dT00:00:00.000Z', ${column}, 'weekday 1', '-7 days')`;
    case 'month':
      return `strftime('%Y-%m-01T00:00:00.000Z', ${column})`;
  }
}

function isSafeJsonKey(key: string): boolean {
  return /^[A-Za-z0-9_.-]{1,64}$/.test(key);
}
