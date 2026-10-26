import { Router } from 'express';
import { getDb } from '../db/client.js';
import { registerGauge, renderMetrics } from '../lib/metrics.js';
import { version } from '../lib/version.js';

export const metricsRoutes = Router();

const startedAt = Date.now();

registerGauge({
  name: 'devpulse_uptime_seconds',
  help: 'Seconds since the process started.',
  read: () => Math.floor((Date.now() - startedAt) / 1000),
});

registerGauge({
  name: 'devpulse_events_stored',
  help: 'Events currently stored across all projects.',
  // Read at scrape time rather than cached: on SQLite this is an index-only
  // count, cheap enough that a stale number is not worth the complexity.
  read: () => (getDb().prepare('SELECT COUNT(*) AS c FROM events').get() as { c: number }).c,
});

registerGauge({
  name: 'devpulse_projects_total',
  help: 'Projects configured on this install.',
  read: () => (getDb().prepare('SELECT COUNT(*) AS c FROM projects').get() as { c: number }).c,
});

/**
 * GET /metrics
 *
 * Unauthenticated, like every other Prometheus endpoint, because a scraper
 * cannot easily hold a rotating JWT. It exposes counts and no event contents,
 * but it should still be kept off the public internet by the reverse proxy —
 * see docs/deployment.md.
 */
metricsRoutes.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`# DevPulse ${version}\n${renderMetrics()}`);
});
