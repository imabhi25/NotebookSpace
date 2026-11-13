// NotebookSpace is light-only. There is no theme setting; this pins the document to light.
export const THEME_STORAGE_KEY = 'notebookspace_theme';

export const applyTheme = (): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', 'light');
  // A dark or system choice stored by an earlier version no longer applies.
  try { window.localStorage.removeItem(THEME_STORAGE_KEY); } catch { /* ignore */ }
};
