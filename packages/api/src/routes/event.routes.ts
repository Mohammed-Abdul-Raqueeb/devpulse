import { Router } from 'express';
import { z } from 'zod';
import { RATE_LIMITS } from '@devpulse/shared';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { validateQuery } from '../middleware/validate.js';
import { listEvents } from '../services/event.service.js';
import { streamEventsCsv, streamEventsNdjson } from '../services/export.service.js';
import { requireProject } from '../services/project.service.js';

export const eventRoutes = Router();

eventRoutes.use(requireAuth, rateLimit(RATE_LIMITS.read));

const listQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(256).optional(),
  name: z.string().max(128).optional(),
  kind: z.enum(['pageview', 'track', 'identify', 'error']).optional(),
});

/** GET /projects/:project/events — newest-first feed with cursor pagination. */
eventRoutes.get(
  '/:project/events',
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const project = requireProject(req.params.project!);
    const query = req.query as unknown as z.infer<typeof listQuerySchema>;

    const filters: Record<string, string> = {};
    if (query.name) filters.name = query.name;
    if (query.kind) filters.kind = query.kind;

    res.json(
      listEvents({
        projectId: project.id,
        limit: query.limit,
        filters,
        ...(query.from ? { from: new Date(query.from).toISOString() } : {}),
        ...(query.to ? { to: new Date(query.to).toISOString() } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
      }),
    );
  }),
);

const exportQuerySchema = z.object({
  from: z.string(),
  to: z.string(),
});

/**
 * GET /projects/:project/events/export.csv
 *
 * Streams rather than buffering: an export can cover millions of rows, and
 * building the whole file in memory first would be the fastest way to OOM.
 */
eventRoutes.get(
  '/:project/events/export.csv',
  validateQuery(exportQuerySchema),
  asyncHandler(async (req, res) => {
    const project = requireProject(req.params.project!);
    const { from, to } = req.query as unknown as z.infer<typeof exportQuerySchema>;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${project.slug}-events.csv"`);

    streamEventsCsv(res, {
      projectId: project.id,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    });
  }),
);

/**
 * GET /projects/:project/events/export.ndjson
 *
 * The same export as the CSV route, in newline-delimited JSON. Preferred when
 * the destination is a pipeline rather than a spreadsheet: properties stay a
 * real object instead of a quoted JSON string in a cell.
 */
eventRoutes.get(
  '/:project/events/export.ndjson',
  validateQuery(exportQuerySchema),
  asyncHandler(async (req, res) => {
    const project = requireProject(req.params.project!);
    const { from, to } = req.query as unknown as z.infer<typeof exportQuerySchema>;

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${project.slug}-events.ndjson"`);

    streamEventsNdjson(res, {
      projectId: project.id,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    });
  }),
);
