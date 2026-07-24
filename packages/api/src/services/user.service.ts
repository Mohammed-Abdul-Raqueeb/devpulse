import bcrypt from 'bcryptjs';
import { createId, type Role, type User, type UserWithSecret } from '@devpulse/shared';
import { getDb } from '../db/client.js';
import { toUser, type UserRow } from '../db/rows.js';
import { conflict, notFound } from '../lib/errors.js';

/** Cost 12 keeps a login under ~250ms on modest hardware while staying expensive to brute force. */
const BCRYPT_ROUNDS = 12;

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role?: Role;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(input.email);
  if (existing) throw conflict('An account with that email already exists');

  // The very first account becomes the owner; everyone after is a viewer by default.
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  const role: Role = input.role ?? (count === 0 ? 'owner' : 'viewer');

  const user: UserWithSecret = {
    id: createId('usr'),
    email: input.email,
    name: input.name,
    role,
    passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    createdAt: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO users (id, email, name, role, password_hash, created_at)
     VALUES (@id, @email, @name, @role, @passwordHash, @createdAt)`,
  ).run(user);

  return stripSecret(user);
}

export function findByEmail(email: string): UserWithSecret | null {
  const row = getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as
    UserRow | undefined;
  return row ? toUser(row) : null;
}

export function findById(id: string): User | null {
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? stripSecret(toUser(row)) : null;
}

export function requireById(id: string): User {
  const user = findById(id);
  if (!user) throw notFound('User');
  return user;
}

export async function verifyPassword(user: UserWithSecret, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}

export async function changePassword(userId: string, password: string): Promise<void> {
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const result = getDb()
    .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(hash, userId);
  if (result.changes === 0) throw notFound('User');
}

export function listUsers(): User[] {
  const rows = getDb().prepare('SELECT * FROM users ORDER BY created_at ASC').all() as UserRow[];
  return rows.map((r) => stripSecret(toUser(r)));
}

/** Drops the password hash before a user object can escape the service layer. */
export function stripSecret(user: UserWithSecret | User): User {
  const { id, email, name, role, createdAt } = user;
  return { id, email, name, role, createdAt };
}
