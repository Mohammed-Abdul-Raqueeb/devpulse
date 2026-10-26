import { Router } from 'express';
import { z } from 'zod';
import { passwordSchema, RATE_LIMITS } from '@devpulse/shared';
import { asyncHandler } from '../lib/async-handler.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { validateBody } from '../middleware/validate.js';
import * as users from '../services/user.service.js';
import { revokeAllForUser } from '../services/token.service.js';

export const userRoutes = Router();

userRoutes.use(requireAuth, rateLimit(RATE_LIMITS.read));

/** GET /users — the whole team. Admins and owners only. */
userRoutes.get('/', requireRole('admin'), (_req, res) => {
  res.json({ data: users.listUsers() });
});

const roleSchema = z.object({ role: z.enum(['owner', 'admin', 'viewer']) });

/** PATCH /users/:id/role — promote or demote. Owners only. */
userRoutes.patch(
  '/:id/role',
  requireRole('owner'),
  validateBody(roleSchema),
  asyncHandler(async (req, res) => {
    const { role } = req.body as z.infer<typeof roleSchema>;
    res.json({ user: users.updateRole(req.params.id!, role) });
  }),
);

/** DELETE /users/:id — owners only, and never yourself. */
userRoutes.delete(
  '/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    // Deleting your own account mid-session leaves a valid token for a user
    // that no longer exists; make it an explicit error rather than a puzzle.
    if (req.params.id === req.user!.id) {
      throw forbidden('You cannot delete your own account');
    }
    users.deleteUser(req.params.id!);
    res.status(204).end();
  }),
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

/**
 * POST /users/me/password
 *
 * Requires the current password even though the caller is already
 * authenticated: it stops someone with a borrowed open session from locking the
 * real owner out.
 */
userRoutes.post(
  '/me/password',
  validateBody(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;

    const stored = users.findByEmail(req.user!.email);
    if (!stored || !(await users.verifyPassword(stored, currentPassword))) {
      throw unauthorized('Current password is incorrect');
    }

    await users.changePassword(req.user!.id, newPassword);

    // A password change should end every other session, which is the whole
    // point of changing it after a suspected compromise.
    const revoked = revokeAllForUser(req.user!.id);
    res.json({ revoked });
  }),
);
