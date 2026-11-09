import { useCallback, useEffect, useState } from 'react';

/** Reactive matchMedia. `fallback` is used where matchMedia does not exist (tests/SSR). */
export function useMediaQuery(query: string, fallback = false): boolean {
  const get = () =>
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? fallback
      : window.matchMedia(query).matches;
  const [matches, setMatches] = useState<boolean>(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [query]);
  return matches;
}

/**
 * Publishes how much of the layout viewport the on-screen keyboard covers as --kb-inset (px)
 * and sets data-keyboard="open" on <html>. Uses the Visual Viewport API; where the browser
 * already resizes the layout viewport (innerHeight shrinks with the keyboard) the inset is 0,
 * so the keyboard is never counted twice. Without the API the inset stays 0 and dvh handles it.
 */
export function useKeyboardInset(): void {
  const update = useCallback(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    if (!vv) {
      root.style.setProperty('--kb-inset', '0px');
      root.removeAttribute('data-keyboard');
      return;
    }
    const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    // Ignore small differences (browser chrome collapsing) so only a real keyboard counts.
    const effective = inset > 120 ? inset : 0;
    root.style.setProperty('--kb-inset', `${effective}px`);
    if (effective > 0) root.setAttribute('data-keyboard', 'open');
    else root.removeAttribute('data-keyboard');
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [update]);
}

/**
 * Viewport width at and above which the navigation stays open beside an expanded reader and the
 * conversation still keeps 560px. Derived from workspace-layout.css:
 * 560 conversation + 48 body padding + navigation slot (320 + 24) + reader slot (600 + 24).
 * ReaderLayoutConstants.test.ts recomputes it from the CSS and fails if this drifts.
 */
export const READER_NAV_ROOM_MIN_WIDTH = 1576;
