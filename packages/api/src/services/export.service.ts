import type { Writable } from 'node:stream';
import type { TimeRange } from '@devpulse/shared';
import { getDb } from '../db/client.js';
import type { EventRow } from '../db/rows.js';

export interface ExportOptions extends TimeRange {
  projectId: string;
}

const COLUMNS = [
  'id',
  'timestamp',
  'kind',
  'name',
  'anonymous_id',
  'user_id',
  'session_id',
  'url',
  'referrer',
  'country',
  'device',
  'browser',
  'os',
  'properties',
] as const;

/**
 * Writes events as CSV directly to a stream.
 *
 * `iterate()` pulls one row at a time from SQLite, so memory stays flat no
 * matter how large the range is. Backpressure is respected: when the socket
 * buffer fills, the loop pauses until it drains.
 */
export function streamEventsCsv(out: Writable, options: ExportOptions): void {
  const statement = getDb().prepare(
    `SELECT ${COLUMNS.join(', ')} FROM events
     WHERE project_id = ? AND timestamp >= ? AND timestamp < ?
     ORDER BY timestamp ASC`,
  );

  out.write(`${COLUMNS.join(',')}\n`);

  const iterator = statement.iterate(
    options.projectId,
    options.from,
    options.to,
  ) as IterableIterator<EventRow>;

  /**
   * Drives the iterator manually rather than with `for...of`.
   *
   * Breaking out of a `for...of` calls `iterator.return()`, which finalises the
   * underlying SQLite statement — so pausing for backpressure that way would
   * silently truncate the export at whatever fit in the first buffer. Calling
   * `next()` by hand leaves the statement open across the pause.
   */
  const pump = (): void => {
    for (;;) {
      const step = iterator.next();
      if (step.done === true) break;

      const line = COLUMNS.map((column) => csvCell(step.value[column])).join(',');
      // A false return means the socket buffer is full; resume on drain.
      if (!out.write(`${line}\n`)) {
        out.once('drain', pump);
        return;
      }
    }
    out.end();
  };

  // If the client disconnects mid-export, stop reading rather than scanning the
  // rest of the range into a socket nobody is listening to.
  out.on('close', () => iterator.return?.(undefined));

  pump();
}

/**
 * Escapes one cell. Anything containing a comma, quote or newline is quoted and
 * its quotes doubled, per RFC 4180.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Builds a complete CSV in memory. Used by tests and by small exports. */
export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const header = columns.join(',');
  const body = rows.map((row) => columns.map((c) => csvCell(row[c])).join(',')).join('\n');
  return rows.length === 0 ? `${header}\n` : `${header}\n${body}\n`;
}
