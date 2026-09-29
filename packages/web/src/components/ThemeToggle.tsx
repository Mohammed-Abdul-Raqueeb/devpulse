import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'devpulse.theme';
const ORDER: Theme[] = ['system', 'light', 'dark'];

const LABELS: Record<Theme, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return ORDER.includes(stored as Theme) ? (stored as Theme) : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Cycles system -> light -> dark.
 *
 * `system` removes the attribute entirely rather than resolving the OS setting
 * in JavaScript, so the CSS media query stays in charge and the theme follows
 * the OS live, without this component having to listen for changes.
 */
export function ThemeToggle(): JSX.Element {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // A blocked localStorage only costs the preference across reloads.
    }
  }, [theme]);

  const next = (): void => {
    setTheme((current) => ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!);
  };

  return (
    <button
      type="button"
      className="button button--icon"
      onClick={next}
      title={LABELS[theme]}
      aria-label={LABELS[theme]}
    >
      {theme === 'light' ? '☀' : theme === 'dark' ? '☾' : '◐'}
    </button>
  );
}
