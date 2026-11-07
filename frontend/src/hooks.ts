import { useCallback, useEffect, useRef, useState } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

/** Open dialogs, oldest first. Only the topmost one reacts to Escape/Tab. */
const dialogStack: object[] = [];

/** Where focus goes when the element that opened a dialog is gone. */
const FALLBACK_SELECTOR = '[data-focus-fallback]';

/**
 * Modal behaviour for a dialog/drawer element: moves focus in when `open`, keeps Tab inside,
 * closes on Escape, and returns focus to whatever had it before opening.
 */
export function useDialog<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Record the opener during render (before any child autoFocus can move focus).
  const prevOpen = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);
  // Element that held focus inside the dialog when it first opened (e.g. via autoFocus).
  const initialFocusRef = useRef<HTMLElement | null>(null);
  if (open && !prevOpen.current && typeof document !== 'undefined') {
    openerRef.current = document.activeElement as HTMLElement | null;
  }
  prevOpen.current = open;

  useEffect(() => {
    if (!open) {
      initialFocusRef.current = null;
      return;
    }
    const node = ref.current;
    const token = {};
    dialogStack.push(token);
    // Keep focus where React's autoFocus (or the content) already put it inside the dialog.
    if (node) {
      if (node.contains(document.activeElement)) {
        initialFocusRef.current = document.activeElement as HTMLElement;
      } else {
        // After a StrictMode re-run, focus was handed back to the opener; restore the initial target.
        const remembered = initialFocusRef.current;
        const first = remembered && node.contains(remembered) && remembered.isConnected
          ? remembered
          : node.querySelector<HTMLElement>('[data-autofocus]') || node.querySelector<HTMLElement>(FOCUSABLE);
        const target = first || node;
        target.focus();
        initialFocusRef.current = target;
      }
    }
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current;
      if (!el) return;
      if (dialogStack[dialogStack.length - 1] !== token) return; // a dialog above this one owns the keys
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement
      );
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const firstN = nodes[0];
      const lastN = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!el.contains(active)) {
        e.preventDefault();
        firstN.focus();
      } else if (e.shiftKey && active === firstN) {
        e.preventDefault();
        lastN.focus();
      } else if (!e.shiftKey && active === lastN) {
        e.preventDefault();
        firstN.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const at = dialogStack.indexOf(token);
      if (at !== -1) dialogStack.splice(at, 1);
      const previous = openerRef.current;
      if (previous && previous !== document.body && previous.isConnected) {
        previous.focus();
      } else {
        document.querySelector<HTMLElement>(FALLBACK_SELECTOR)?.focus();
      }
    };
  }, [open]);

  return ref;
}

/**
 * Publishes how much of the layout viewport the on-screen keyboard covers as --kb-inset (px)
 * and sets data-keyboard="open" on <html>. Uses the Visual Viewport API; where it is missing
 * the inset stays 0 and dvh units handle resizing.
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
