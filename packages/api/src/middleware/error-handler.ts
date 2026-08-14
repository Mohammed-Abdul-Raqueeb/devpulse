import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@devpulse/shared';
import { AppError, isAppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { isProduction } from '../config.js';

/** Terminal 404 handler. Mounted after every route so unmatched paths get an envelope. */
export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiErrorBody = {
    error: {
      code: 'not_found',
      message: `No route for ${req.method} ${req.path}`,
      requestId: req.requestId,
    },
  };
  res.status(404).json(body);
};

/**
 * Converts anything thrown in the request pipeline into the one error envelope
 * the dashboard knows how to read. Unexpected faults are logged with a stack and
 * reported as a generic 500 so internals never leak to a client.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = normalize(err);

  const logPayload = {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    status: appError.status,
    code: appError.code,
  };

  if (appError.status >= 500) {
    logger.error({ ...logPayload, err }, appError.message);
  } else {
    logger.warn(logPayload, appError.message);
  }

  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.expose ? appError.message : 'Internal server error',
      ...(appError.details ? { details: appError.details } : {}),
      requestId: req.requestId ?? 'unknown',
    },
  };

  if (res.headersSent) {
    // The response already started streaming; all we can do is end it.
    res.end();
    return;
  }

  res.status(appError.status).json(body);
};

function normalize(err: unknown): AppError {
  if (isAppError(err)) return err;

  if (err instanceof ZodError) {
    return new AppError(422, 'validation_failed', 'Request validation failed', {
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  // express.json() surfaces a body-parser error with these fields set.
  if (isBodyParserError(err)) {
    return err.type === 'entity.too.large'
      ? new AppError(413, 'payload_too_large', 'Request body is too large')
      : new AppError(400, 'bad_request', 'Request body is not valid JSON');
  }

  const message = err instanceof Error ? err.message : 'Unknown error';
  return new AppError(500, 'internal_error', isProduction ? 'Internal server error' : message, {
    expose: false,
  });
}

function isBodyParserError(err: unknown): err is { type: string; status: number } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    typeof (err as { type: unknown }).type === 'string' &&
    (err as { type: string }).type.startsWith('entity.')
  );
}
