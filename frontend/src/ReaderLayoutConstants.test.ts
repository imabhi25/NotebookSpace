import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { READER_NAV_ROOM_MIN_WIDTH } from './viewport';

// The nav-room breakpoint is a number derived from CSS. This reads the stylesheet and recomputes it,
// so a changed width, padding or reader size fails here instead of silently crushing the conversation.
const full = readFileSync(resolve(__dirname, 'workspace-layout.css'), 'utf8');
// Slot sizes and body padding are set in the "Layout 2" block; media queries after it only narrow them,
// so the first match after the marker is the wide-desktop value.
const start = full.indexOf('Layout 2: native Framer dimensions');
const wide = full.slice(start);

function firstPx(pattern: RegExp, label: string): number {
  expect(start, 'the "Layout 2" block marker moved in workspace-layout.css').toBeGreaterThan(-1);
  const m = wide.match(pattern);
  expect(m, `could not find ${label} after the "Layout 2" marker in workspace-layout.css`).not.toBeNull();
  return Number(m![1]);
}
function lastPx(pattern: RegExp, label: string): number {
  const all = [...full.matchAll(pattern)];
  expect(all.length, `could not find ${label} in workspace-layout.css`).toBeGreaterThan(0);
  return Number(all[all.length - 1][1]);
}

describe('reader layout constants', () => {
  // --nav-w is the last plain pixel declaration; the clamp() ones in narrower queries do not match.
  const navW = lastPx(/--nav-w:\s*(\d+)px;/g, '--nav-w');
  const navSlotExtra = firstPx(/\.workspace-layout \.nav-slot \{ width: calc\(var\(--nav-w\) \+ (\d+)px\); \}/, 'nav slot width');
  const ctxSlotExtra = firstPx(/\.workspace-layout \.context-slot \{ width: calc\(var\(--ctx-w\) \+ (\d+)px\); \}/, 'context slot width');
  const bodySide = firstPx(/\.workspace-layout \.workspace-body \{ padding: \d+px (\d+)px \d+px; \}/, 'workspace body padding');
  const readerMatch = [...full.matchAll(/--reader-w:\s*clamp\(\d+px,\s*\d+vw,\s*(\d+)px\);/g)];
  const readerMax = Number(readerMatch[readerMatch.length - 1]?.[1]);

  it('keeps the nav-room breakpoint equal to the layout it is derived from', () => {
    const conversationMin = 560;
    const derived = conversationMin + 2 * bodySide + (navW + navSlotExtra) + (readerMax + ctxSlotExtra);
    expect(
      READER_NAV_ROOM_MIN_WIDTH,
      `READER_NAV_ROOM_MIN_WIDTH should be ${derived} (560 + 2x${bodySide} body padding + nav ${navW}+${navSlotExtra} + reader ${readerMax}+${ctxSlotExtra}); update viewport.ts`,
    ).toBe(derived);
  });

  it('expands the reader by overriding --ctx-w, which the panel and its slot both read', () => {
    expect(readerMatch.length, 'could not find --reader-w').toBeGreaterThan(0);
    expect(full).toMatch(/\[data-reader="expanded"\] \{ --ctx-w: var\(--reader-w\); \}/);
  });
});
