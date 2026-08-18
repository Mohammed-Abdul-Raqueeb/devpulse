import { Router } from 'express';
import { loginSchema, RATE_LIMITS, refreshSchema, registerSchema } from '@devpulse/shared';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import { byEmail, rateLimit } from '../middleware/rate-limit.js';
import { validateBody } from '../middleware/validate.js';
import { unauthorized } from '../lib/errors.js';
import * as users from '../services/user.service.js';
import * as tokens from '../services/token.service.js';

export const authRoutes = Router();

const authLimiter = rateLimit({ ...RATE_LIMITS.auth, keyBy: byEmail });

/** POST /auth/register — the first account created becomes the install owner. */
authRoutes.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, name, password } = req.body as {
      email: string;
      name: string;
      password: string;
    };
    const user = await users.createUser({ email, name, password });
    res.status(201).json({ user, tokens: tokens.issueTokens(user) });
  }),
);

/** POST /auth/login */
authRoutes.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    const found = users.findByEmail(email);

    // The same message for both failure modes, so the endpoint cannot be used
    // to enumerate which email addresses have accounts.
    const ok = found ? await users.verifyPassword(found, password) : false;
    if (!found || !ok) throw unauthorized('Incorrect email or password');

    const user = users.stripSecret(found);
    res.json({ user, tokens: tokens.issueTokens(user) });
  }),
);

/** POST /auth/refresh — rotates the refresh token as it issues a new access token. */
authRoutes.post(
  '/refresh',
  validateBody(refreshSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body as { refreshToken: string };
    const { userId } = tokens.rotateRefreshToken(refreshToken);
    const user = users.requireById(userId);
    res.json({ user, tokens: tokens.issueTokens(user) });
  }),
);

/** POST /auth/logout — revokes every refresh token for the caller. */
authRoutes.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const revoked = tokens.revokeAllForUser(req.user!.id);
    res.json({ revoked });
  }),
);

/** GET /auth/me */
authRoutes.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
