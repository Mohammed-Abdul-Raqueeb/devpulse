import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { createRefreshToken, type AuthClaims, type AuthTokens, type User } from '@devpulse/shared';
import { env } from '../config.js';
import { getDb } from '../db/client.js';
import { unauthorized } from '../lib/errors.js';

/**
 * Access tokens are stateless JWTs; refresh tokens are opaque and stored hashed,
 * so they can be revoked and a database leak does not yield usable tokens.
 */
export function issueTokens(user: User): AuthTokens {
  const accessToken = jwt.sign({ email: user.email, role: user.role }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    issuer: 'devpulse',
  });

  const refreshToken = createRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000).toISOString();

  getDb()
    .prepare('INSERT INTO refresh_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hashToken(refreshToken), user.id, expiresAt);

  return { accessToken, refreshToken, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS };
}

export function verifyAccessToken(token: string): AuthClaims {
  try {
    return jwt.verify(token, env.JWT_SECRET, { issuer: 'devpulse' }) as AuthClaims;
  } catch (err) {
    const reason = err instanceof jwt.TokenExpiredError ? 'Token expired' : 'Invalid token';
    throw unauthorized(reason);
  }
}

/** Single-use refresh: the presented token is deleted as its replacement is issued. */
export function rotateRefreshToken(token: string): { userId: string } {
  const db = getDb();
  const hash = hashToken(token);
  const row = db
    .prepare('SELECT user_id, expires_at FROM refresh_tokens WHERE token_hash = ?')
    .get(hash) as { user_id: string; expires_at: string } | undefined;

  if (!row) throw unauthorized('Invalid refresh token');

  db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(hash);
  if (Date.parse(row.expires_at) < Date.now()) throw unauthorized('Refresh token expired');

  return { userId: row.user_id };
}

/** Invalidates every session for a user, e.g. after a password change. */
export function revokeAllForUser(userId: string): number {
  return getDb().prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId).changes;
}

export function purgeExpiredTokens(): number {
  return getDb()
    .prepare('DELETE FROM refresh_tokens WHERE expires_at < ?')
    .run(new Date().toISOString()).changes;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
