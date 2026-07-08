/** Display helpers shared by the dashboard and the CLI report output. */

const COMPACT_UNITS = [
  { limit: 1e9, suffix: 'B' },
  { limit: 1e6, suffix: 'M' },
  { limit: 1e3, suffix: 'K' },
] as const;

/** 1234 -> "1.2K". Keeps one decimal only when it adds information. */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  for (const unit of COMPACT_UNITS) {
    if (abs >= unit.limit) {
      const scaled = value / unit.limit;
      const decimals = Math.abs(scaled) < 10 ? 1 : 0;
      return `${trimZero(scaled.toFixed(decimals))}${unit.suffix}`;
    }
  }
  return String(Math.round(value));
}

function trimZero(s: string): string {
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** 0.4213 -> "42.1%" */
export function formatPercent(fraction: number, decimals = 1): string {
  return `${(fraction * 100).toFixed(decimals)}%`;
}

/** 3725 -> "1h 2m" */
export function formatDuration(seconds: number): string {
  if (seconds < 1) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Signed delta between two totals, as a fraction. Returns null when there is no baseline. */
export function relativeChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

/** Strips query strings and trailing slashes so page breakdowns group sensibly. */
export function normalizePath(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '');
    return path === '' ? '/' : path;
  } catch {
    return url.split('?')[0] ?? url;
  }
}

/** "https://news.example.com/x" -> "news.example.com". Empty input means direct traffic. */
export function referrerHost(referrer: string | null | undefined): string {
  if (!referrer) return 'direct';
  try {
    return new URL(referrer).host || 'direct';
  } catch {
    return 'direct';
  }
}
