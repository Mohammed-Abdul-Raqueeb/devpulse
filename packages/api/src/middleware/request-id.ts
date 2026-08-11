import type { RequestHandler } from 'express';
import { createRequestId } from '@devpulse/shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Correlates every log line and error body for one request. */
      requestId: string;
    }
  }
}

/**
 * Honours an inbound `X-Request-Id` so a trace can span a proxy, but only when
 * it looks like an id — otherwise a client could inject arbitrary text into logs.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const inbound = req.header('x-request-id');
  req.requestId = inbound && /^[A-Za-z0-9_-]{8,64}$/.test(inbound) ? inbound : createRequestId();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
