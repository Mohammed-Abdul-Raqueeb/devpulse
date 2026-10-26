import type {
  ApiErrorBody,
  AuthTokens,
  Breakdown,
  FunnelResult,
  FunnelStepDefinition,
  MetricSeries,
  OverviewStats,
  Paginated,
  Project,
  Role,
  StoredEvent,
  TimeRange,
  User,
} from '@devpulse/shared';

/** A funnel definition stored server-side, as the API returns it. */
export interface SavedFunnel {
  id: string;
  projectId: string;
  name: string;
  steps: FunnelStepDefinition[];
  createdAt: string;
}

export interface CohortRow {
  cohort: string;
  size: number;
  /** Returning visitors per period, index 0 being the cohort's own period. */
  retained: number[];
  rates: number[];
}

export interface CohortReport {
  period: 'day' | 'week' | 'month';
  periods: number;
  rows: CohortRow[];
}

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';
const TOKEN_KEY = 'devpulse.tokens';

/** Thrown for any non-2xx response, carrying the server error code. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Array<{ path: string; message: string }>;

  constructor(status: number, body: ApiErrorBody | null, fallback: string) {
    super(body?.error.message ?? fallback);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error.code ?? 'internal_error';
    this.details = body?.error.details ?? [];
  }
}

function readTokens(): AuthTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as AuthTokens) : null;
  } catch {
    // Private browsing can make localStorage throw rather than return null.
    return null;
  }
}

function writeTokens(tokens: AuthTokens | null): void {
  try {
    if (tokens) localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Not being able to persist a session is survivable; the user re-logs in.
  }
}

export const session = { read: readTokens, write: writeTokens };

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Set internally to stop a refresh loop from recursing. */
  retrying?: boolean;
}

/**
 * One request helper for the whole app.
 *
 * On a 401 it attempts a single token refresh and replays the original request,
 * so an expired access token is invisible to the caller. A second failure logs
 * the user out rather than retrying again.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const tokens = readTokens();
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (response.status === 401 && tokens && !options.retrying) {
    const refreshed = await tryRefresh(tokens.refreshToken);
    if (refreshed) return request<T>(path, { ...options, retrying: true });
    writeTokens(null);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, body as ApiErrorBody | null, response.statusText);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function tryRefresh(refreshToken: string): Promise<boolean> {
  const response = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) return false;
  const body = (await response.json()) as { tokens: AuthTokens };
  writeTokens(body.tokens);
  return true;
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ user: User; tokens: AuthTokens }>('/auth/login', {
        method: 'POST',
        body: { email, password },
      }),

    register: (email: string, name: string, password: string) =>
      request<{ user: User; tokens: AuthTokens }>('/auth/register', {
        method: 'POST',
        body: { email, name, password },
      }),

    me: () => request<{ user: User }>('/auth/me'),

    logout: () => request<{ revoked: number }>('/auth/logout', { method: 'POST' }),
  },

  projects: {
    list: () => request<{ data: Project[] }>('/projects'),

    get: (idOrSlug: string) =>
      request<{ project: Project; stats: { events: number } }>(`/projects/${idOrSlug}`),

    create: (name: string) =>
      request<{ project: Project; writeKey: string }>('/projects', {
        method: 'POST',
        body: { name },
      }),

    rotateKey: (id: string) =>
      request<{ writeKey: string }>(`/projects/${id}/rotate-key`, { method: 'POST' }),

    schema: (id: string) =>
      request<{ eventNames: string[]; propertyKeys: string[] }>(`/projects/${id}/schema`),
  },

  users: {
    list: () => request<{ data: User[] }>('/users'),

    updateRole: (id: string, role: Role) =>
      request<{ user: User }>(`/users/${id}/role`, { method: 'PATCH', body: { role } }),

    remove: (id: string) => request<void>(`/users/${id}`, { method: 'DELETE' }),

    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ revoked: number }>('/users/me/password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      }),
  },

  funnels: {
    list: (project: string) => request<{ data: SavedFunnel[] }>(`/projects/${project}/funnels`),

    save: (project: string, name: string, steps: FunnelStepDefinition[]) =>
      request<{ funnel: SavedFunnel }>(`/projects/${project}/funnels`, {
        method: 'POST',
        body: { name, steps },
      }),

    remove: (project: string, id: string) =>
      request<void>(`/projects/${project}/funnels/${id}`, { method: 'DELETE' }),
  },

  analytics: {
    overview: (project: string, range: TimeRange, includeBots = false) =>
      request<OverviewStats>(`/projects/${project}/analytics/overview`, {
        query: { ...range, ...(includeBots ? { includeBots: 'true' } : {}) },
      }),

    series: (
      project: string,
      range: TimeRange,
      metric: string,
      granularity: string,
      includeBots = false,
    ) =>
      request<MetricSeries>(`/projects/${project}/analytics/series`, {
        query: { ...range, metric, granularity, ...(includeBots ? { includeBots: 'true' } : {}) },
      }),

    retention: (
      project: string,
      range: TimeRange,
      period: CohortReport['period'] = 'week',
      periods = 8,
    ) =>
      request<CohortReport>(`/projects/${project}/analytics/retention`, {
        query: { ...range, period, periods },
      }),

    breakdown: (project: string, range: TimeRange, dimension: string, limit = 10) =>
      request<Breakdown>(`/projects/${project}/analytics/breakdown`, {
        query: { ...range, dimension, limit },
      }),

    live: (project: string) => request<{ visitors: number }>(`/projects/${project}/analytics/live`),

    funnel: (project: string, range: TimeRange, steps: FunnelStepDefinition[], windowDays = 7) =>
      request<FunnelResult>(`/projects/${project}/analytics/funnel`, {
        method: 'POST',
        body: { ...range, steps, windowDays },
      }),
  },

  events: {
    list: (project: string, query: Record<string, string | number | undefined> = {}) =>
      request<Paginated<StoredEvent>>(`/projects/${project}/events`, { query }),

    exportUrl: (project: string, range: TimeRange) =>
      `${BASE_URL}/projects/${project}/events/export.csv?from=${range.from}&to=${range.to}`,

    /** NDJSON instead of CSV, for a pipeline rather than a spreadsheet. */
    exportNdjsonUrl: (project: string, range: TimeRange) =>
      `${BASE_URL}/projects/${project}/events/export.ndjson?from=${range.from}&to=${range.to}`,
  },
};
