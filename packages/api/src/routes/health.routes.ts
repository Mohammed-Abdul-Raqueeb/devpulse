import { Router } from 'express';
import type { HealthReport } from '@devpulse/shared';
import { getDb } from '../db/client.js';
import { version } from '../lib/version.js';

export const healthRoutes = Router();

const startedAt = Date.now();

/**
 * GET /health
 *
 * Reports `degraded` with a 503 when a dependency is down, so a load balancer
 * pulls the instance without needing to parse the body.
 */
healthRoutes.get('/', (_req, res) => {
  const checks: HealthReport['checks'] = { database: checkDatabase() };
  const healthy = Object.values(checks).every((c) => c.ok);

  const report: HealthReport = {
    status: healthy ? 'ok' : 'degraded',
    version,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    checks,
  };

  res.status(healthy ? 200 : 503).json(report);
});

/** GET /health/live — process liveness only, never touches the database. */
healthRoutes.get('/live', (_req, res) => {
  res.json({ status: 'ok' });
});

function checkDatabase(): { ok: boolean; detail?: string } {
  try {
    getDb().prepare('SELECT 1').get();
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : 'unknown error' };
  }
}
