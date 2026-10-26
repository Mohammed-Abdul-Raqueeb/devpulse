import { useEffect, useRef } from 'react';

export type ShortcutMap = Record<string, () => void>;

/**
 * Binds single-key shortcuts on the document.
 *
 * Two things make this safe to leave mounted. It ignores keystrokes while the
 * user is typing — otherwise pressing "1" in the event-name filter would jump
 * the date range — and it ignores anything with a modifier, so browser and OS
 * shortcuts keep working.
 *
 * The handlers are kept in a ref so the listener is attached once rather than
 * re-bound on every render, which would otherwise happen constantly since
 * callers pass an inline object.
 */
export function useShortcuts(shortcuts: ShortcutMap, enabled = true): void {
  const latest = useRef(shortcuts);

  // Synced in an effect rather than assigned during render: a ref write in the
  // render body is not safe under concurrent rendering, which may discard a
  // render after it has already mutated the ref.
  useEffect(() => {
    latest.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTyping(event.target)) return;

      const handler = latest.current[event.key];
      if (!handler) return;

      event.preventDefault();
      handler();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

/** True when focus is in a field, where a bare keypress belongs to the field. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
