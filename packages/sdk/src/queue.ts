import { MAX_BATCH_SIZE } from '@devpulse/shared';
import type { IncomingEvent } from '@devpulse/shared';

export interface QueueOptions {
  /** Flush once this many events are buffered. */
  flushAt?: number;
  /** Hard ceiling; events beyond it are dropped rather than grown unbounded. */
  capacity?: number;
  now?: () => number;
}

export interface DrainResult {
  events: IncomingEvent[];
  dropped: number;
}

/**
 * A bounded in-memory buffer of pending events.
 *
 * Deliberately has no timers and no network awareness: the client owns both, so
 * this stays a pure data structure that can be exercised without faking either.
 */
export class EventQueue {
  private readonly events: IncomingEvent[] = [];
  private readonly flushAt: number;
  private readonly capacity: number;
  private droppedCount = 0;

  constructor(options: QueueOptions = {}) {
    // Never buffer more than the API will accept in one request, or the first
    // flush would be rejected as an oversized batch.
    this.flushAt = Math.min(options.flushAt ?? 20, MAX_BATCH_SIZE);
    this.capacity = Math.max(this.flushAt, options.capacity ?? 500);
  }

  get size(): number {
    return this.events.length;
  }

  /** Events discarded because the buffer was full. Reported for diagnostics. */
  get dropped(): number {
    return this.droppedCount;
  }

  /** True once the buffer has reached the flush threshold. */
  get shouldFlush(): boolean {
    return this.events.length >= this.flushAt;
  }

  /**
   * Buffers an event. Returns false when it was dropped.
   *
   * At capacity the *oldest* event is discarded rather than the newest: if the
   * network has been down for a while, the most recent activity is the more
   * useful thing to keep.
   */
  push(event: IncomingEvent): boolean {
    if (this.events.length >= this.capacity) {
      this.events.shift();
      this.droppedCount += 1;
    }
    this.events.push(event);
    return true;
  }

  /** Removes and returns everything buffered, up to one batch. */
  drain(): DrainResult {
    const events = this.events.splice(0, MAX_BATCH_SIZE);
    const dropped = this.droppedCount;
    this.droppedCount = 0;
    return { events, dropped };
  }

  /**
   * Returns events to the front of the buffer after a failed send, so a retry
   * preserves ordering instead of reversing it.
   */
  requeue(events: IncomingEvent[]): void {
    const overflow = this.events.length + events.length - this.capacity;
    if (overflow > 0) {
      // Keep the newest; the retried batch is older than whatever arrived since.
      this.droppedCount += overflow;
      events = events.slice(overflow);
    }
    this.events.unshift(...events);
  }

  clear(): void {
    this.events.length = 0;
    this.droppedCount = 0;
  }
}
