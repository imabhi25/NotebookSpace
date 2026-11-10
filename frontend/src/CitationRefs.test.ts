import { describe, expect, it } from 'vitest';
import { createCitationRegex, parsePageList, trailingPunctuationGap } from './citationRefs';
import { autoCleanTitle, cleanFileTitle } from './sourceTitles';

const parse = (t: string) => { const m = createCitationRegex().exec(t); return m ? { file: m[1].trim(), pages: parsePageList(m[2]) } : null; };

describe('citation refs', () => {
  it('parses single, list, range and repeated-p forms', () => {
    expect(parse('[QUESTIONS_v1.pdf p. 1, 2]')).toEqual({ file: 'QUESTIONS_v1.pdf', pages: [1, 2] });
    expect(parse('[a.pdf pp. 1-3]')).toEqual({ file: 'a.pdf', pages: [1, 2, 3] });
    expect(parse('[a.pdf p.1, p.2]')).toEqual({ file: 'a.pdf', pages: [1, 2] });
    expect(parse('[Syllabus p.4]')).toEqual({ file: 'Syllabus', pages: [4] });
    expect(parse('[a.pdf, p. 5]')).toEqual({ file: 'a.pdf', pages: [5] });
  });
  it('drops the gap before trailing punctuation', () => {
    expect(trailingPunctuationGap(' . Next')).toBe(1);
    expect(trailingPunctuationGap(' next')).toBe(0);
  });
});

describe('source titles', () => {
  it('cleans filenames', () => {
    expect(cleanFileTitle('QUESTIONS_v1.pdf')).toBe('Questions (v1)');
    expect(cleanFileTitle('announcement_week4.md')).toBe('Week 4 Announcement');
    expect(cleanFileTitle('Intro to Algorithms')).toBe('Intro to Algorithms');
  });
  it('prefers a heading from the text', () => {
    expect(autoCleanTitle({ title: 'x.md', file_name: 'x.md', raw_content: '# Heap Basics\nbody' })).toBe('Heap Basics');
  });
});
