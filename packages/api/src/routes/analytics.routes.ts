import { Router } from 'express';
import {
  breakdownQuerySchema,
  funnelQuerySchema,
  metricQuerySchema,
  RATE_LIMITS,
  suggestGranularity,
  timeRangeSchema,
  type Granularity,
  type Metric,
} from '@devpulse/shared';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { z } from 'zod';
import { validateBody, validateQuery } from '../middleware/validate.js';
import * as analytics from '../services/analytics.service.js';
import * as funnels from '../services/funnel.service.js';
import { computeRetention } from '../services/cohort.service.js';
import { requireProject } from '../services/project.service.js';

export const analyticsRoutes = Router();

analyticsRoutes.use(requireAuth, rateLimit(RATE_LIMITS.read));

/** Normalises a date-only input such as `2026-03-01` into a full timestamp. */
function toIso(input: string): string {
  return new Date(input).toISOString();
}

/** GET /projects/:project/analytics/overview?from&to */
analyticsRoutes.get(
  '/:project/analytics/overview',
  validateQuery(timeRangeSchema),
  asyncHandler(async (req, res) => {
    const project = requireProject(req.params.project!);
    const { from, to } = req.query as unknown as { from: string; to: string };
    const range = { from: toIso(from), to: toIso(to) };
    res.json(
      analytics.overview(project.id, range, collectFilters(req.query), {
        includeBots: req.query.includeBots === 'true',
      }),
    );
  }),
);

/** GET /projects/:project/analytics/series?metric&granularity&from&to */
analyticsRoutes.get(
  '/:project/analytics/series',
  validateQuery(metricQuerySchema),
  asyncHandler(async (req, res) => {
    const project = requireProject(req.params.project!);
    const query = req.query as unknown as {
      from: string;
      to: string;
      metric: Metric;
      granularity: Granularity;
      filters?: Record<string, string>;
      includeBots?: boolean;
    };

    const range = { from: toIso(query.from), to: toIso(query.to) };
    res.json(
      analytics.metricSeries({
        projectId: project.id,
        metric: query.metric,
        // An explicit `granularity` wins; otherwise pick one that fits the range.
        granularity: query.granularity ?? suggestGranularity(range),
        filters: query.filters ?? collectFilters(req.query),
        includeBots: query.includeBots ?? false,
        ...range,
      }),
    );
  }),
);

/** GET /projects/:project/analytics/breakdown?dimension&limit&from&to */
analyticsRoutes.get(
  '/:project/analytics/breakdown',
  validateQuery(breakdownQuerySchema),
  asyncHandler(async (req, res) => {
    const project = requireProject(req.params.project!);
    const query = req.query as unknown as {
      from: string;
      to: string;
      dimension: string;
      limit: number;
      includeBots?: boolean;
    };
    res.json(
      analytics.breakdown({
        projectId: project.id,
        dimension: query.dimension,
        limit: query.limit,
        filters: collectFilters(req.query),
        includeBots: query.includeBots ?? false,
        from: toIso(query.from),
        to: toIso(query.to),
      }),
    );
  }),
);

/** GET /projects/:project/analytics/live — visitors active in the last five minutes. */
analyticsRoutes.get(
  '/:project/analytics/live',
  asyncHandler(async (req, res) => {
    const project = requireProject(req.params.project!);
    res.json({ visitors: analytics.liveVisitors(project.id) });
  }),
);

/** POST /projects/:project/analytics/funnel — steps come in the body, they are ordered. */
analyticsRoutes.post(
  '/:project/analytics/funnel',
  validateBody(funnelQuerySchema),
  asyncHandler(async (req, res) => {
    const project = requireProject(req.params.project!);
    const body = req.body as {
      from: string;
      to: string;
      steps: Array<{ name: string; eventName: string }>;
      windowDays: number;
    };
    res.json(
      funnels.computeFunnel({
        projectId: project.id,
        steps: body.steps,
        windowDays: body.windowDays,
        from: toIso(body.from),
        to: toIso(body.to),
      }),
    );
  }),
);

/** Reads `filter.<dimension>=value` pairs out of the query string. */
function collectFilters(query: unknown): Record<string, string> {
  const filters: Record<string, string> = {};
  if (!query || typeof query !== 'object') return filters;

  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (key.startsWith('filter.') && typeof value === 'string') {
      filters[key.slice('filter.'.length)] = value;
    }
  }
  return filters;
}

const retentionQuerySchema = timeRangeSchema.and(
  z.object({
    period: z.enum(['day', 'week', 'month']).default('week'),
    periods: z.coerce.number().int().min(1).max(24).default(8),
  }),
);

/**
 * GET /projects/:project/analytics/retention
 *
 * Cohort retention: of the visitors first seen in a period, how many returned
 * in each following one.
 */
analyticsRoutes.get(
  '/:project/analytics/retention',
  validateQuery(retentionQuerySchema),
  asyncHandler(async (req, res) => {
    const project = requireProject(req.params.project!);
    const query = req.query as unknown as {
      from: string;
      to: string;
      period: 'day' | 'week' | 'month';
      periods: number;
    };

    res.json(
      computeRetention({
        projectId: project.id,
        period: query.period,
        periods: query.periods,
        from: toIso(query.from),
        to: toIso(query.to),
      }),
    );
  }),
);
