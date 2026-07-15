import type { ErrorCode } from '@devpulse/shared';

/**
 * The only error type route handlers should throw. Anything else reaching the
 * error middleware is treated as an unexpected fault and logged at error level.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: Array<{ path: string; message: string }>;
  /** Whether the message is safe to show a client. */
  readonly expose: boolean;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    options: { details?: Array<{ path: string; message: string }>; expose?: boolean } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (options.details) this.details = options.details;
    this.expose = options.expose ?? status < 500;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const badRequest = (message: string): AppError => new AppError(400, 'bad_request', message);

export const unauthorized = (message = 'Authentication required'): AppError =>
  new AppError(401, 'unauthorized', message);

export const forbidden = (message = 'You do not have access to this resource'): AppError =>
  new AppError(403, 'forbidden', message);

export const notFound = (resource = 'Resource'): AppError =>
  new AppError(404, 'not_found', `${resource} not found`);

export const conflict = (message: string): AppError => new AppError(409, 'conflict', message);

export const payloadTooLarge = (message = 'Request body is too large'): AppError =>
  new AppError(413, 'payload_too_large', message);

export const rateLimited = (message = 'Too many requests'): AppError =>
  new AppError(429, 'rate_limited', message);

export const validationFailed = (details: Array<{ path: string; message: string }>): AppError =>
  new AppError(422, 'validation_failed', 'Request validation failed', { details });

export const internal = (message = 'Internal server error'): AppError =>
  new AppError(500, 'internal_error', message, { expose: false });

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
