import { Router } from 'express';
import { ingestBodySchema, RATE_LIMITS } from '@devpulse/shared';
import { asyncHandler } from '../lib/async-handler.js';
import { requireWriteKey } from '../middleware/auth.js';
import { byProject, rateLimit } from '../middleware/rate-limit.js';
import { validateBody } from '../middleware/validate.js';
import { ingestBatch } from '../services/ingest.service.js';

export const ingestRoutes = Router();

// The write key is resolved first so the limiter can key on the project.
ingestRoutes.use(requireWriteKey, rateLimit({ ...RATE_LIMITS.ingest, keyBy: byProject }));

/**
 * POST /ingest
 *
 * Returns 207 when part of the batch was rejected, so a client can tell a
 * partial write from a clean one without parsing the body.
 */
ingestRoutes.post(
  '/',
  validateBody(ingestBodySchema),
  asyncHandler(async (req, res) => {
    const body = req.body as { events: unknown[] };
    const result = ingestBatch(body.events, {
      project: req.project!,
      ...(req.header('user-agent') ? { userAgent: req.header('user-agent')! } : {}),
      ...(req.header('cf-ipcountry') ? { country: req.header('cf-ipcountry')! } : {}),
    });

    res.status(result.rejected > 0 ? 207 : 202).json(result);
  }),
);

/**
 * GET /ingest/pixel.gif
 *
 * A 1x1 transparent GIF for clients that cannot run JavaScript, such as an
 * email client. Query parameters stand in for the JSON body.
 */
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

ingestRoutes.get('/pixel.gif', (req, res) => {
  const { name, anonymousId, sessionId } = req.query as Record<string, string | undefined>;

  if (name && anonymousId && sessionId) {
    ingestBatch([{ kind: 'pageview', name, anonymousId, sessionId, url: req.query.url }], {
      project: req.project!,
      ...(req.header('user-agent') ? { userAgent: req.header('user-agent')! } : {}),
    });
  }

  // The pixel always returns 200 so a tracking failure never shows a broken image.
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Content-Length', PIXEL.byteLength);
  res.status(200).end(PIXEL);
});
