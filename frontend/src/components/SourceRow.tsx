import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Source } from '../types';

interface SourceRowProps {
  source: Source;
  isSelected: boolean;
  onToggle: () => void;
  onView: () => void;
  onRename: () => void;
  onRetry: () => void;
  onReplace: () => void;
  onRemove: () => void;
}

const TYPE_INFO: Record<string, { label: string; icon: 'doc' | 'link' | 'text' }> = {
  pdf: { label: 'PDF', icon: 'doc' },
  url: { label: 'Web page', icon: 'link' },
  pasted: { label: 'Pasted text', icon: 'text' },
  markdown: { label: 'Markdown', icon: 'text' },
  txt: { label: 'Text', icon: 'text' },
};

// A small line icon per kind of source; the colour is the muted ink, never a badge.
const TypeIcon: React.FC<{ kind: 'doc' | 'link' | 'text' }> = ({ kind }) => (
  <svg className="source-type-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'link' ? (
      <>
        <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
        <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
      </>
    ) : (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <polyline points="14 3 14 8 19 8" />
        {kind === 'text' && (
          <>
            <line x1="9" y1="13" x2="15" y2="13" />
            <line x1="9" y1="17" x2="13" y2="17" />
          </>
        )}
      </>
    )}
  </svg>
);

// One slim list row: type badge, name, a quiet meta line, then a "more" menu and the selection checkbox.
export const SourceRow: React.FC<SourceRowProps> = ({
  source: s,
  isSelected,
  onToggle,
  onView,
  onRename,
  onRetry,
  onReplace,
  onRemove,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLLIElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const type = (s.source_type || 'doc').toLowerCase();
  const info = TYPE_INFO[type] || { label: s.source_type || 'Document', icon: 'doc' as const };
  const sizeLabel = type === 'pdf' || !s.word_count
    ? `${s.page_count} ${s.page_count === 1 ? 'page' : 'pages'}`
    : `${s.word_count.toLocaleString()} words`;
  const isReady = s.status === 'ready';
  const canRetry = s.status === 'failed' && (type === 'url' || type === 'pasted');

  const closeMenu = (restoreFocus: boolean) => {
    setIsMenuOpen(false);
    setMenuPosition(null);
    if (restoreFocus) buttonRef.current?.focus();
  };

  // The list scrolls and the panel clips, so the menu is rendered on the body, placed against the viewport,
  // and flipped up when it would run off the bottom.
  useLayoutEffect(() => {
    if (!isMenuOpen || !buttonRef.current || !menuRef.current) return;
    const anchor = buttonRef.current.getBoundingClientRect();
    // Layout size, not the painted box: the menu is still scaling in when this runs.
    const menu = { width: menuRef.current.offsetWidth, height: menuRef.current.offsetHeight };
    const gap = 4;
    const fitsBelow = anchor.bottom + gap + menu.height <= window.innerHeight - gap;
    setMenuPosition({
      top: fitsBelow ? anchor.bottom + gap : Math.max(gap, anchor.top - gap - menu.height),
      left: Math.max(gap, Math.min(anchor.right - menu.width, window.innerWidth - menu.width - gap)),
    });
  }, [isMenuOpen]);

  // Focus moves into the menu once it is placed and visible.
  useEffect(() => {
    if (isMenuOpen && menuPosition) (menuRef.current?.querySelector('[role="menuitem"]') as HTMLElement | null)?.focus();
  }, [isMenuOpen, menuPosition]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) closeMenu(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeMenu(true);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || []);
        if (items.length === 0) return;
        e.preventDefault();
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
        items[next].focus();
      } else if (e.key === 'Tab') {
        closeMenu(false);
      }
    };
    const handleScroll = () => closeMenu(false);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', handleScroll);
    const scroller = rootRef.current?.closest('.sources-list-scroll');
    scroller?.addEventListener('scroll', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', handleScroll);
      scroller?.removeEventListener('scroll', handleScroll);
    };
  }, [isMenuOpen]);

  const run = (action: () => void) => () => {
    closeMenu(false);
    action();
  };

  return (
    <li
      ref={rootRef}
      className={`source-row ${isSelected ? 'selected' : ''} ${isMenuOpen ? 'menu-open' : ''} source-row-${s.status}`}
    >
      <input
        type="checkbox"
        className="source-row-checkbox"
        checked={isSelected}
        disabled={!isReady}
        onChange={onToggle}
        aria-label={`Select ${s.title}`}
        data-testid={`source-checkbox-${s.id}`}
      />

      <TypeIcon kind={info.icon} />

      <div
        className="source-row-main"
        onClick={() => isReady && onToggle()}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && isReady && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onToggle();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <span className="source-row-title" title={`${s.title} · ${info.label}${isReady ? ` · ${sizeLabel}` : ''}`}>
          {s.title}
        </span>
        {isReady && (
          <span className="source-row-meta">
            <span className="meta-type">{info.label}</span>
            <span className="meta-size">{sizeLabel}</span>
          </span>
        )}
        {s.status === 'processing' && <span className="source-row-status is-processing">Processing…</span>}
        {s.status === 'failed' && (
          <span className="source-row-status is-failed" title={s.error_message || ''}>
            Failed
          </span>
        )}
      </div>

      <button
        type="button"
        ref={buttonRef}
        className="source-row-more"
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        aria-label={`Options for ${s.title}`}
        title="More options"
        onClick={() => setIsMenuOpen((open) => !open)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>

      {isMenuOpen && createPortal(
        <div
          ref={menuRef}
          className="notebook-overflow-menu source-row-menu"
          role="menu"
          aria-label={`Options for ${s.title}`}
          style={menuPosition ? { top: menuPosition.top, left: menuPosition.left } : { visibility: 'hidden' }}
        >
          <button type="button" className="notebook-menu-item" role="menuitem" onClick={run(onView)}>
            View
          </button>
          <button type="button" className="notebook-menu-item" role="menuitem" onClick={run(onRename)}>
            Rename
          </button>
          {canRetry ? (
            <button type="button" className="notebook-menu-item" role="menuitem" onClick={run(onRetry)}>
              Retry
            </button>
          ) : (
            <button type="button" className="notebook-menu-item" role="menuitem" onClick={run(onReplace)}>
              Replace
            </button>
          )}
          <button type="button" className="notebook-menu-item menu-item-danger" role="menuitem" onClick={run(onRemove)}>
            Remove
          </button>
        </div>,
        document.body
      )}
    </li>
  );
};
