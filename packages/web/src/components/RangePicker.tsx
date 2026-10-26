import { DASHBOARD_PRESETS, type PresetId } from '@devpulse/shared';

interface RangePickerProps {
  value: PresetId;
  onChange: (preset: PresetId) => void;
  /** Live visitor count, rendered as a pulsing badge when non-zero. */
  liveVisitors?: number;
  /** Omit both to hide the crawler toggle entirely. */
  includeBots?: boolean;
  onIncludeBotsChange?: (include: boolean) => void;
}

/** Preset range selector, rendered as a radio group so arrow keys work. */
export function RangePicker({
  value,
  onChange,
  liveVisitors,
  includeBots,
  onIncludeBotsChange,
}: RangePickerProps): JSX.Element {
  return (
    <div className="rangepicker">
      {liveVisitors !== undefined ? (
        <p className={`live ${liveVisitors > 0 ? 'live--active' : ''}`}>
          <span className="live__dot" aria-hidden="true" />
          {liveVisitors} online
        </p>
      ) : null}

      {onIncludeBotsChange ? (
        <label className="toggle">
          <input
            type="checkbox"
            checked={includeBots ?? false}
            onChange={(e) => onIncludeBotsChange(e.target.checked)}
          />
          <span>Include bots</span>
        </label>
      ) : null}

      <div className="rangepicker__group" role="radiogroup" aria-label="Date range">
        {DASHBOARD_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={value === preset.id}
            className={`rangepicker__option ${value === preset.id ? 'is-selected' : ''}`}
            onClick={() => onChange(preset.id)}
          >
            {preset.id.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
