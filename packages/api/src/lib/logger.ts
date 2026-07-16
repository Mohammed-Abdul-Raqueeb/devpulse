import pino from 'pino';
import { env, isProduction, isTest } from '../config.js';

/**
 * Structured JSON in production so a log shipper can parse it; pretty output in
 * development; silent during tests so assertion failures stay readable.
 */
export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  base: { service: 'devpulse-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-write-key"]',
      'password',
      'passwordHash',
      'refreshToken',
    ],
    censor: '[redacted]',
  },
  // A transport spawns a worker thread, which is wasted work when the logger is
  // silent anyway and makes test teardown slower than it needs to be.
  transport:
    isProduction || isTest
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
});

export type Logger = typeof logger;

/** A child logger tagged with a request id, so one request's lines can be grepped together. */
export function requestLogger(requestId: string): Logger {
  return logger.child({ requestId });
}
