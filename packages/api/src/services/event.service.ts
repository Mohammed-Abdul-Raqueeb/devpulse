import type { Paginated, StoredEvent } from '@devpulse/shared';
import { getDb } from '../db/client.js';
import { badRequest } from '../lib/errors.js';
import { toEvent, type EventRow } from '../db/rows.js';
import { buildWhere } from './query.builder.js';

export interface ListEventsOptions {
  projectId: string;
  from?: string;
  to?: string;
  limit: number;
  /** Opaque cursor encoding the last seen (timestamp, id) pair. */
  cursor?: string;
  filters?: Record<string, string>;
}

/**
 * Newest-first event feed with keyset pagination.
 *
 * Offset pagination would re-scan every skipped row and can skip or duplicate
 * events as new ones arrive mid-scroll. Seeking on `(timestamp, id)` is stable
 * and uses the `idx_events_project_time` index directly.
 */
export function listEvents(options: ListEventsOptions): Paginated<StoredEvent> {
  const from = options.from ?? new Date(0).toISOString();
  const to = options.to ?? new Date(Date.now() + 60_000).toISOString();
  // The raw feed deliberately shows bots: it is the view you reach for when
  // explaining a spike, which is exactly when crawler hits matter.
  const where = buildWhere(options.projectId, from, to, options.filters, { includeBots: true });

  const conditions = [where.sql];
  const params = [...where.params];

  if (options.cursor) {
    const { timestamp, id } = decodeCursor(options.cursor);
    conditions.push('(timestamp < ? OR (timestamp = ? AND id < ?))');
    params.push(timestamp, timestamp, id);
  }

  // Fetch one extra row to decide `hasMore` without a second COUNT query.
  const rows = getDb()
    .prepare(
      `SELECT * FROM events WHERE ${conditions.join(' AND ')}
       ORDER BY timestamp DESC, id DESC LIMIT ?`,
    )
    .all(...params, options.limit + 1) as EventRow[];

  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  const last = page.at(-1);

  return {
    data: page.map(toEvent),
    page: {
      limit: options.limit,
      cursor: hasMore && last ? encodeCursor(last.timestamp, last.id) : null,
      hasMore,
    },
  };
}

export function countEvents(projectId: string): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS value FROM events WHERE project_id = ?')
    .get(projectId) as { value: number };
  return row.value;
}

/** Distinct event names seen for a project, so the UI can offer them as filters. */
export function listEventNames(projectId: string, limit = 100): string[] {
  const rows = getDb()
    .prepare(
      `SELECT name, COUNT(*) AS uses FROM events WHERE project_id = ?
       GROUP BY name ORDER BY uses DESC LIMIT ?`,
    )
    .all(projectId, limit) as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

/** Property keys in use across a project, sampled from the most recent events. */
export function listPropertyKeys(projectId: string, sample = 500): string[] {
  const rows = getDb()
    .prepare(
      `SELECT properties FROM events WHERE project_id = ?
       ORDER BY timestamp DESC LIMIT ?`,
    )
    .all(projectId, sample) as Array<{ properties: string }>;

  const keys = new Set<string>();
  for (const row of rows) {
    try {
      const parsed: unknown = JSON.parse(row.properties);
      if (parsed && typeof parsed === 'object') {
        for (const key of Object.keys(parsed)) keys.add(key);
      }
    } catch {
      // A single malformed blob should not hide every other key.
    }
  }
  return [...keys].sort();
}

function encodeCursor(timestamp: string, id: string): string {
  return Buffer.from(`${timestamp}|${id}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { timestamp: string; id: string } {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const separator = decoded.indexOf('|');
  if (separator === -1) throw badRequest('Malformed pagination cursor');
  return { timestamp: decoded.slice(0, separator), id: decoded.slice(separator + 1) };
}
