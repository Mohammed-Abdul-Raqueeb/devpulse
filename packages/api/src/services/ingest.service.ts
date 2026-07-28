import {
  clampTimestamp,
  createId,
  incomingEventSchema,
  parseUserAgent,
  type IncomingEvent,
  type IngestResult,
  type Project,
} from '@devpulse/shared';
import { getDb } from '../db/client.js';
import { logger } from '../lib/logger.js';

export interface IngestContext {
  project: Project;
  userAgent?: string;
  /** Two-letter country code resolved by the edge/proxy, if available. */
  country?: string;
}

/**
 * Writes a batch of events. One bad event never fails the batch: valid events are
 * persisted and the rejected indices come back so the client can drop or fix them.
 */
export function ingestBatch(events: unknown[], ctx: IngestContext): IngestResult {
  const db = getDb();
  const agent = parseUserAgent(ctx.userAgent);
  const receivedAt = new Date();
  const errors: IngestResult['errors'] = [];
  const valid: IncomingEvent[] = [];

  events.forEach((raw, index) => {
    const parsed = incomingEventSchema.safeParse(raw);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      const first = parsed.error.issues[0];
      errors.push({
        index,
        message: first ? `${first.path.join('.') || 'event'}: ${first.message}` : 'invalid event',
      });
    }
  });

  const insert = db.prepare(
    `INSERT INTO events (
       id, project_id, kind, name, anonymous_id, user_id, session_id,
       timestamp, received_at, url, referrer, country, device, browser, os, properties
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  // A single transaction turns N round trips into one fsync, which is the
  // difference between ~500 and ~50,000 events per second on SQLite.
  const writeAll = db.transaction((batch: IncomingEvent[]) => {
    for (const event of batch) {
      insert.run(
        createId('evt'),
        ctx.project.id,
        event.kind,
        event.name,
        event.anonymousId,
        event.userId ?? null,
        event.sessionId,
        clampTimestamp(event.timestamp, receivedAt),
        receivedAt.toISOString(),
        event.url ?? null,
        event.referrer ?? null,
        ctx.country ?? null,
        agent.device,
        agent.browser,
        agent.os,
        JSON.stringify(event.properties ?? {}),
      );
    }
  });

  if (valid.length > 0) writeAll(valid);

  if (errors.length > 0) {
    logger.warn(
      { projectId: ctx.project.id, rejected: errors.length, accepted: valid.length },
      'ingest batch partially rejected',
    );
  }

  return { accepted: valid.length, rejected: errors.length, errors };
}

/** Rejects events whose Origin is not on the project allow-list. Empty list means any origin. */
export function isOriginAllowed(project: Project, origin: string | undefined): boolean {
  if (project.allowedOrigins.length === 0) return true;
  if (project.allowedOrigins.includes('*')) return true;
  if (!origin) return false;
  return project.allowedOrigins.includes(origin);
}

/** Deletes events past a project's retention window. Returns rows removed. */
export function pruneExpiredEvents(project: Project): number {
  const cutoff = new Date(Date.now() - project.retentionDays * 86_400_000).toISOString();
  return getDb()
    .prepare('DELETE FROM events WHERE project_id = ? AND timestamp < ?')
    .run(project.id, cutoff).changes;
}
