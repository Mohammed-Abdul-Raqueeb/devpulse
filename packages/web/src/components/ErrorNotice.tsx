import { ApiError } from '../lib/api';

interface ErrorNoticeProps {
  error: Error;
  onRetry?: () => void;
  /** Renders inline, for a failure inside one panel rather than a whole page. */
  compact?: boolean;
}

/** Turns an API error code into something a user can act on. */
const GUIDANCE: Record<string, string> = {
  unauthorized: 'Your session expired. Sign in again to continue.',
  forbidden: 'Your account does not have access to this project.',
  not_found: 'That project no longer exists.',
  rate_limited: 'Too many requests. Wait a moment and try again.',
  validation_failed: 'The request was rejected. Check the highlighted fields.',
  internal_error: 'Something went wrong on the server. Retrying often helps.',
};

export function ErrorNotice({ error, onRetry, compact = false }: ErrorNoticeProps): JSX.Element {
  const code = error instanceof ApiError ? error.code : 'internal_error';
  const guidance = GUIDANCE[code] ?? error.message;

  return (
    <div className={`notice notice--error ${compact ? 'notice--compact' : ''}`} role="alert">
      <div>
        <p className="notice__title">{guidance}</p>
        {/* The raw message is kept visible: a self-hosted operator is usually
            also the developer, and hiding it would just mean a trip to the logs. */}
        <p className="notice__detail">{error.message}</p>

        {error instanceof ApiError && error.details.length > 0 ? (
          <ul className="notice__fields">
            {error.details.map((detail) => (
              <li key={detail.path}>
                <code>{detail.path}</code> {detail.message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {onRetry ? (
        <button type="button" className="button button--ghost" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
