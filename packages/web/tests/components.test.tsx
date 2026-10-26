import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StatCard } from '../src/components/StatCard';
import { BarList } from '../src/components/BarList';
import { FunnelChart } from '../src/components/FunnelChart';
import { RetentionGrid } from '../src/components/RetentionGrid';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { Skeleton } from '../src/components/Skeleton';

afterEach(cleanup);

describe('StatCard', () => {
  it('renders the label and value', () => {
    render(<StatCard label="Visitors" value="4.8K" />);

    expect(screen.getByText('Visitors')).toBeTruthy();
    expect(screen.getByText('4.8K')).toBeTruthy();
  });

  it('shows growth as a positive delta', () => {
    render(<StatCard label="Visitors" value="150" current={150} previous={100} />);

    expect(screen.getByText('50.0%')).toBeTruthy();
    expect(document.querySelector('.stat__delta--good')).toBeTruthy();
  });

  it('shows decline as a negative delta', () => {
    render(<StatCard label="Visitors" value="50" current={50} previous={100} />);

    expect(document.querySelector('.stat__delta--bad')).toBeTruthy();
  });

  it('treats a fall as good for an inverted metric', () => {
    // Bounce rate going down is an improvement, so the badge must not be red.
    render(<StatCard label="Bounce rate" value="30%" current={30} previous={50} inverted />);

    expect(document.querySelector('.stat__delta--good')).toBeTruthy();
  });

  it('says there is no baseline rather than claiming zero change', () => {
    render(<StatCard label="Visitors" value="10" current={10} previous={0} />);

    expect(screen.getByText('no prior data')).toBeTruthy();
  });

  it('omits the delta entirely when no comparison is given', () => {
    render(<StatCard label="Visitors" value="10" />);

    expect(screen.getByText('no prior data')).toBeTruthy();
  });

  it('shows a placeholder value while loading', () => {
    render(<StatCard label="Visitors" value="4.8K" loading />);

    expect(screen.queryByText('4.8K')).toBeNull();
  });
});

describe('BarList', () => {
  const rows = [
    { key: '/pricing', value: 120, share: 0.6 },
    { key: '/docs', value: 80, share: 0.4 },
  ];

  it('renders every row with its value', () => {
    render(<BarList title="Top pages" rows={rows} />);

    expect(screen.getByText('/pricing')).toBeTruthy();
    expect(screen.getByText('120')).toBeTruthy();
  });

  it('scales the widest bar to full width', () => {
    render(<BarList title="Top pages" rows={rows} />);

    const bars = document.querySelectorAll<HTMLElement>('.barlist__bar');
    expect(bars[0]?.style.width).toBe('100%');
    expect(bars[1]?.style.width).not.toBe('100%');
  });

  it('shows an Other row when the breakdown was truncated', () => {
    render(<BarList title="Top pages" rows={rows} otherValue={45} />);

    expect(screen.getByText('Other')).toBeTruthy();
  });

  it('hides the Other row when nothing was truncated', () => {
    render(<BarList title="Top pages" rows={rows} otherValue={0} />);

    expect(screen.queryByText('Other')).toBeNull();
  });

  it('applies a key renderer so a url shows as a path', () => {
    render(
      <BarList
        title="Top pages"
        rows={[{ key: 'https://acme.test/pricing', value: 1, share: 1 }]}
        renderKey={(key) => new URL(key).pathname}
      />,
    );

    expect(screen.getByText('/pricing')).toBeTruthy();
  });

  it('says so when there is nothing in range', () => {
    render(<BarList title="Top pages" rows={[]} />);

    expect(screen.getByText(/Nothing recorded/)).toBeTruthy();
  });
});

describe('FunnelChart', () => {
  const steps = [
    {
      name: 'Landed',
      eventName: 'page_view',
      visitors: 100,
      conversionFromPrevious: 1,
      conversionFromStart: 1,
    },
    {
      name: 'Picked plan',
      eventName: 'plan_selected',
      visitors: 40,
      conversionFromPrevious: 0.4,
      conversionFromStart: 0.4,
    },
  ];

  it('renders each step with its visitor count', () => {
    render(<FunnelChart steps={steps} />);

    expect(screen.getByText('1. Landed')).toBeTruthy();
    expect(screen.getByText('2. Picked plan')).toBeTruthy();
  });

  it('calls out the drop-off between steps', () => {
    render(<FunnelChart steps={steps} />);

    expect(screen.getByText(/40% continued/)).toBeTruthy();
    expect(screen.getByText(/60 dropped off/)).toBeTruthy();
  });

  it('sizes each bar by cumulative conversion', () => {
    render(<FunnelChart steps={steps} />);

    const bars = document.querySelectorAll<HTMLElement>('.funnel__bar');
    expect(bars[0]?.style.width).toBe('100%');
    expect(bars[1]?.style.width).toBe('40%');
  });

  it('says so when nobody entered the funnel', () => {
    render(<FunnelChart steps={[{ ...steps[0]!, visitors: 0 }]} />);

    expect(screen.getByText(/No visitors entered/)).toBeTruthy();
  });
});

describe('RetentionGrid', () => {
  const rows = [
    {
      cohort: '2026-03-02T00:00:00.000Z',
      size: 100,
      retained: [100, 40, 20],
      rates: [1, 0.4, 0.2],
    },
    { cohort: '2026-03-09T00:00:00.000Z', size: 50, retained: [50, 30], rates: [1, 0.6] },
  ];

  it('renders one row per populated cohort', () => {
    render(<RetentionGrid rows={rows} period="week" />);

    expect(document.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('renders a column header per period', () => {
    render(<RetentionGrid rows={rows} period="week" />);

    expect(screen.getByText('Week 0')).toBeTruthy();
    expect(screen.getByText('Week 2')).toBeTruthy();
  });

  it('shows retention rates as percentages', () => {
    render(<RetentionGrid rows={rows} period="week" />);

    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByText('20%')).toBeTruthy();
  });

  it('leaves a not-yet-reached period blank rather than showing zero', () => {
    render(<RetentionGrid rows={rows} period="week" />);

    // The second cohort has only two periods of data but the grid is three wide.
    expect(document.querySelectorAll('.retention__cell--future')).toHaveLength(1);
  });

  it('skips cohorts that nobody joined', () => {
    render(
      <RetentionGrid
        rows={[...rows, { cohort: '2026-03-16T00:00:00.000Z', size: 0, retained: [], rates: [] }]}
        period="week"
      />,
    );

    expect(document.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('explains itself when there are no cohorts at all', () => {
    render(<RetentionGrid rows={[]} period="week" />);

    expect(screen.getByText(/No cohorts in this range/)).toBeTruthy();
  });
});

describe('ErrorBoundary', () => {
  function Boom(): JSX.Element {
    throw new Error('component exploded');
  }

  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('all good')).toBeTruthy();
  });

  it('catches a render error and offers a way out', () => {
    // React logs the caught error itself; silence it so the output stays readable.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('component exploded')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();

    spy.mockRestore();
  });

  it('uses a caller-supplied fallback when given one', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary fallback={(error) => <p>custom: {error.message}</p>}>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/custom: component exploded/)).toBeTruthy();

    spy.mockRestore();
  });
});

describe('Skeleton', () => {
  it('renders the requested number of rows', () => {
    render(<Skeleton rows={4} />);

    expect(document.querySelectorAll('.skeleton')).toHaveLength(4);
  });

  it('renders one block when asked', () => {
    render(<Skeleton block height={200} />);

    const block = document.querySelector<HTMLElement>('.skeleton--block');
    expect(block?.style.height).toBe('200px');
  });

  it('stays out of the accessibility tree', () => {
    render(<Skeleton rows={2} />);

    expect(document.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});
