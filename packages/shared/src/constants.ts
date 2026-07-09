/** Values both the API and the dashboard need to agree on. */

/** A visit ends after this much inactivity. */
export const SESSION_IDLE_MINUTES = 30;

/** A session with a single pageview counts as a bounce. */
export const BOUNCE_EVENT_THRESHOLD = 1;

/** Hard cap on an ingest request body. */
export const MAX_INGEST_BYTES = 1_048_576;

export const DEFAULT_RETENTION_DAYS = 365;

export const DASHBOARD_PRESETS = [
  { id: '24h', label: 'Last 24 hours', hours: 24 },
  { id: '7d', label: 'Last 7 days', hours: 24 * 7 },
  { id: '30d', label: 'Last 30 days', hours: 24 * 30 },
  { id: '90d', label: 'Last 90 days', hours: 24 * 90 },
  { id: '12m', label: 'Last 12 months', hours: 24 * 365 },
] as const;

export type PresetId = (typeof DASHBOARD_PRESETS)[number]['id'];

export const RATE_LIMITS = {
  ingest: { windowSeconds: 60, max: 600 },
  read: { windowSeconds: 60, max: 120 },
  auth: { windowSeconds: 900, max: 10 },
} as const;
