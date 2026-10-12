import React, { useEffect, useRef, useState } from 'react';

export interface SortMenuOption<T extends string> {
  value: T;
  label: string;
}

interface SortMenuProps<T extends string> {
  value: T;
  options: SortMenuOption<T>[];
  onChange: (value: T) => void;
  label: string;
}

// Listbox that replaces the native select so the open menu can match the rest of the interface.
export function SortMenu<T extends string>({ value, options, onChange, label }: SortMenuProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    listRef.current?.focus();
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  const open = () => {
    setActiveIndex(selectedIndex);
    setIsOpen(true);
  };

  const close = (restoreFocus: boolean) => {
    setIsOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  };

  const choose = (index: number) => {
    onChange(options[index].value);
    close(true);
  };

  const handleButtonKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open();
    }
  };

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(activeIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  return (
    <div className="sort-menu" ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        className={`sort-menu-trigger ${isOpen ? 'is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label}
        onClick={() => (isOpen ? close(false) : open())}
        onKeyDown={handleButtonKeyDown}
      >
        <span>{options[selectedIndex].label}</span>
        <svg className="sort-menu-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <ul
          className="sort-menu-list"
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          ref={listRef}
          aria-activedescendant={`sort-option-${options[activeIndex].value}`}
          onKeyDown={handleListKeyDown}
        >
          {options.map((o, index) => (
            <li
              key={o.value}
              id={`sort-option-${o.value}`}
              role="option"
              aria-selected={o.value === value}
              className={`sort-menu-option ${index === activeIndex ? 'is-active' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
            >
              <span>{o.label}</span>
              {o.value === value && (
                <svg className="sort-menu-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
