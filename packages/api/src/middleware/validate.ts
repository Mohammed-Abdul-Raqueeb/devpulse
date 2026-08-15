import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { validationFailed } from '../lib/errors.js';

type Source = 'body' | 'query' | 'params';

/**
 * Validates one part of the request against a schema and replaces it with the
 * parsed result, so handlers receive coerced, typed values instead of strings.
 */
export function validate(schema: ZodTypeAny, source: Source = 'body'): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      next(
        validationFailed(
          result.error.issues.map((issue) => ({
            path: issue.path.join('.') || source,
            message: issue.message,
          })),
        ),
      );
      return;
    }

    // `req.query` and `req.params` are getters on some Express versions, so the
    // parsed value is assigned through defineProperty to stay compatible.
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
}

/** Shorthand for the common case of validating a JSON body. */
export const validateBody = (schema: ZodTypeAny): RequestHandler => validate(schema, 'body');

/** Shorthand for validating and coercing the query string. */
export const validateQuery = (schema: ZodTypeAny): RequestHandler => validate(schema, 'query');
