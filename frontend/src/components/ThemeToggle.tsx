import React, { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'light' | 'dark';

const STORAGE_KEY = 'notebookspace-theme';

function readStored(): ThemeChoice | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Theme state. An explicit choice is stored and applied as data-theme on <html>.
 * With no stored choice the attribute is absent and CSS follows the OS setting.
 */
export function useTheme(): { theme: ThemeChoice; toggle: () => void } {
  const [stored, setStored] = useState<ThemeChoice | null>(() => readStored());
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark());

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (stored) root.setAttribute('data-theme', stored);
    else root.removeAttribute('data-theme');
  }, [stored]);

  const theme: ThemeChoice = stored ?? (systemDark ? 'dark' : 'light');

  const toggle = useCallback(() => {
    const next: ThemeChoice = theme === 'dark' ? 'light' : 'dark';
    setStored(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable: choice still applies for this session */
    }
  }, [theme]);

  return { theme, toggle };
}

export const ThemeToggle: React.FC = () => {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      className="theme-toggle-btn"
      onClick={toggle}
      aria-pressed={isDark}
      aria-label="Dark theme"
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      data-testid="theme-toggle"
    >
      {isDark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
};
