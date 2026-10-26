import type { RequestHandler } from 'express';
import { HTTP_REQUESTS, increment } from '../lib/metrics.js';

/**
 * Counts responses by method and status class.
 *
 * The route is deliberately not a label: `/projects/:project/events` would
 * otherwise become one series per project id, and a high-cardinality label is
 * the standard way to make a Prometheus instance fall over.
 */
export const httpMetrics: RequestHandler = (req, res, next) => {
  res.on('finish', () => {
    increment(HTTP_REQUESTS, {
      method: req.method,
      status: `${Math.floor(res.statusCode / 100)}xx`,
    });
  });
  next();
};
