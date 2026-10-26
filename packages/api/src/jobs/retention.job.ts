import { listProjects } from '../services/project.service.js';
import { pruneExpiredEvents } from '../services/ingest.service.js';
import { purgeExpiredTokens } from '../services/token.service.js';
import { getDb } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { increment, RETENTION_DELETED } from '../lib/metrics.js';

export interface RetentionSummary {
  projectsScanned: number;
  eventsDeleted: number;
  tokensPurged: number;
  durationMs: number;
}

/**
 * Enforces each project's retention window and clears expired refresh tokens.
 *
 * Deletes run per project rather than as one global statement: a long DELETE
 * holds the write lock, and this way ingestion only ever stalls briefly.
 */
export function runRetention(): RetentionSummary {
  const startedAt = Date.now();
  const projects = listProjects();
  let eventsDeleted = 0;

  for (const project of projects) {
    try {
      eventsDeleted += pruneExpiredEvents(project);
    } catch (err) {
      // One failing project must not stop the rest of the sweep.
      logger.error({ err, projectId: project.id }, 'retention sweep failed for project');
    }
  }

  const tokensPurged = purgeExpiredTokens();
  increment(RETENTION_DELETED, {}, eventsDeleted);

  // Reclaim pages freed by the deletes so the file does not grow monotonically.
  if (eventsDeleted > 0) {
    try {
      getDb().pragma('incremental_vacuum');
    } catch (err) {
      logger.warn({ err }, 'incremental vacuum failed');
    }
  }

  const summary: RetentionSummary = {
    projectsScanned: projects.length,
    eventsDeleted,
    tokensPurged,
    durationMs: Date.now() - startedAt,
  };

  logger.info(summary, 'retention sweep complete');
  return summary;
}
