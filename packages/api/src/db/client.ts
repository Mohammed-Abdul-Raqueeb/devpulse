import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env, isTest } from '../config.js';
import { logger } from '../lib/logger.js';

export type Db = Database.Database;

let instance: Db | null = null;

/**
 * Returns the process-wide connection, opening it on first use.
 * SQLite is single-writer, so one connection shared across the process is both
 * correct and faster than a pool.
 */
export function getDb(): Db {
  if (instance) return instance;

  const path = isTest ? ':memory:' : env.DATABASE_PATH;
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  applyPragmas(db);
  instance = db;
  logger.debug({ path }, 'database connection opened');
  return db;
}

function applyPragmas(db: Db): void {
  // WAL lets reads proceed while a batch of events is being written.
  db.pragma('journal_mode = WAL');
  // `normal` trades a sliver of durability on OS crash for a large write speedup;
  // losing a few hundred milliseconds of analytics events is acceptable.
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('cache_size = -64000');
}

/** Closes the connection. Used by tests and by the shutdown handler. */
export function closeDb(): void {
  instance?.close();
  instance = null;
}

/** Replaces the connection — tests use this to get a clean in-memory database. */
export function setDb(db: Db): void {
  instance = db;
}
