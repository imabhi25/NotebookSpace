import React from 'react';
import { useDialog } from '../hooks';

interface ModalShellProps {
  onClose: () => void;
  /** Size modifier class, e.g. "modal-content-md". */
  size?: string;
  /** Accessible name of the dialog. */
  label: string;
  children: React.ReactNode;
}

/** Backdrop + dialog container with focus trap, Escape, and focus return. */
export const ModalShell: React.FC<ModalShellProps> = ({ onClose, size = '', label, children }) => {
  const ref = useDialog<HTMLDivElement>(true, onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className={`modal-content ${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};
