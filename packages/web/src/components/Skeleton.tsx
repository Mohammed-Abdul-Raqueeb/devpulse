interface SkeletonProps {
  /** How many placeholder rows to draw. */
  rows?: number;
  height?: number;
  /** Renders a single block rather than a stack, e.g. for a chart area. */
  block?: boolean;
}

/**
 * A loading placeholder.
 *
 * Sized to roughly match the content it stands in for, so the layout does not
 * jump when real data arrives — a shifting page is worse than a slow one.
 * `aria-hidden` keeps the shimmer out of the accessibility tree; the live region
 * around it is what announces loading.
 */
export function Skeleton({ rows = 3, height = 20, block = false }: SkeletonProps): JSX.Element {
  if (block) {
    return <div className="skeleton skeleton--block" style={{ height }} aria-hidden="true" />;
  }

  return (
    <div className="skeleton-stack" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            height,
            // Taper the rows so the block reads as text rather than a grey box.
            width: `${100 - i * 8}%`,
          }}
        />
      ))}
    </div>
  );
}

/** Wraps a skeleton in the live region that announces the load to a screen reader. */
export function LoadingRegion({
  loading,
  label,
  children,
}: {
  loading: boolean;
  label: string;
  children: JSX.Element;
}): JSX.Element {
  return (
    <div aria-busy={loading} aria-live="polite" aria-label={loading ? `Loading ${label}` : label}>
      {children}
    </div>
  );
}
