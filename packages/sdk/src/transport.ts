import type { IncomingEvent } from '@devpulse/shared';

export interface SendRequest {
  endpoint: string;
  writeKey: string;
  events: IncomingEvent[];
  sdk: string;
  /** Use `sendBeacon`, for a flush during page unload. */
  beacon?: boolean;
}

export interface SendResult {
  ok: boolean;
  status: number;
  /** False for a permanent failure, so the caller stops retrying. */
  retryable: boolean;
}

/** Injectable so the tests never touch the network. */
export type Transport = (request: SendRequest) => Promise<SendResult>;

/**
 * Which HTTP statuses are worth retrying.
 *
 * 401/403 mean the key is wrong and 413 means the batch is too large — both
 * fail identically forever, so retrying only wastes the visitor's bandwidth.
 * A 207 is a partial success: the accepted events are stored, and resending
 * the batch would duplicate them, so it is deliberately not retryable.
 */
export function isRetryableStatus(status: number): boolean {
  if (status === 0) return true; // network error, no response
  if (status === 408 || status === 429) return true;
  return status >= 500 && status < 600;
}

/** The default transport: `sendBeacon` when asked for, otherwise `fetch`. */
export function createHttpTransport(): Transport {
  return async (request) => {
    const body = JSON.stringify({ events: request.events, sdk: request.sdk });

    if (request.beacon) return sendWithBeacon(request, body);

    try {
      const response = await fetch(request.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Write-Key': request.writeKey },
        body,
        // Lets the request outlive the page when a beacon is unavailable.
        keepalive: true,
      });

      return {
        ok: response.ok,
        status: response.status,
        retryable: response.ok ? false : isRetryableStatus(response.status),
      };
    } catch {
      // A thrown fetch is a transport failure, not a rejection by the server.
      return { ok: false, status: 0, retryable: true };
    }
  };
}

/**
 * `sendBeacon` cannot set headers, so the write key travels as a query
 * parameter — the API accepts both forms for exactly this reason.
 *
 * It also reports only whether the browser queued the request, never the
 * eventual status, so a queued beacon is treated as success. The alternative
 * would be retrying a request that very likely succeeded, during unload, when
 * there is no time to retry anyway.
 */
async function sendWithBeacon(request: SendRequest, body: string): Promise<SendResult> {
  const url = `${request.endpoint}?key=${encodeURIComponent(request.writeKey)}`;

  if (typeof navigator === 'undefined' || !navigator.sendBeacon) {
    return { ok: false, status: 0, retryable: true };
  }

  const queued = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
  return { ok: queued, status: queued ? 202 : 0, retryable: !queued };
}
