import { beforeEach, describe, expect, it } from 'vitest';
import {
  changePassword,
  createUser,
  findByEmail,
  listUsers,
  verifyPassword,
} from '../src/services/user.service.js';
import {
  issueTokens,
  purgeExpiredTokens,
  revokeAllForUser,
  rotateRefreshToken,
  verifyAccessToken,
} from '../src/services/token.service.js';
import { freshDb } from './helpers.js';

const PASSWORD = 'correct-horse-battery';

describe('createUser', () => {
  beforeEach(() => {
    freshDb();
  });

  it('makes the first account the install owner', async () => {
    const user = await createUser({ email: 'first@test.local', name: 'First', password: PASSWORD });

    expect(user.role).toBe('owner');
  });

  it('defaults every account after the first to viewer', async () => {
    await createUser({ email: 'first@test.local', name: 'First', password: PASSWORD });
    const second = await createUser({
      email: 'second@test.local',
      name: 'Second',
      password: PASSWORD,
    });

    expect(second.role).toBe('viewer');
  });

  it('rejects a duplicate email', async () => {
    await createUser({ email: 'dupe@test.local', name: 'A', password: PASSWORD });

    await expect(
      createUser({ email: 'dupe@test.local', name: 'B', password: PASSWORD }),
    ).rejects.toThrow(/already exists/);
  });

  it('never returns the password hash', async () => {
    const user = await createUser({ email: 'safe@test.local', name: 'Safe', password: PASSWORD });

    expect(user).not.toHaveProperty('passwordHash');
  });

  it('stores a hash, not the password itself', async () => {
    await createUser({ email: 'hash@test.local', name: 'Hash', password: PASSWORD });
    const stored = findByEmail('hash@test.local');

    expect(stored?.passwordHash).not.toBe(PASSWORD);
    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$/);
  });
});

describe('verifyPassword', () => {
  beforeEach(() => {
    freshDb();
  });

  it('accepts the correct password', async () => {
    await createUser({ email: 'verify@test.local', name: 'V', password: PASSWORD });
    const user = findByEmail('verify@test.local')!;

    await expect(verifyPassword(user, PASSWORD)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    await createUser({ email: 'verify@test.local', name: 'V', password: PASSWORD });
    const user = findByEmail('verify@test.local')!;

    await expect(verifyPassword(user, 'wrong-password-here')).resolves.toBe(false);
  });

  it('accepts the new password after a change and rejects the old one', async () => {
    const created = await createUser({
      email: 'change@test.local',
      name: 'C',
      password: PASSWORD,
    });
    await changePassword(created.id, 'brand-new-password');
    const user = findByEmail('change@test.local')!;

    await expect(verifyPassword(user, 'brand-new-password')).resolves.toBe(true);
    await expect(verifyPassword(user, PASSWORD)).resolves.toBe(false);
  });
});

describe('tokens', () => {
  beforeEach(() => {
    freshDb();
  });

  it('issues an access token that verifies back to the user', async () => {
    const user = await createUser({ email: 'tok@test.local', name: 'T', password: PASSWORD });
    const { accessToken } = issueTokens(user);
    const claims = verifyAccessToken(accessToken);

    expect(claims.sub).toBe(user.id);
    expect(claims.email).toBe('tok@test.local');
  });

  it('rejects a tampered access token', async () => {
    const user = await createUser({ email: 'tok@test.local', name: 'T', password: PASSWORD });
    const { accessToken } = issueTokens(user);

    expect(() => verifyAccessToken(`${accessToken}x`)).toThrow(/Invalid token/);
  });

  it('exchanges a refresh token exactly once', async () => {
    const user = await createUser({ email: 'ref@test.local', name: 'R', password: PASSWORD });
    const { refreshToken } = issueTokens(user);

    expect(rotateRefreshToken(refreshToken).userId).toBe(user.id);
    // The same token must not work a second time.
    expect(() => rotateRefreshToken(refreshToken)).toThrow(/Invalid refresh token/);
  });

  it('revokes every session for a user', async () => {
    const user = await createUser({ email: 'rev@test.local', name: 'R', password: PASSWORD });
    const first = issueTokens(user);
    issueTokens(user);

    expect(revokeAllForUser(user.id)).toBe(2);
    expect(() => rotateRefreshToken(first.refreshToken)).toThrow();
  });

  it('leaves live tokens alone when purging expired ones', async () => {
    const user = await createUser({ email: 'purge@test.local', name: 'P', password: PASSWORD });
    const { refreshToken } = issueTokens(user);

    expect(purgeExpiredTokens()).toBe(0);
    expect(rotateRefreshToken(refreshToken).userId).toBe(user.id);
  });
});

describe('listUsers', () => {
  it('returns accounts oldest first, without hashes', async () => {
    freshDb();
    await createUser({ email: 'a@test.local', name: 'A', password: PASSWORD });
    await createUser({ email: 'b@test.local', name: 'B', password: PASSWORD });

    const users = listUsers();

    expect(users.map((u) => u.email)).toEqual(['a@test.local', 'b@test.local']);
    expect(users.every((u) => !('passwordHash' in u))).toBe(true);
  });
});
