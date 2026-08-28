import type { Server } from 'node:http';
import { createApp } from './app.js';
import { env } from './config.js';
import { closeDb, getDb } from './db/client.js';
import { migrate } from './db/migrate.js';
import { startJobs, stopJobs } from './jobs/scheduler.js';
import { logger } from './lib/logger.js';
import { version } from './lib/version.js';

function main(): void {
  // Schema first: a route must never be reachable before its tables exist.
  migrate(getDb());

  const app = createApp();
  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(
      { version, port: env.PORT, host: env.HOST, env: env.NODE_ENV },
      'devpulse api ready',
    );
  });

  if (env.ENABLE_JOBS) startJobs();

  installShutdownHandlers(server);
  installCrashHandlers();
}

/**
 * Drains in-flight requests before exiting. Without this, a deploy can cut a
 * request mid-response and, worse, close the database during a write.
 */
function installShutdownHandlers(server: Server): void {
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');

    // If connections refuse to close in time, exit anyway rather than hang.
    const force = setTimeout(() => {
      logger.warn('forcing shutdown after timeout');
      process.exit(1);
    }, 10_000);
    force.unref();

    server.close(() => {
      stopJobs();
      closeDb();
      clearTimeout(force);
      logger.info('shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

function installCrashHandlers(): void {
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled promise rejection');
  });

  process.on('uncaughtException', (err) => {
    // State is unknown after an uncaught exception, so the process must not continue.
    logger.fatal({ err }, 'uncaught exception, exiting');
    process.exit(1);
  });
}

main();
