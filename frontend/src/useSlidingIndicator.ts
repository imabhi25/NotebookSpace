import { RefObject, useLayoutEffect } from 'react';

/**
 * Measures the active child of a tab group and publishes its position as --ind-x / --ind-w,
 * which the `.sliding-tabs::before` pill animates to. `data-ind-ready` is set after the first
 * measurement so the pill does not slide in from the left on mount.
 */
export function useSlidingIndicator(ref: RefObject<HTMLElement>, activeKey: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const active = el.querySelector<HTMLElement>('.active, [aria-selected="true"]');
      if (!active) return;
      el.style.setProperty('--ind-x', `${active.offsetLeft}px`);
      el.style.setProperty('--ind-w', `${active.offsetWidth}px`);
      if (!el.hasAttribute('data-ind-ready')) requestAnimationFrame(() => el.setAttribute('data-ind-ready', ''));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, activeKey]);
}
