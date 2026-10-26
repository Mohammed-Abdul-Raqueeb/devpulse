import express, { type Express } from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { MAX_INGEST_BYTES } from '@devpulse/shared';
import { corsOrigins, env, isTest } from './config.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { httpMetrics } from './middleware/metrics.js';
import { requestId } from './middleware/request-id.js';
import { analyticsRoutes } from './routes/analytics.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { eventRoutes } from './routes/event.routes.js';
import { funnelRoutes } from './routes/funnel.routes.js';
import { healthRoutes } from './routes/health.routes.js';
import { ingestRoutes } from './routes/ingest.routes.js';
import { metricsRoutes } from './routes/metrics.routes.js';
import { projectRoutes } from './routes/project.routes.js';
import { userRoutes } from './routes/user.routes.js';
import { version } from './lib/version.js';

/**
 * Builds the Express app without starting a listener, so tests can drive it
 * through supertest and the server entrypoint stays a thin wrapper.
 */
export function createApp(): Express {
  const app = express();

  // Required for req.ip to reflect the real client when running behind a proxy.
  if (env.TRUST_PROXY) app.set('trust proxy', true);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(httpMetrics);
  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        // Reuse the id already assigned by the requestId middleware, so the
        // HTTP log line and any error body refer to the same request.
        genReqId: (req): string => (req as { requestId?: string }).requestId ?? 'unknown',
        // Health checks would otherwise be most of the log volume.
        autoLogging: {
          ignore: (req): boolean =>
            (req.url?.startsWith('/health') || req.url?.startsWith('/metrics')) ?? false,
        },
      }),
    );
  }

  app.use(
    helmet({
      // The dashboard is served separately, so a strict default CSP is safe here.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: MAX_INGEST_BYTES }));

  // Ingestion must accept any origin: it is called from customer websites, and
  // the write key plus the project allow-list are what actually authorise it.
  app.use('/ingest', cors({ origin: true, methods: ['POST', 'GET', 'OPTIONS'] }), ingestRoutes);

  // Everything else is the dashboard API and is locked to known origins.
  const dashboardCors = cors({ origin: corsOrigins, credentials: true });

  app.use('/health', healthRoutes);
  app.use('/metrics', metricsRoutes);
  app.use('/auth', dashboardCors, authRoutes);
  app.use('/users', dashboardCors, userRoutes);
  app.use('/projects', dashboardCors, projectRoutes);
  app.use('/projects', dashboardCors, analyticsRoutes);
  app.use('/projects', dashboardCors, eventRoutes);
  app.use('/projects', dashboardCors, funnelRoutes);

  app.get('/', (_req, res) => {
    res.json({ name: 'devpulse-api', version, docs: '/docs/api.md' });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
