import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createId, parseUserAgent, type IncomingEvent } from '@devpulse/shared';
import { setDb, type Db } from '../src/db/client.js';
import { resetMetrics } from '../src/lib/metrics.js';
import { resetRateLimits } from '../src/middleware/rate-limit.js';

const SCHEMA_PATH = join(process.cwd(), 'packages/api/src/db/schema.sql');

/**
 * Builds a fresh in-memory database and installs it as the process connection.
 * Every test file calls this in `beforeEach`, so no test can see another's rows.
 *
 * Rate limit counters are cleared too: they live in module scope, so without
 * this a suite that registers the same email a dozen times would start getting
 * 429s partway through.
 */
export function freshDb(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  setDb(db);
  resetRateLimits();
  resetMetrics();
  return db;
}

export interface SeedEventOverrides extends Partial<IncomingEvent> {
  projectId?: string;
  country?: string | null;
  userAgent?: string;
}

const DEFAULT_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

/** Inserts one event directly, bypassing validation, for arranging query tests. */
export function insertEvent(db: Db, overrides: SeedEventOverrides = {}): string {
  const id = createId('evt');
  const at = overrides.timestamp ?? new Date().toISOString();
  const agent = parseUserAgent(overrides.userAgent ?? DEFAULT_AGENT);

  db.prepare(
    `INSERT INTO events (
       id, project_id, kind, name, anonymous_id, user_id, session_id,
       timestamp, received_at, url, referrer, country, device, browser, os, properties
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    overrides.projectId ?? 'prj_test',
    overrides.kind ?? 'pageview',
    overrides.name ?? 'page_view',
    overrides.anonymousId ?? 'anon_default_000',
    overrides.userId ?? null,
    overrides.sessionId ?? 'ses_default_000',
    at,
    at,
    overrides.url ?? 'https://example.test/',
    overrides.referrer ?? null,
    overrides.country ?? 'US',
    agent.device,
    agent.browser,
    agent.os,
    JSON.stringify(overrides.properties ?? {}),
  );

  return id;
}

/** Creates the project row that `insertEvent` defaults to, plus its owner. */
export function insertProject(db: Db, id = 'prj_test', slug = 'test-project'): string {
  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, name, role, password_hash)
     VALUES ('usr_test', 'owner@test.local', 'Test Owner', 'owner', 'x')`,
  ).run();

  db.prepare(
    `INSERT INTO projects (id, name, slug, owner_id, allowed_origins, retention_days)
     VALUES (?, ?, ?, 'usr_test', '[]', 365)`,
  ).run(id, 'Test Project', slug);

  return id;
}

/** `daysAgo(2)` -> an ISO timestamp exactly two days before now. */
export function daysAgo(days: number, hours = 0): string {
  return new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString();
}

/** A valid event body, with fields overridable per assertion. */
export function validEvent(overrides: Partial<IncomingEvent> = {}): IncomingEvent {
  return {
    kind: 'pageview',
    name: 'page_view',
    anonymousId: 'anon_abcdef123456',
    sessionId: 'ses_abcdef123456',
    url: 'https://example.test/pricing',
    ...overrides,
  };
}
