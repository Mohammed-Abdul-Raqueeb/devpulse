import { Router } from 'express';
import { z } from 'zod';
import { RATE_LIMITS } from '@devpulse/shared';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { validateBody } from '../middleware/validate.js';
import * as funnels from '../services/funnel.service.js';
import { requireProject } from '../services/project.service.js';

export const funnelRoutes = Router();

funnelRoutes.use(requireAuth, rateLimit(RATE_LIMITS.read));

const saveFunnelSchema = z.object({
  name: z.string().min(2).max(80),
  steps: z
    .array(z.object({ name: z.string().min(1).max(80), eventName: z.string().min(1).max(128) }))
    .min(2)
    .max(8),
});

/** GET /projects/:project/funnels */
funnelRoutes.get(
  '/:project/funnels',
  asyncHandler(async (req, res) => {
    const project = requireProject(req.params.project!);
    res.json({ data: funnels.listFunnels(project.id) });
  }),
);

/** POST /projects/:project/funnels */
funnelRoutes.post(
  '/:project/funnels',
  requireRole('admin'),
  validateBody(saveFunnelSchema),
  asyncHandler(async (req, res) => {
    const project = requireProject(req.params.project!);
    const body = req.body as z.infer<typeof saveFunnelSchema>;
    res.status(201).json({ funnel: funnels.saveFunnel(project.id, body.name, body.steps) });
  }),
);

/** DELETE /projects/:project/funnels/:id */
funnelRoutes.delete(
  '/:project/funnels/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    requireProject(req.params.project!);
    funnels.deleteFunnel(req.params.id!);
    res.status(204).end();
  }),
);
