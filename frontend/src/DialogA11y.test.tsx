import { render, screen, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { useModalFocus } from './useModalFocus';

const TestModalDialog: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const modalRef = useModalFocus(isOpen, () => setIsOpen(false));

  return (
    <div>
      <button type="button" data-testid="open-btn" onClick={() => setIsOpen(true)}>
        Open Dialog
      </button>
      {isOpen && (
        <div data-testid="backdrop">
          <div ref={modalRef} role="dialog" data-testid="modal-content">
            <input data-testid="first-input" />
            <textarea data-testid="second-input" />
            <button type="button" data-testid="close-btn" onClick={() => setIsOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

describe('useModalFocus accessibility hook', () => {
  it('returns focus to the opener button when modal is closed', () => {
    render(<TestModalDialog />);
    const openBtn = screen.getByTestId('open-btn');
    openBtn.focus();
    expect(document.activeElement).toBe(openBtn);

    fireEvent.click(openBtn);
    expect(screen.getByTestId('modal-content')).toBeTruthy();

    const closeBtn = screen.getByTestId('close-btn');
    fireEvent.click(closeBtn);

    expect(screen.queryByTestId('modal-content')).toBeNull();
    expect(document.activeElement).toBe(openBtn);
  });

  it('traps Tab navigation within the modal content', () => {
    render(<TestModalDialog />);
    const openBtn = screen.getByTestId('open-btn');
    fireEvent.click(openBtn);

    const firstInput = screen.getByTestId('first-input');
    const closeBtn = screen.getByTestId('close-btn');

    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);

    // Pressing Tab on the last element wraps to the first
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(firstInput);

    // Pressing Shift+Tab on the first element wraps to the last
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(closeBtn);
  });
});
