// Pure helpers for the source reader: split stored text into pages, find a
// retrieved passage on a page, and lay a page out as paragraphs.
import type { SourceType } from './types';

/**
 * Exactly the characters Python's `str.split()` treats as whitespace, which is
 * what the server's chunker collapses. Not the same as JavaScript's `\s`:
 * Python also splits on U+001C-U+001F and U+0085; JavaScript also treats U+FEFF
 * as whitespace and Python does not.
 */
export const SERVER_WHITESPACE =
  /[\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/;
const SERVER_WHITESPACE_G = new RegExp(SERVER_WHITESPACE.source, 'g');

export interface ParsedPages {
  pages: Map<number, string>;
  order: number[];
}

const MARKER = /^--- Page (\d+) ---\n/gm;

/**
 * Split `raw_content` ("--- Page N ---\n<text>" blocks joined by blank lines).
 * A marker starts a page only if its number is greater than the previous one;
 * a marker-shaped line with a lower or equal number stays as page text. Text
 * with no markers returns no pages.
 */
export function parseSourcePages(rawContent: string | null | undefined): ParsedPages {
  const result: ParsedPages = { pages: new Map(), order: [] };
  if (!rawContent || !rawContent.trim()) return result;
  const raw = rawContent.replace(/\r\n/g, '\n');

  const accepted: { number: number; start: number; end: number }[] = [];
  let last = 0;
  for (const m of raw.matchAll(MARKER)) {
    const n = Number(m[1]);
    if (n > last) {
      accepted.push({ number: n, start: m.index!, end: m.index! + m[0].length });
      last = n;
    }
  }
  accepted.forEach((marker, i) => {
    const stop = i + 1 < accepted.length ? accepted[i + 1].start : raw.length;
    // The server joins pages with a blank line; drop that separator.
    const text = raw.slice(marker.end, stop).replace(/\n\n$/, '');
    result.pages.set(marker.number, text);
    result.order.push(marker.number);
  });
  return result;
}

export interface Collapsed {
  text: string;
  /** map[i] is the index in the original text of collapsed character i. */
  map: number[];
}

/** Collapse runs of server whitespace to one space, remembering original positions. */
export function collapseWhitespace(text: string): Collapsed {
  let out = '';
  const map: number[] = [];
  let last = 0;
  for (const m of text.matchAll(SERVER_WHITESPACE_G)) {
    for (let i = last; i < m.index!; i++) { out += text[i]; map.push(i); }
    out += ' ';
    map.push(m.index!);
    last = m.index! + m[0].length;
  }
  for (let i = last; i < text.length; i++) { out += text[i]; map.push(i); }
  return { text: out, map };
}

export interface PassageInput { text: string; kind: 'passage' | 'excerpt' }
export interface PassageRange { start: number; end: number; kind: 'passage' | 'excerpt' }

/**
 * Find each passage exactly (after collapsing whitespace on both sides) and
 * return non-overlapping ranges in the page's original coordinates. Anything
 * not found is left out; nothing is matched approximately.
 */
export function locatePassages(pageText: string, passages: PassageInput[]): PassageRange[] {
  const page = collapseWhitespace(pageText);
  const found: PassageRange[] = [];
  for (const p of passages) {
    const needle = collapseWhitespace(p.text).text.trim();
    if (!needle) continue;
    const at = page.text.indexOf(needle);
    if (at < 0) continue;
    found.push({
      start: page.map[at],
      end: page.map[at + needle.length - 1] + 1,
      kind: p.kind,
    });
  }
  found.sort((a, b) => a.start - b.start);
  const kept: PassageRange[] = [];
  for (const r of found) {
    if (!kept.length || r.start >= kept[kept.length - 1].end) kept.push(r);
  }
  return kept;
}

export interface Paragraph { start: number; end: number; text: string }

/**
 * Lay a page out for reading. PDF pages keep their blank-line paragraphs and
 * show single line breaks as spaces (same length, so offsets stay valid).
 * Other sources were already joined with single spaces into 350-word virtual
 * pages, so there is nothing to rebuild and the page is one block.
 */
export function toParagraphs(pageText: string, sourceType: SourceType): Paragraph[] {
  if (!pageText.trim()) return [];
  if (sourceType !== 'pdf') return [{ start: 0, end: pageText.length, text: pageText }];
  const out: Paragraph[] = [];
  let from = 0;
  const push = (start: number, end: number) => {
    const seg = pageText.slice(start, end);
    if (seg.trim()) out.push({ start, end, text: seg.replace(/\n/g, ' ') });
  };
  for (const m of pageText.matchAll(/\n(?:[ \t]*\n)+/g)) {
    push(from, m.index!);
    from = m.index! + m[0].length;
  }
  push(from, pageText.length);
  return out;
}

/** PDFs have real pages; every other type is split into ~350-word sections. */
export function pageLabel(sourceType: SourceType): { unit: 'Page' | 'Section'; hint?: string } {
  return sourceType === 'pdf' ? { unit: 'Page' } : { unit: 'Section', hint: 'about 350 words' };
}

// Small in-memory cache of parsed pages, newest last, keeping three sources.
const CACHE_LIMIT = 3;
const cache = new Map<string, ParsedPages>();

export function getCachedPages(key: string): ParsedPages | undefined {
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); }
  return hit;
}

export function setCachedPages(key: string, value: ParsedPages): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
}

export function clearSourceTextCache(): void { cache.clear(); }
