import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  /** Re-runs the task, keeping the previous data visible while it loads. */
  reload: () => void;
}

/**
 * Runs an async task and tracks its lifecycle.
 *
 * Results from a superseded run are discarded: when the user changes the date
 * range twice quickly, a slow first response must not overwrite the fast second
 * one. A generation counter does that without needing AbortController support
 * in every caller.
 */
export function useAsync<T>(task: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const generation = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const run = (generation.current += 1);
    setLoading(true);

    task()
      .then((result) => {
        if (!mounted.current || run !== generation.current) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!mounted.current || run !== generation.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (mounted.current && run === generation.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, reload };
}

/** Re-runs a callback on an interval, pausing while the tab is hidden. */
export function usePolling(callback: () => void, intervalMs: number): void {
  useEffect(() => {
    const tick = (): void => {
      // Polling a hidden tab burns the user battery and the server budget.
      if (document.visibilityState === 'visible') callback();
    };

    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [callback, intervalMs]);
}
