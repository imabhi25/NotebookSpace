import { Source } from './types';

const SMALL_WORDS = new Set(['a', 'an', 'and', 'of', 'the', 'to', 'in', 'on', 'for', 'vs']);

const titleCase = (word: string, index: number): string => {
  const lower = word.toLowerCase();
  if (index > 0 && SMALL_WORDS.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

/** QUESTIONS_v1.pdf -> "Questions (v1)", announcement_week4.md -> "Week 4 Announcement". */
export function cleanFileTitle(name: string): string {
  let base = name.trim().replace(/\.(pdf|md|markdown|txt|docx?)$/i, '');
  const hasMarkers = /[_]|[a-z0-9]-[a-z0-9]/i.test(base) || !/\s/.test(base) || base !== name.trim() || /^[A-Z0-9 _-]+$/.test(base);
  if (!hasMarkers) return name.trim();
  base = base.replace(/([a-z])([A-Z])/g, '$1 $2');
  let version = '';
  base = base.replace(/[\s_-]*(?<![a-z0-9])v(\d+(?:\.\d+)*)(?![a-z0-9])/i, (_m, v: string) => { version = ` (v${v})`; return ''; });
  let prefix = '';
  base = base.replace(/[\s_-]*(?<![a-z0-9])(week|lecture|lab|chapter|unit|module|session|hw|homework|assignment)[\s_-]*(\d+)(?![a-z0-9])/i, (_m, kind: string, num: string) => {
    const k = kind.toLowerCase();
    prefix = `${k === 'hw' ? 'Homework' : titleCase(k, 0)} ${num}`;
    return '';
  });
  const words = base.split(/[\s_-]+/).filter(Boolean).map((w, i) => titleCase(w, i));
  const body = words.join(' ');
  const joined = [prefix, body].filter(Boolean).join(' ');
  return `${joined || name.trim()}${version}`.trim();
}

/** First meaningful heading in the source text, when the text is available. */
export function headingFromText(text?: string | null): string | null {
  if (!text) return null;
  for (const raw of text.split(/\r?\n/).slice(0, 12)) {
    const line = raw.replace(/^#{1,6}\s+/, '').trim();
    if (raw.trim().startsWith('#') && line.length >= 3 && line.length <= 80) return line;
  }
  return null;
}

export function autoCleanTitle(source: Pick<Source, 'title' | 'file_name' | 'raw_content'>): string {
  return headingFromText(source.raw_content) ?? cleanFileTitle(source.title || source.file_name);
}
