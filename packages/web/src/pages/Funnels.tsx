import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { FunnelStepDefinition } from '@devpulse/shared';
import { api } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useDateRange } from '../hooks/useDateRange';
import { FunnelChart } from '../components/FunnelChart';
import { ErrorNotice } from '../components/ErrorNotice';
import { RangePicker } from '../components/RangePicker';

const DEFAULT_STEPS: FunnelStepDefinition[] = [
  { name: 'Viewed a page', eventName: 'page_view' },
  { name: 'Selected a plan', eventName: 'plan_selected' },
  { name: 'Completed signup', eventName: 'signup_completed' },
];

/** Funnel builder: edit the steps, see conversion recomputed against the range. */
export function Funnels(): JSX.Element {
  const { slug = '' } = useParams();
  const { preset, range, setPreset } = useDateRange();
  const [steps, setSteps] = useState<FunnelStepDefinition[]>(DEFAULT_STEPS);
  const [windowDays, setWindowDays] = useState(7);
  // Editing a step should not fire a query on every keystroke.
  const [applied, setApplied] = useState(DEFAULT_STEPS);

  const names = useAsync(() => api.projects.schema(slug), [slug]);
  const result = useAsync(
    () => api.analytics.funnel(slug, range, applied, windowDays),
    [slug, range.from, range.to, applied, windowDays],
  );

  /** Editing a step's text is not applied until Recalculate. */
  const updateStep = (index: number, patch: Partial<FunnelStepDefinition>): void => {
    setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  };

  /**
   * Adding or removing a step applies immediately.
   *
   * A structural change always alters the result, whereas a half-typed event
   * name would just produce an empty funnel — so the two are handled
   * differently rather than both waiting for the button.
   */
  const applyStructuralChange = (next: FunnelStepDefinition[]): void => {
    setSteps(next);
    setApplied(next);
  };

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Funnels</h1>
          <p className="page__subtitle">
            Visitors must fire each step in order, within {windowDays} days of entering.
          </p>
        </div>
        <RangePicker value={preset} onChange={setPreset} />
      </header>

      <section className="panel">
        <header className="panel__header">
          <h2 className="panel__title">Steps</h2>
          <label className="field field--inline">
            <span className="field__label">Window (days)</span>
            <input
              type="number"
              min={1}
              max={90}
              className="field__input field__input--narrow"
              value={windowDays}
              onChange={(e) => setWindowDays(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
        </header>

        <ol className="step-editor">
          {steps.map((step, index) => (
            <li key={index} className="step-editor__row">
              <input
                className="field__input"
                aria-label={`Step ${index + 1} label`}
                value={step.name}
                onChange={(e) => updateStep(index, { name: e.target.value })}
              />
              <input
                className="field__input field__input--mono"
                aria-label={`Step ${index + 1} event name`}
                list="event-names"
                value={step.eventName}
                onChange={(e) => updateStep(index, { eventName: e.target.value })}
              />
              <button
                type="button"
                className="button button--ghost"
                disabled={steps.length <= 2}
                onClick={() => applyStructuralChange(steps.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>

        <datalist id="event-names">
          {(names.data?.eventNames ?? []).map((eventName) => (
            <option key={eventName} value={eventName} />
          ))}
        </datalist>

        <div className="panel__actions">
          <button
            type="button"
            className="button button--ghost"
            disabled={steps.length >= 8}
            onClick={() =>
              applyStructuralChange([...steps, { name: `Step ${steps.length + 1}`, eventName: '' }])
            }
          >
            Add step
          </button>
          <button type="button" className="button" onClick={() => setApplied(steps)}>
            Recalculate
          </button>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel__title">Conversion</h2>
        {result.error ? (
          <ErrorNotice error={result.error} onRetry={result.reload} compact />
        ) : (
          <FunnelChart steps={result.data?.steps ?? []} loading={result.loading} />
        )}
      </section>
    </div>
  );
}
