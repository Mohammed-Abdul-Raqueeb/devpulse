import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useAsync } from '../src/hooks/useAsync';
import { useDateRange } from '../src/hooks/useDateRange';
import { isTyping, useShortcuts } from '../src/hooks/useShortcuts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useAsync', () => {
  it('starts in a loading state and resolves to data', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.resolve('value'), []));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe('value');
    expect(result.current.error).toBeNull();
  });

  it('captures a rejection as an error', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.reject(new Error('nope')), []));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe('nope');
  });

  it('wraps a non-Error rejection so callers always get an Error', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.reject('a string'), []));

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
  });

  it('re-runs the task on reload', async () => {
    let calls = 0;
    const { result } = renderHook(() =>
      useAsync(() => {
        calls += 1;
        return Promise.resolve(calls);
      }, []),
    );

    await waitFor(() => expect(result.current.data).toBe(1));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe(2));
  });

  it('discards a slow earlier result in favour of the newer one', async () => {
    // The real case: the user changes the date range twice quickly, and the
    // first, slower response must not overwrite the second.
    const deferred: Array<(value: string) => void> = [];
    let key = 'first';

    const { result, rerender } = renderHook(
      ({ dep }: { dep: string }) =>
        useAsync(
          () =>
            new Promise<string>((resolve) => {
              deferred.push(resolve);
            }),
          [dep],
        ),
      { initialProps: { dep: key } },
    );

    key = 'second';
    rerender({ dep: key });

    // Resolve the second request, then the first.
    act(() => deferred[1]?.('second-result'));
    await waitFor(() => expect(result.current.data).toBe('second-result'));

    act(() => deferred[0]?.('first-result'));
    await waitFor(() => expect(result.current.data).toBe('second-result'));
  });

  it('keeps the previous data visible while reloading', async () => {
    let calls = 0;
    const { result } = renderHook(() =>
      useAsync(() => {
        calls += 1;
        return Promise.resolve(`run-${calls}`);
      }, []),
    );

    await waitFor(() => expect(result.current.data).toBe('run-1'));
    act(() => result.current.reload());

    // Data is retained during the reload rather than flashing empty.
    expect(result.current.data).toBe('run-1');
  });
});

describe('useDateRange', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to the last seven days', () => {
    const { result } = renderHook(() => useDateRange());

    expect(result.current.preset).toBe('7d');
  });

  it('moves the range when the preset changes', () => {
    const { result } = renderHook(() => useDateRange());
    const before = result.current.range.from;

    act(() => result.current.setPreset('24h'));

    expect(result.current.preset).toBe('24h');
    expect(result.current.range.from).not.toBe(before);
  });

  it('remembers the choice across mounts', () => {
    const first = renderHook(() => useDateRange());
    act(() => first.result.current.setPreset('30d'));
    first.unmount();

    const second = renderHook(() => useDateRange());

    expect(second.result.current.preset).toBe('30d');
  });

  it('picks a bucket width that suits the range', () => {
    const { result } = renderHook(() => useDateRange());

    act(() => result.current.setPreset('24h'));
    expect(result.current.granularity).toBe('hour');

    act(() => result.current.setPreset('12m'));
    expect(result.current.granularity).toBe('week');
  });

  it('pins the range end to the minute so it is stable as a dependency', () => {
    const { result, rerender } = renderHook(() => useDateRange());
    const first = result.current.range.to;

    rerender();

    expect(result.current.range.to).toBe(first);
    expect(first.endsWith(':00.000Z')).toBe(true);
  });

  it('falls back to the default when storage holds something unknown', () => {
    localStorage.setItem('devpulse.preset', 'nonsense');

    const { result } = renderHook(() => useDateRange());

    expect(result.current.preset).toBe('7d');
  });
});

describe('useShortcuts', () => {
  function Harness({ onHit }: { onHit: () => void }): JSX.Element {
    useShortcuts({ b: onHit });
    return <input aria-label="field" />;
  }

  it('fires the handler for a bare keypress', () => {
    const onHit = vi.fn();
    render(<Harness onHit={onHit} />);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));

    expect(onHit).toHaveBeenCalledTimes(1);
  });

  it('ignores a keypress carrying a modifier', () => {
    const onHit = vi.fn();
    render(<Harness onHit={onHit} />);

    // Otherwise the shortcut would shadow a browser or OS binding.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true }));

    expect(onHit).not.toHaveBeenCalled();
  });

  it('ignores a keypress while the user is typing in a field', () => {
    const onHit = vi.fn();
    render(<Harness onHit={onHit} />);

    const input = screen.getByLabelText('field');
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));

    expect(onHit).not.toHaveBeenCalled();
  });

  it('stops listening once unmounted', () => {
    const onHit = vi.fn();
    const { unmount } = render(<Harness onHit={onHit} />);

    unmount();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));

    expect(onHit).not.toHaveBeenCalled();
  });
});

describe('isTyping', () => {
  it('recognises the form elements that own a keypress', () => {
    expect(isTyping(document.createElement('input'))).toBe(true);
    expect(isTyping(document.createElement('textarea'))).toBe(true);
    expect(isTyping(document.createElement('select'))).toBe(true);
  });

  it('does not treat ordinary elements as typing targets', () => {
    expect(isTyping(document.createElement('div'))).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});
