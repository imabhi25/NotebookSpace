import { describe, expect, it } from 'vitest';
import { noteToText, safeNoteUrl, sanitizeNoteHtml, toEditorHtml } from './noteHtml';

describe('note html', () => {
  it('converts legacy plain/markdown text without showing raw symbols', () => {
    expect(toEditorHtml('# Title\n\n- a\n- b\n\nline1\nline2')).toBe('<h1>Title</h1><ul><li>a</li><li>b</li></ul><p>line1<br>line2</p>');
    expect(toEditorHtml('a < b')).toBe('<p>a &lt; b</p>');
  });
  it('sanitizes scripts, handlers and unsafe links', () => {
    const out = sanitizeNoteHtml('<p onclick="x()">hi<script>alert(1)</script><a href="javascript:alert(1)">l</a><a href="https://e.com">ok</a></p>');
    expect(out).not.toMatch(/script|onclick|javascript:/);
    expect(out).toContain('href="https://e.com"');
  });
  it('extracts plain text for snippets and search', () => {
    expect(noteToText('<h1>Heaps</h1><p>Min <strong>heap</strong></p>')).toBe('Heaps Min heap');
    expect(noteToText('plain text')).toBe('plain text');
  });
  it('strips iframes, objects, svg, event attributes and data:/javascript: URLs', () => {
    const out = sanitizeNoteHtml('<p onmouseover="x()" style="a:b">a<iframe src="//e"></iframe><object data="x"></object><svg onload="x()"></svg><a href="data:text/html,<script>1</script>">d</a><a href=" JaVaScRiPt:alert(1)">j</a></p>');
    expect(out).not.toMatch(/iframe|object|svg|onmouseover|onload|style=|javascript|data:/i);
  });
  it('accepts only http(s) and mailto links', () => {
    expect(safeNoteUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeNoteUrl('mailto:a@b.co')).toBe('mailto:a@b.co');
    expect(safeNoteUrl('javascript:alert(1)')).toBeNull();
    expect(safeNoteUrl('data:text/html,x')).toBeNull();
    expect(safeNoteUrl('not a url')).toBeNull();
  });
});
