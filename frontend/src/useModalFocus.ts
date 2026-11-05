import { useEffect, useRef } from 'react';

/**
 * Hook to manage modal accessibility:
 * 1. Remembers the opener element when modal opens.
 * 2. Restores focus to the opener element when modal closes/unmounts.
 * 3. Traps Tab navigation inside modalRef when modal is open.
 * 4. Handles Escape key to close the modal.
 */
export function useModalFocus(isOpen: boolean, onClose?: () => void) {
  const modalRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (openerRef.current && typeof openerRef.current.focus === 'function') {
        openerRef.current.focus();
        openerRef.current = null;
      }
      return;
    }

    // Capture element that had focus right before modal opened
    openerRef.current = (document.activeElement as HTMLElement) || null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onClose) {
          e.preventDefault();
          onClose();
        }
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (openerRef.current && typeof openerRef.current.focus === 'function') {
        openerRef.current.focus();
        openerRef.current = null;
      }
    };
  }, [isOpen, onClose]);

  return modalRef;
}
