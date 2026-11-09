import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { READER_NAV_ROOM_MIN_WIDTH } from './viewport';

// The nav-room breakpoint is a number derived from CSS. This reads the stylesheet and recomputes it,
// so a changed width, padding or reader size fails here instead of silently crushing the conversation.
const full = readFileSync(resolve(__dirname, 'workspace-layout.css'), 'utf8');
// Wide-desktop values live in the "Layout 2" block; the media queries after it only narrow them.
const start = full.indexOf('Layout 2: native Framer dimensions');
const end = full.indexOf('/* Sources rail density */');
const css = full.slice(start, end);

/** The wide-desktop declaration matched by `pattern`. */
function lastPx(pattern: RegExp, label: string): number {
  expect(start, 'the "Layout 2" block marker moved in workspace-layout.css').toBeGreaterThan(-1);
  const all = [...css.matchAll(pattern)];
  expect(all.length, `could not find ${label} in the Layout 2 block of workspace-layout.css`).toBeGreaterThan(0);
  return Number(all[all.length - 1][1]);
}

describe('reader layout constants', () => {
  // Wide-desktop values: the final `--nav-w: 320px` block (the 1280px query only narrows it below that).
  const navW = lastPx(/--nav-w:\s*(\d+)px;/g, '--nav-w');
  const navSlotExtra = lastPx(/\.workspace-layout \.nav-slot \{ width: calc\(var\(--nav-w\) \+ (\d+)px\); \}/g, 'nav slot width');
  const ctxSlotExtra = lastPx(/\.workspace-layout \.context-slot \{ width: calc\(var\(--ctx-w\) \+ (\d+)px\); \}/g, 'context slot width');
  const bodySide = lastPx(/\.workspace-layout \.workspace-body \{ padding: \d+px (\d+)px \d+px; \}/g, 'workspace body padding');
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
