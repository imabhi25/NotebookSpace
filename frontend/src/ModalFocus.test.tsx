import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useModalFocus } from './useModalFocus';

const Dialog: React.FC<{ label: string; onClose: () => void; children: React.ReactNode }> = ({ label, onClose, children }) => {
  const ref = useModalFocus<HTMLDivElement>(true, onClose);
  return <div ref={ref} role="dialog" aria-label={label}>{children}</div>;
};

const Nested: React.FC = () => {
  const [outer, setOuter] = useState(false);
  const [inner, setInner] = useState(false);
  return (
    <div>
      <button onClick={() => setOuter(true)}>open outer</button>
      <main data-focus-fallback tabIndex={-1}>main</main>
      {outer && (
        <Dialog label="Outer" onClose={() => setOuter(false)}>
          <button onClick={() => setInner(true)}>open inner</button>
          <button>outer last</button>
        </Dialog>
      )}
      {inner && (
        <Dialog label="Inner" onClose={() => setInner(false)}>
          <input aria-label="inner field" autoFocus />
          <button>inner last</button>
        </Dialog>
      )}
    </div>
  );
};

describe('useModalFocus with nested dialogs', () => {
  it('keeps React autoFocus inside the dialog', () => {
    render(<Nested />);
    fireEvent.click(screen.getByText('open outer'));
    fireEvent.click(screen.getByText('open inner'));
    expect(document.activeElement).toBe(screen.getByLabelText('inner field'));
  });

  it('Escape closes only the topmost dialog and returns focus to its opener', () => {
    render(<Nested />);
    const opener = screen.getByText('open outer');
    opener.focus();
    fireEvent.click(opener);
    const innerOpener = screen.getByText('open inner');
    innerOpener.focus();
    fireEvent.click(innerOpener);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Inner' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeTruthy();
    expect(document.activeElement).toBe(innerOpener);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Outer' })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('only the topmost dialog traps Tab', () => {
    render(<Nested />);
    fireEvent.click(screen.getByText('open outer'));
    fireEvent.click(screen.getByText('open inner'));
    const last = screen.getByText('inner last');
    last.focus();
    const prevented = !fireEvent.keyDown(last, { key: 'Tab' });
    expect(prevented).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText('inner field'));
  });

  it('falls back to the marked landmark when the opener is gone', () => {
    const Gone: React.FC = () => {
      const [open, setOpen] = useState(false);
      const [showOpener, setShowOpener] = useState(true);
      return (
        <div>
          <main data-focus-fallback tabIndex={-1}>main</main>
          {showOpener && <button onClick={() => setOpen(true)}>opener</button>}
          {open && (
            <Dialog label="Gone" onClose={() => setOpen(false)}>
              <button onClick={() => setShowOpener(false)}>remove opener</button>
            </Dialog>
          )}
        </div>
      );
    };
    render(<Gone />);
    const opener = screen.getByText('opener');
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByText('remove opener'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByText('main'));
  });

  it('keeps autoFocus when effects run twice (dev StrictMode)', () => {
    const Host: React.FC = () => {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button onClick={() => setOpen(true)}>opener</button>
          {open && (
            <Dialog label="Strict" onClose={() => setOpen(false)}>
              <button>close</button>
              <input aria-label="title" autoFocus />
            </Dialog>
          )}
        </div>
      );
    };
    render(<React.StrictMode><Host /></React.StrictMode>);
    const opener = screen.getByText('opener');
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByLabelText('title'));
  });
});
