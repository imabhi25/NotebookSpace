import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open dialogs, oldest first. Only the topmost one reacts to Escape and Tab. */
const dialogStack: object[] = [];

/** Visible and not hidden/inert (computed style works without layout, unlike offsetParent). */
const isRendered = (n: HTMLElement) => {
  if (n.closest('[hidden], [inert]')) return false;
  const cs = getComputedStyle(n);
  return cs.display !== 'none' && cs.visibility !== 'hidden';
};

/** Where focus goes when the element that opened a dialog is gone. */
const FALLBACK_SELECTOR = '[data-focus-fallback]';

/**
 * Hook to manage modal and drawer accessibility:
 * 1. Remembers the opener element (read during render, before any child autoFocus can move focus).
 * 2. Moves focus into the dialog unless something inside already has it (e.g. autoFocus),
 *    including after React StrictMode's development-only effect re-run.
 * 3. Traps Tab inside the dialog and closes it on Escape, but only for the topmost open dialog,
 *    so a modal opened from a drawer does not fight the drawer.
 * 4. Restores focus to the opener on close, or to a `[data-focus-fallback]` landmark if the
 *    opener no longer exists.
 * Pass `externalRef` to reuse an element ref the component already owns.
 */
export function useModalFocus<T extends HTMLElement = HTMLDivElement>(
  isOpen: boolean,
  onClose?: () => void,
  externalRef?: React.RefObject<T>
) {
  const ownRef = useRef<T>(null);
  const modalRef = externalRef ?? ownRef;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const prevOpen = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const initialFocusRef = useRef<HTMLElement | null>(null);
  if (isOpen && !prevOpen.current && typeof document !== 'undefined') {
    openerRef.current = document.activeElement as HTMLElement | null;
  }
  prevOpen.current = isOpen;

  useEffect(() => {
    if (!isOpen) {
      initialFocusRef.current = null;
      return;
    }
    const node = modalRef.current;
    const token = {};
    dialogStack.push(token);

    if (node) {
      if (node.contains(document.activeElement)) {
        initialFocusRef.current = document.activeElement as HTMLElement;
      } else {
        // After a StrictMode re-run, focus was handed back to the opener; restore the initial target.
        const remembered = initialFocusRef.current;
        const first =
          remembered && node.contains(remembered) && remembered.isConnected
            ? remembered
            : node.querySelector<HTMLElement>('[data-autofocus]') || node.querySelector<HTMLElement>(FOCUSABLE);
        const target = first || node;
        target.focus();
        initialFocusRef.current = target;
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const el = modalRef.current;
      if (!el) return;
      if (dialogStack[dialogStack.length - 1] !== token) return; // a dialog above this one owns the keys

      if (e.key === 'Escape') {
        if (onCloseRef.current) {
          e.preventDefault();
          e.stopPropagation();
          onCloseRef.current();
        }
        return;
      }

      if (e.key === 'Tab') {
        const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isRendered);
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        // The container itself (tabIndex -1) counts as "inside" but is not in the tab list.
        const insideList = active ? focusable.includes(active) : false;

        if (!el.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && (active === first || !insideList)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      const at = dialogStack.indexOf(token);
      if (at !== -1) dialogStack.splice(at, 1);
      // If the close handler already moved focus somewhere outside the dialog, respect that.
      const active = document.activeElement;
      const movedByCaller = Boolean(active && active !== document.body && !(node && node.contains(active)));
      if (movedByCaller) return;
      const previous = openerRef.current;
      if (previous && previous !== document.body && previous.isConnected && typeof previous.focus === 'function') {
        previous.focus();
      } else if (!document.activeElement || document.activeElement === document.body) {
        // Focus would otherwise be lost; skip if the caller already moved it somewhere sensible.
        document.querySelector<HTMLElement>(FALLBACK_SELECTOR)?.focus();
      }
    };
  }, [isOpen, modalRef]);

  return modalRef;
}
