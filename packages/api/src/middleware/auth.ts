import type { RequestHandler } from 'express';
import type { Project, Role, User } from '@devpulse/shared';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../services/token.service.js';
import { findById } from '../services/user.service.js';
import { isOriginAllowed } from '../services/ingest.service.js';
import { resolveWriteKey } from '../services/project.service.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `requireAuth` for dashboard routes. */
      user?: User;
      /** Set by `requireWriteKey` for ingestion routes. */
      project?: Project;
    }
  }
}

/** Rejects the request unless it carries a valid `Authorization: Bearer <jwt>`. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    next(unauthorized('Missing bearer token'));
    return;
  }

  try {
    const claims = verifyAccessToken(header.slice('Bearer '.length).trim());
    const user = findById(claims.sub);
    // A token can outlive the account it was issued for.
    if (!user) {
      next(unauthorized('Account no longer exists'));
      return;
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

/** Attaches `req.user` when a token is present, but never rejects. */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }
  try {
    const claims = verifyAccessToken(header.slice('Bearer '.length).trim());
    const user = findById(claims.sub);
    if (user) req.user = user;
  } catch {
    // An invalid token on an optional route is treated as no token at all.
  }
  next();
};

const ROLE_RANK: Record<Role, number> = { viewer: 0, admin: 1, owner: 2 };

/** Requires at least the given role. Mount after `requireAuth`. */
export function requireRole(minimum: Role): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(unauthorized());
      return;
    }
    if (ROLE_RANK[req.user.role] < ROLE_RANK[minimum]) {
      next(forbidden(`This action requires the ${minimum} role`));
      return;
    }
    next();
  };
}

/**
 * Authenticates an ingestion request with a project write key, taken from
 * `X-Write-Key` or `?key=`. The query form exists for `navigator.sendBeacon`,
 * which cannot set headers.
 */
export const requireWriteKey: RequestHandler = (req, _res, next) => {
  const header = req.header('x-write-key');
  const query = typeof req.query.key === 'string' ? req.query.key : undefined;
  const key = header ?? query;

  if (!key) {
    next(unauthorized('Missing write key'));
    return;
  }

  const project = resolveWriteKey(key);
  if (!project) {
    next(unauthorized('Invalid or revoked write key'));
    return;
  }

  if (!isOriginAllowed(project, req.header('origin'))) {
    next(forbidden('Origin is not allowed for this project'));
    return;
  }

  req.project = project;
  next();
};
