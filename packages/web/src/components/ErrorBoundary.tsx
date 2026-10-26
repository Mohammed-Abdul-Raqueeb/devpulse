import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Rendered instead of the default panel, if the caller wants its own. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Stops one broken screen taking the whole dashboard down.
 *
 * This has to be a class component: `componentDidCatch` has no hook equivalent,
 * and without it a render-time throw unmounts the entire React tree and leaves
 * the user staring at a blank page with no way back.
 *
 * It catches render and lifecycle errors only. A rejected fetch is handled by
 * `useAsync` and surfaced through `ErrorNotice`, which is the better experience
 * because the rest of the page keeps working.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // A self-hosted operator is usually also the developer, so the component
    // stack is far more useful in their console than hidden.
    console.error('DevPulse: render error', error, info.componentStack);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="notice notice--error" role="alert">
        <div>
          <p className="notice__title">This screen failed to render.</p>
          <p className="notice__detail">{error.message}</p>
          <p className="notice__detail">
            The rest of the dashboard is fine — try again, or go back to your projects.
          </p>
        </div>
        <button type="button" className="button button--ghost" onClick={this.reset}>
          Try again
        </button>
      </div>
    );
  }
}
