/** Transport-level envelopes used by every HTTP endpoint. */

/** Machine-readable error codes. The dashboard switches on these, never on messages. */
export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'payload_too_large'
  | 'rate_limited'
  | 'validation_failed'
  | 'internal_error';

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** Field-level detail for `validation_failed`. */
    details?: Array<{ path: string; message: string }>;
    requestId: string;
  };
}

export interface Paginated<T> {
  data: T[];
  page: {
    limit: number;
    /** Opaque cursor for the next page, or null at the end. */
    cursor: string | null;
    hasMore: boolean;
  };
}

export interface PaginationQuery {
  limit?: number;
  cursor?: string;
}

/** Response of `GET /health`. */
export interface HealthReport {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSeconds: number;
  checks: Record<string, { ok: boolean; detail?: string }>;
}
