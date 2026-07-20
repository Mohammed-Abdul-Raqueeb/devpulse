-- DevPulse schema. Applied by src/db/migrate.ts in a single transaction.
-- SQLite is the default store: one file, no daemon, fast enough for millions of
-- events per project. Column types stay narrow so indexes remain useful.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  allowed_origins TEXT NOT NULL DEFAULT '[]',
  retention_days  INTEGER NOT NULL DEFAULT 365,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);

-- Write keys are stored hashed: a leaked database dump must not let an attacker
-- post events. The plaintext key is shown once at creation time.
CREATE TABLE IF NOT EXISTS write_keys (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key_hash     TEXT NOT NULL UNIQUE,
  label        TEXT NOT NULL DEFAULT 'default',
  last_used_at TEXT,
  revoked_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_write_keys_project ON write_keys(project_id);

CREATE TABLE IF NOT EXISTS events (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  name         TEXT NOT NULL,
  anonymous_id TEXT NOT NULL,
  user_id      TEXT,
  session_id   TEXT NOT NULL,
  timestamp    TEXT NOT NULL,
  received_at  TEXT NOT NULL,
  url          TEXT,
  referrer     TEXT,
  country      TEXT,
  device       TEXT NOT NULL DEFAULT 'unknown',
  browser      TEXT,
  os           TEXT,
  properties   TEXT NOT NULL DEFAULT '{}'
);

-- The dashboard always filters by project and a time window, so every read is
-- served by this composite index.
CREATE INDEX IF NOT EXISTS idx_events_project_time ON events(project_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(project_id, session_id);
CREATE INDEX IF NOT EXISTS idx_events_name ON events(project_id, name, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_anon ON events(project_id, anonymous_id, timestamp);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS saved_funnels (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  steps      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_funnels_project ON saved_funnels(project_id);
