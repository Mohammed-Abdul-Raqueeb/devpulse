import type { Project, StoredEvent, UserWithSecret, DeviceType, EventKind } from '@devpulse/shared';

/** Raw row shapes as better-sqlite3 returns them (snake_case, JSON as TEXT). */

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  password_hash: string;
  created_at: string;
}

export interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  allowed_origins: string;
  retention_days: number;
  created_at: string;
  updated_at: string;
}

export interface EventRow {
  id: string;
  project_id: string;
  kind: string;
  name: string;
  anonymous_id: string;
  user_id: string | null;
  session_id: string;
  timestamp: string;
  received_at: string;
  url: string | null;
  referrer: string | null;
  country: string | null;
  device: string;
  browser: string | null;
  os: string | null;
  properties: string;
}

export function toUser(row: UserRow): UserWithSecret {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as UserWithSecret['role'],
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    ownerId: row.owner_id,
    allowedOrigins: safeJsonArray(row.allowed_origins),
    retentionDays: row.retention_days,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toEvent(row: EventRow): StoredEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind as EventKind,
    name: row.name,
    anonymousId: row.anonymous_id,
    ...(row.user_id ? { userId: row.user_id } : {}),
    sessionId: row.session_id,
    timestamp: row.timestamp,
    receivedAt: row.received_at,
    ...(row.url ? { url: row.url } : {}),
    ...(row.referrer ? { referrer: row.referrer } : {}),
    country: row.country,
    device: row.device as DeviceType,
    browser: row.browser,
    os: row.os,
    properties: safeJsonObject(row.properties),
  };
}

/** A malformed JSON column must not take down a whole page of results. */
function safeJsonArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function safeJsonObject(raw: string): Record<string, never> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, never>)
      : ({} as Record<string, never>);
  } catch {
    return {} as Record<string, never>;
  }
}
