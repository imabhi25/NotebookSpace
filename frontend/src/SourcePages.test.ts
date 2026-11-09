import { beforeEach, describe, expect, it } from 'vitest';
import {
  SERVER_WHITESPACE, clearSourceTextCache, collapseWhitespace, getCachedPages, locatePassages,
  pageLabel, parseSourcePages, setCachedPages, toParagraphs,
} from './sourcePages';

// Code points Python's str.split() splits on (checked over all of Unicode).
const PYTHON_WHITESPACE = [
  0x0009, 0x000A, 0x000B, 0x000C, 0x000D, 0x001C, 0x001D, 0x001E, 0x001F, 0x0020, 0x0085, 0x00A0,
  0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A,
  0x2028, 0x2029, 0x202F, 0x205F, 0x3000,
];

describe('SERVER_WHITESPACE', () => {
  it('matches exactly the characters Python splits on', () => {
    const anchored = new RegExp(`^(?:${SERVER_WHITESPACE.source})$`);
    for (let c = 0; c < 0x10000; c++) {
      const expected = PYTHON_WHITESPACE.includes(c);
      expect(anchored.test(String.fromCharCode(c)), `U+${c.toString(16)}`).toBe(expected);
    }
    expect(PYTHON_WHITESPACE).toHaveLength(29);
  });
  it('does not treat U+FEFF as whitespace', () => {
    expect(SERVER_WHITESPACE.test('\uFEFF')).toBe(false);
  });
});

describe('parseSourcePages', () => {
  it('splits marker blocks and drops the blank-line separator', () => {
    const { pages, order } = parseSourcePages('--- Page 1 ---\nfirst\n\n--- Page 2 ---\nsecond');
    expect(order).toEqual([1, 2]);
    expect(pages.get(1)).toBe('first');
    expect(pages.get(2)).toBe('second');
  });
  it('returns no pages for text without markers, empty, or null input', () => {
    expect(parseSourcePages('just some pasted text').order).toEqual([]);
    expect(parseSourcePages('   \n ').order).toEqual([]);
    expect(parseSourcePages(null).order).toEqual([]);
  });
  it('keeps blank pages as empty text', () => {
    const { pages, order } = parseSourcePages('--- Page 1 ---\na\n\n--- Page 2 ---\n\n\n--- Page 3 ---\nc');
    expect(order).toEqual([1, 2, 3]);
    expect(pages.get(2)).toBe('');
  });
  it('keeps repeated and lower-numbered marker lines as page text', () => {
    const { pages, order } = parseSourcePages(
      '--- Page 1 ---\nintro\n--- Page 1 ---\nquoted\n\n--- Page 2 ---\nb\n--- Page 1 ---\nagain',
    );
    expect(order).toEqual([1, 2]);
    expect(pages.get(1)).toBe('intro\n--- Page 1 ---\nquoted');
    expect(pages.get(2)).toBe('b\n--- Page 1 ---\nagain');
  });
  it('splits on a higher-numbered marker line (documented limitation)', () => {
    const { order } = parseSourcePages('--- Page 1 ---\na\n--- Page 7 ---\nfake');
    expect(order).toEqual([1, 7]);
  });
  it('handles CRLF line endings', () => {
    const { pages } = parseSourcePages('--- Page 1 ---\r\nfirst\r\n\r\n--- Page 2 ---\r\nsecond');
    expect(pages.get(1)).toBe('first');
    expect(pages.get(2)).toBe('second');
  });
});

describe('locatePassages', () => {
  const page = 'Intro line.\nThe  quick brown\nfox jumps over\u00a0the lazy dog. Done.';
  it('finds an exact passage and maps back to original offsets', () => {
    const [r] = locatePassages(page, [{ text: 'The quick brown fox', kind: 'passage' }]);
    expect(page.slice(r.start, r.end)).toBe('The  quick brown\nfox');
    expect(r.kind).toBe('passage');
  });
  it('treats differing whitespace as equal on both sides', () => {
    const [r] = locatePassages(page, [{ text: 'over the\nlazy', kind: 'passage' }]);
    expect(page.slice(r.start, r.end)).toBe('over\u00a0the lazy');
  });
  it('finds a passage containing U+001F and U+0085, and not one with U+FEFF swapped in', () => {
    const text = 'alpha\u001Fbeta\u0085gamma delta';
    expect(locatePassages(text, [{ text: 'alpha beta gamma', kind: 'passage' }])).toHaveLength(1);
    expect(locatePassages('alpha\uFEFFbeta', [{ text: 'alpha beta', kind: 'passage' }])).toHaveLength(0);
  });
  it('marks several chunks on one page and drops overlaps', () => {
    const r = locatePassages('aaa bbb ccc ddd eee', [
      { text: 'ddd eee', kind: 'passage' },
      { text: 'aaa bbb', kind: 'passage' },
      { text: 'bbb ccc', kind: 'passage' },
    ]);
    expect(r.map(x => [x.start, x.end])).toEqual([[0, 7], [12, 19]]);
  });
  it('returns nothing when the passage is not on the page, or is empty', () => {
    expect(locatePassages(page, [{ text: 'not here at all', kind: 'passage' }])).toEqual([]);
    expect(locatePassages(page, [{ text: '  ', kind: 'passage' }])).toEqual([]);
  });
  it('matches the saved 250-character excerpt as a prefix', () => {
    const chunk = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
    const r = locatePassages(`before ${chunk} after`, [{ text: chunk.slice(0, 250), kind: 'excerpt' }]);
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe('excerpt');
  });
  it('collapseWhitespace keeps an offset map', () => {
    const c = collapseWhitespace('a \n b');
    expect(c.text).toBe('a b');
    expect(c.map).toEqual([0, 1, 4]);
  });
});

describe('toParagraphs and pageLabel', () => {
  it('rebuilds PDF paragraphs, with line breaks as same-length spaces', () => {
    const text = 'one\ntwo\n\nthree\n \nfour';
    const paras = toParagraphs(text, 'pdf');
    expect(paras.map(p => p.text)).toEqual(['one two', 'three', 'four']);
    for (const p of paras) expect(text.slice(p.start, p.end).replace(/\n/g, ' ')).toBe(p.text);
  });
  it('shows a non-PDF virtual page as one block', () => {
    for (const type of ['pasted', 'txt', 'markdown', 'url'] as const) {
      expect(toParagraphs('a b c\n\nd', type)).toEqual([{ start: 0, end: 8, text: 'a b c\n\nd' }]);
    }
  });
  it('returns no paragraphs for an empty page', () => {
    expect(toParagraphs('  \n', 'pdf')).toEqual([]);
  });
  it('labels PDFs as pages and everything else as sections', () => {
    expect(pageLabel('pdf')).toEqual({ unit: 'Page' });
    for (const type of ['pasted', 'txt', 'markdown', 'url'] as const) {
      expect(pageLabel(type)).toEqual({ unit: 'Section', hint: 'about 350 words' });
    }
  });
});

describe('page cache', () => {
  beforeEach(() => clearSourceTextCache());
  const value = (n: number) => ({ pages: new Map([[1, String(n)]]), order: [1] });
  it('evicts the least recently used source beyond three', () => {
    setCachedPages('a:1', value(1)); setCachedPages('b:1', value(2)); setCachedPages('c:1', value(3));
    getCachedPages('a:1');
    setCachedPages('d:1', value(4));
    expect(getCachedPages('b:1')).toBeUndefined();
    expect(getCachedPages('a:1')).toBeDefined();
    expect(getCachedPages('d:1')).toBeDefined();
  });
  it('keys by version so a replaced source never serves old pages', () => {
    setCachedPages('a:1', value(1));
    expect(getCachedPages('a:2')).toBeUndefined();
  });
});
