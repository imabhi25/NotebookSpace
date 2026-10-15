export type ThemeSetting = 'auto' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'notebookspace_theme';

const darkQuery = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

export const getThemeSetting = (): ThemeSetting => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // ignore
  }
  return 'auto';
};

export const resolveTheme = (setting: ThemeSetting): 'light' | 'dark' =>
  setting === 'auto' ? (darkQuery()?.matches ? 'dark' : 'light') : setting;

// Mirrors the inline script in index.html, which sets the theme before first paint.
export const applyTheme = (setting: ThemeSetting = getThemeSetting()): void => {
  if (typeof document === 'undefined') return;
  const theme = resolveTheme(setting);
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  // The browser chrome colour comes from the same token the page background uses.
  const chrome = getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim();
  if (meta && chrome) meta.setAttribute('content', chrome);
};

export const setThemeSetting = (setting: ThemeSetting): void => {
  try {
    if (setting === 'auto') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, setting);
  } catch {
    // ignore
  }
  // Cross-fade colours for a moment so a manual switch eases instead of snapping.
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.classList.add('theme-switching');
    window.setTimeout(() => root.classList.remove('theme-switching'), 320);
  }
  applyTheme(setting);
};

// While the setting is Auto, follow the operating system as it changes.
export const watchSystemTheme = (): (() => void) => {
  const query = darkQuery();
  if (!query) return () => undefined;
  const handle = () => {
    if (getThemeSetting() === 'auto') applyTheme('auto');
  };
  query.addEventListener('change', handle);
  return () => query.removeEventListener('change', handle);
};
