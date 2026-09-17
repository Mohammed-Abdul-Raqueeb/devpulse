import { useCallback, useMemo, useState } from 'react';
import {
  DASHBOARD_PRESETS,
  suggestGranularity,
  type Granularity,
  type PresetId,
  type TimeRange,
} from '@devpulse/shared';

export interface DateRangeState {
  preset: PresetId;
  range: TimeRange;
  /** Bucket width that keeps the current range under about 120 points. */
  granularity: Granularity;
  setPreset: (preset: PresetId) => void;
}

const STORAGE_KEY = 'devpulse.preset';

function readStoredPreset(): PresetId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return DASHBOARD_PRESETS.some((p) => p.id === stored) ? (stored as PresetId) : '7d';
  } catch {
    return '7d';
  }
}

/**
 * Owns the dashboard date range.
 *
 * `to` is pinned to the top of the current minute rather than `Date.now()`, so
 * the range only changes once a minute instead of on every render — which keeps
 * it usable as a dependency without re-fetching constantly.
 */
export function useDateRange(): DateRangeState {
  const [preset, setPresetState] = useState<PresetId>(readStoredPreset);

  const range = useMemo<TimeRange>(() => {
    const hours = DASHBOARD_PRESETS.find((p) => p.id === preset)?.hours ?? 24 * 7;
    const to = new Date();
    to.setSeconds(0, 0);
    return {
      from: new Date(to.getTime() - hours * 3_600_000).toISOString(),
      to: to.toISOString(),
    };
  }, [preset]);

  const setPreset = useCallback((next: PresetId) => {
    setPresetState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A blocked localStorage just means the choice is not remembered.
    }
  }, []);

  return { preset, range, granularity: suggestGranularity(range), setPreset };
}
