import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { getDb, type Db } from './client.js';
import { logger } from '../lib/logger.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Applies schema.sql. Every statement is `IF NOT EXISTS`, so running this on an
 * existing database is a no-op and it is safe to call on every boot.
 */
export function migrate(db: Db = getDb()): void {
  const sql = readFileSync(join(here, 'schema.sql'), 'utf8');
  db.exec(sql);
  recordVersion(db);
  logger.info('database schema up to date');
}

function recordVersion(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  db.prepare(
    `INSERT INTO schema_meta (key, value) VALUES ('applied_at', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(new Date().toISOString());
}

/** Drops every table. Only reachable from tests and the `db:reset` script. */
export function dropAll(db: Db = getDb()): void {
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all() as Array<{ name: string }>;
  db.pragma('foreign_keys = OFF');
  for (const { name } of tables) db.exec(`DROP TABLE IF EXISTS "${name}"`);
  db.pragma('foreign_keys = ON');
}

/**
 * True when this module is the process entrypoint rather than an import.
 *
 * Comparing resolved file URLs rather than massaging `argv[1]` into a path keeps
 * this correct on Windows, where the separators would otherwise not match.
 */
function isEntrypoint(): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  return import.meta.url === pathToFileURL(invoked).href;
}

// Allow `npm run migrate` to execute this file directly.
if (isEntrypoint()) {
  migrate();
}
