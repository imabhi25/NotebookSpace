import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Source } from '../types';

interface SourceRowProps {
  source: Source;
  /** Title shown in the list (auto-cleaned when enabled); the stored title is untouched. */
  displayTitle?: string;
  isSelected: boolean;
  onToggle: () => void;
  onView: () => void;
  /** Opens the source in the study panel's reader, on its first page. */
  onRead?: () => void;
  onRename: () => void;
  onRetry: () => void;
  onReplace: () => void;
  onRemove: () => void;
}

export const TYPE_INFO: Record<string, { badge: string; label: string }> = {
  pdf: { badge: 'PDF', label: 'PDF' },
  url: { badge: 'WEB', label: 'Web page' },
  pasted: { badge: 'TXT', label: 'Pasted text' },
  markdown: { badge: 'MD', label: 'Markdown' },
  txt: { badge: 'TXT', label: 'Text' },
};

export const BADGE_COLORS: Record<string, string> = { pdf: '#EF4444', markdown: '#3B82F6', txt: '#3B82F6', pasted: '#3B82F6' };

// Document glyph: custom Red icon for PDFs, Blue for Markdown/Text
export const SourceTypeIcon: React.FC<{ type: string; badge: string }> = ({ type, badge }) => {
  const isPdf = type === 'pdf';
  const strokeColor = isPdf ? '#EF4444' : '#3B82F6';
  const fillColor = isPdf ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)';
  const badgeFill = isPdf ? '#EF4444' : '#3B82F6';

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 2.5h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1Z" stroke={strokeColor} strokeWidth="1.5" strokeLinejoin="round" fill={fillColor} />
      <path d="M14 2.5V7a1 1 0 0 0 1 1h4" stroke={strokeColor} strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="2" y="13" width="20" height="7.5" rx="2" fill={badgeFill} />
      <text x="12" y="18.8" textAnchor="middle" fontSize="6.2" fontWeight="700" fill="#fff" fontFamily="Inter, system-ui, sans-serif" letterSpacing="0.2">{badge}</text>
    </svg>
  );
};

// One slim list row: type badge, name, a quiet meta line, then a "more" menu and the selection checkbox.
export const SourceRow: React.FC<SourceRowProps> = ({
  source: s,
  displayTitle,
  isSelected,
  onToggle,
  onView,
  onRead,
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
  const info = TYPE_INFO[type] || { badge: 'DOC', label: s.source_type || 'Document' };
  const isReady = s.status === 'ready';
  const isFailed = s.status === 'failed';
  const shownTitle = displayTitle ?? s.title;

  const handleRetryClick = () => {
    if (type === 'url' || type === 'pasted') {
      onRetry();
    } else {
      onReplace();
    }
  };

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

  // Focus goes back to the menu button first, so a dialog the action opens remembers a control that outlives the menu.
  const run = (action: () => void) => () => {
    closeMenu(true);
    action();
  };

  return (
    <li
      ref={rootRef}
      className={`source-row ${isSelected ? 'selected' : ''} ${isMenuOpen ? 'menu-open' : ''} source-row-${s.status}`}
    >
      <span className={`source-type-badge type-${type}`} aria-hidden="true">
        <SourceTypeIcon type={type} badge={info.badge} />
      </span>

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
        <span className="source-row-title" title={`${shownTitle} · ${info.label}${isReady ? ` · ${s.page_count} ${s.page_count === 1 ? 'page' : 'pages'}` : s.status === 'failed' ? ` · ${s.error_message || 'Failed'}` : ''}`}>
          {shownTitle}
        </span>
        <span className="sr-only">
          {info.label}{isReady ? `, ${s.page_count} ${s.page_count === 1 ? 'page' : 'pages'}, ready` : s.status === 'failed' ? `, failed: ${s.error_message || 'failed'}` : ''}
        </span>
        {s.status === 'processing' && <span className="source-row-status status-processing">Processing...</span>}
        {s.status === 'failed' && (
          <span className="source-row-status status-failed" title={s.error_message || 'Failed'}>
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
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>

      <input
        type="checkbox"
        className="source-row-checkbox"
        checked={isSelected}
        disabled={!isReady}
        onChange={onToggle}
        aria-label={`Select ${s.title}`}
        data-testid={`source-checkbox-${s.id}`}
      />

      {isMenuOpen && createPortal(
        <div
          ref={menuRef}
          className="notebook-overflow-menu source-row-menu"
          role="menu"
          aria-label={`Options for ${s.title}`}
          style={menuPosition ? { top: menuPosition.top, left: menuPosition.left } : { visibility: 'hidden' }}
        >
          {isFailed ? (
            <>
              <button type="button" className="notebook-menu-item" role="menuitem" onClick={run(handleRetryClick)}>
                Retry
              </button>
              <button type="button" className="notebook-menu-item menu-item-danger" role="menuitem" onClick={run(onRemove)}>
                Remove
              </button>
            </>
          ) : (
            <>
              {onRead && isReady && (
                <button type="button" className="notebook-menu-item" role="menuitem" onClick={run(onRead)} data-testid={`source-read-${s.id}`}>
                  Read
                </button>
              )}
              <button type="button" className="notebook-menu-item" role="menuitem" onClick={run(onView)}>
                View
              </button>
              <button type="button" className="notebook-menu-item" role="menuitem" onClick={run(onRename)}>
                Rename
              </button>
              <button type="button" className="notebook-menu-item" role="menuitem" onClick={run(onReplace)}>
                Replace
              </button>
              <div className="menu-divider" role="separator" />
              <button type="button" className="notebook-menu-item menu-item-danger" role="menuitem" onClick={run(onRemove)}>
                Remove
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </li>
  );
};
