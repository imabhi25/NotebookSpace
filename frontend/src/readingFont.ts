export type ReadingFont = 'sans' | 'serif';
export const READING_FONT_KEY = 'notebookspace_reading_font';

export const getReadingFont = (): ReadingFont => {
  try {
    return window.localStorage.getItem(READING_FONT_KEY) === 'serif' ? 'serif' : 'sans';
  } catch {
    return 'sans';
  }
};

/** Sets data-reading-font on <html>; CSS swaps --font-family-reading for notes and answers. */
export const applyReadingFont = (font: ReadingFont = getReadingFont()): void => {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-reading-font', font);
};

export const setReadingFont = (font: ReadingFont): void => {
  try {
    if (font === 'sans') window.localStorage.removeItem(READING_FONT_KEY);
    else window.localStorage.setItem(READING_FONT_KEY, font);
  } catch {
    // ignore
  }
  applyReadingFont(font);
};
