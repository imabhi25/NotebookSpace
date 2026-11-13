// Parsing for bracketed inline citations: [file.pdf p. 1], [file.pdf p. 1, 2], [file.pdf pp. 1-2], [file.pdf p.1, p.2].

/** Matches one bracketed citation; group 1 is the file or title, group 2 the raw page list. */
export const CITATION_PATTERN =
  '\\[\\s*([^\\[\\]\\r\\n]+?)(?:\\s*,\\s*|\\s+)(?:pp?\\.?|pages?\\.?)\\s*(\\d+(?:\\s*(?:[-–]|,|&|and)\\s*(?:pp?\\.?\\s*)?\\d+)*)\\s*\\]';

export const createCitationRegex = (): RegExp => new RegExp(CITATION_PATTERN, 'giu');

/** Expands "1, 2", "1-3", "1 & 2" and "1, p.2" into [1, 2], [1, 2, 3], ... (de-duplicated, capped). */
export function parsePageList(raw: string): number[] {
  const pages: number[] = [];
  const add = (n: number) => { if (n > 0 && !pages.includes(n) && pages.length < 24) pages.push(n); };
  const cleaned = raw.replace(/pp?\.?/gi, ' ').replace(/\band\b|&/gi, ',');
  for (const part of cleaned.split(',')) {
    const range = part.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (range) {
      const from = parseInt(range[1], 10);
      const to = parseInt(range[2], 10);
      if (to >= from && to - from < 24) for (let n = from; n <= to; n += 1) add(n);
      else { add(from); add(to); }
      continue;
    }
    const single = part.match(/\d+/);
    if (single) add(parseInt(single[0], 10));
  }
  return pages;
}

/** Whitespace between a citation and the punctuation that follows it ("[1] .") is dropped. */
export function trailingPunctuationGap(rest: string): number {
  const m = rest.match(/^\s+(?=[.,;:!?](?:\s|$))/);
  return m ? m[0].length : 0;
}

/**
 * Removes every bracketed citation marker from visible answer text. Whitespace around a marker collapses so
 * "algorithm [1] ." reads "algorithm." and "a [1] b" reads "a b".
 */
export function stripCitationMarkers(text: string): string {
  const re = new RegExp(`[ \\t]*(?:${CITATION_PATTERN}[ \\t]*)+`, 'giu');
  // A marker still streaming in ("[file.pdf p.1" with no closing bracket) is hidden too.
  const withoutPartial = text.replace(/[ \t]*\[[^\[\]\r\n]*\.\w{2,5}(?:\s*,?\s*(?:pp?\.?|pages?\.?)?\s*[\d,\s&–-]*)?$/i, '');
  return withoutPartial.replace(re, (m: string, ...args: unknown[]) => {
    const offset = args[args.length - 2] as number;
    const whole = args[args.length - 1] as string;
    const before = offset === 0 || whole[offset - 1] === '\n';
    const next = whole[offset + m.length];
    const after = next === undefined || /[\s.,;:!?)\]]/.test(next);
    return before || after ? '' : ' ';
  });
}
