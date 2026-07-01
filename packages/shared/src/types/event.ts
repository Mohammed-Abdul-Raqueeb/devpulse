/** Canonical event shapes shared by the ingestion API and the dashboard. */

/** The four event kinds DevPulse understands. */
export type EventKind = 'pageview' | 'track' | 'identify' | 'error';

/** A single property value attached to an event. Deliberately narrow so it maps cleanly to SQL. */
export type PropertyValue = string | number | boolean | null;

/** Free-form key/value bag sent alongside an event. */
export type EventProperties = Record<string, PropertyValue>;

/** An event exactly as a client SDK sends it, before the server enriches it. */
export interface IncomingEvent {
  kind: EventKind;
  name: string;
  /** Stable pseudonymous id for the browser/device. */
  anonymousId: string;
  /** Set once the visitor is known (after an `identify`). */
  userId?: string;
  /** Groups events belonging to one visit. */
  sessionId: string;
  /** Client-side ISO 8601 timestamp. Clamped server-side. */
  timestamp?: string;
  url?: string;
  referrer?: string;
  properties?: EventProperties;
}

/** An event as stored: enriched with server-derived fields and an id. */
export interface StoredEvent extends IncomingEvent {
  id: string;
  projectId: string;
  /** Server receive time, always authoritative for ordering. */
  receivedAt: string;
  timestamp: string;
  country: string | null;
  device: DeviceType;
  browser: string | null;
  os: string | null;
}

/** Device buckets derived from the user agent. */
export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';

/** Result of ingesting a batch: per-event accept/reject so clients can retry selectively. */
export interface IngestResult {
  accepted: number;
  rejected: number;
  errors: Array<{ index: number; message: string }>;
}
