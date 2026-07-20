import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Express 4 does not await handlers, so a rejected promise inside one becomes an
 * unhandled rejection instead of a 500. Wrapping forwards the rejection to the
 * error middleware, which is the only place that formats an error response.
 */
export function asyncHandler(handler: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
