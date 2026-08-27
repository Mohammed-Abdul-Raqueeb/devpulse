import { logger } from '../lib/logger.js';
import { runRetention } from './retention.job.js';

interface ScheduledJob {
  name: string;
  intervalMs: number;
  run: () => void;
}

const HOUR = 3_600_000;

const JOBS: ScheduledJob[] = [{ name: 'retention', intervalMs: 6 * HOUR, run: runRetention }];

// `ReturnType<typeof setInterval>` rather than `NodeJS.Timeout`: the same code
// then type-checks whether the DOM or the Node globals are in scope.
type Timer = ReturnType<typeof setInterval>;

const timers: Timer[] = [];

/**
 * A minimal in-process scheduler.
 *
 * Jobs here are idempotent sweeps, so a cron library and a job table would be
 * more machinery than the problem needs. The first run is delayed so a boot
 * under load is not competing with a retention sweep.
 */
export function startJobs(): void {
  for (const job of JOBS) {
    const execute = (): void => {
      try {
        job.run();
      } catch (err) {
        // A throwing job must never take the server down with it.
        logger.error({ err, job: job.name }, 'scheduled job failed');
      }
    };

    const initial = setTimeout(execute, 60_000);
    const repeating = setInterval(execute, job.intervalMs);
    initial.unref();
    repeating.unref();
    timers.push(initial, repeating);

    logger.debug({ job: job.name, intervalMs: job.intervalMs }, 'job scheduled');
  }
}

export function stopJobs(): void {
  for (const timer of timers) clearInterval(timer);
  timers.length = 0;
}

/** Runs every job once, immediately. Used by the `jobs:run` script and by tests. */
export function runAllJobsOnce(): void {
  for (const job of JOBS) job.run();
}
