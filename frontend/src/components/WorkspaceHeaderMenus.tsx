import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus } from '../useModalFocus';
import { exportAllNotes } from '../exportNotes';
import { getReadingFont, setReadingFont, ReadingFont } from '../readingFont';
import { shortcutLabel } from '../commandPalette';

const svgProps = {
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
};
const Icon: Record<string, React.ReactNode> = {
  sliders: <svg {...svgProps}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>,
  pencil: <svg {...svgProps}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>,
  activity: <svg {...svgProps}><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>,
  download: <svg {...svgProps}><path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 20h14" /></svg>,
  trash: <svg {...svgProps}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>,
  type: <svg {...svgProps}><path d="M5 7V5h14v2M12 5v14M9 19h6" /></svg>,
  help: <svg {...svgProps}><circle cx="12" cy="12" r="9" /><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5M12 17h.01" /></svg>,
  gear: <svg {...svgProps}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>,
  reset: <svg {...svgProps}><path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4" /></svg>,
};

/** A header icon button with a floating menu. Outside press and Escape close it; arrows move between rows. */
const HeaderMenu: React.FC<{
  label: string; icon: React.ReactNode; menuClass?: string;
  children: (close: () => void) => React.ReactNode;
}> = ({ label, icon, menuClass = '', children }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const items = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') || [])];
  const close = (refocus = false) => { setOpen(false); if (refocus) buttonRef.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && !open && e.target === buttonRef.current) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (e.key === 'Tab') { close(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      const list = items();
      if (!list.length) return;
      e.preventDefault();
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1
        : (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      list[next]?.focus();
    }
  };
  return (
    <div className="header-menu-root" ref={rootRef} onKeyDown={onKeyDown}>
      <button type="button" ref={buttonRef} className="btn-icon workspace-top-icon-btn" aria-label={label} title={label}
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {icon}
      </button>
      {open && <div className={`header-menu ${menuClass}`} role="menu" aria-label={label} ref={menuRef}>{children(() => close(true))}</div>}
    </div>
  );
};

const Confirm: React.FC<{ title: string; body: string; action: string; onConfirm: () => void; onCancel: () => void }> = ({ title, body, action, onConfirm, onCancel }) => {
  const ref = useModalFocus<HTMLDivElement>(true, onCancel);
  return createPortal(
    <div className="modal-backdrop" onClick={onCancel}>
      <div ref={ref} className="modal-content modal-content-sm" role="dialog" aria-modal="true" aria-labelledby="header-confirm-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2 id="header-confirm-title">{title}</h2></div>
        <div className="modal-body-p">{body}</div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>{action}</button>
        </div>
      </div>
    </div>, document.body);
};

const ShortcutsDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const ref = useModalFocus<HTMLDivElement>(true, onClose);
  const rows: [string, string][] = [
    ['Search and commands', shortcutLabel('K')], ['Toggle sources panel', shortcutLabel('B')],
    ['Toggle study panel', shortcutLabel('\\')], ['Close dialog or menu', 'Esc'], ['Rename notebook (title focused)', 'Enter'],
  ];
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div ref={ref} className="modal-content modal-content-sm" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="shortcuts-title">Help &amp; shortcuts</h2>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={onClose}>&times;</button>
        </div>
        <dl className="shortcut-list">
          {rows.map(([name, keys]) => (<div key={name} className="shortcut-row"><dt>{name}</dt><dd><kbd className="workspace-kbd">{keys}</kbd></dd></div>))}
        </dl>
      </div>
    </div>, document.body);
};

export interface WorkspaceHeaderMenusProps {
  hasChat: boolean;
  answerDepth: 'concise' | 'detailed';
  onAnswerDepth: (depth: 'concise' | 'detailed') => void;
  onConfigureChat: () => void;
  onCustomize: () => void;
  onRetrievalAnalytics: () => void;
  onExportNotes: () => void;
  onClearChat?: () => Promise<void> | void;
  onResetWorkspace?: () => Promise<void> | void;
}

export const WorkspaceHeaderMenus: React.FC<WorkspaceHeaderMenusProps> = ({
  hasChat, answerDepth, onAnswerDepth, onConfigureChat, onCustomize, onRetrievalAnalytics, onExportNotes, onClearChat, onResetWorkspace,
}) => {
  const [font, setFont] = useState<ReadingFont>(getReadingFont);
  const [dialog, setDialog] = useState<null | 'clear' | 'reset' | 'help'>(null);
  const close = () => setDialog(null);
  const row = (icon: React.ReactNode, text: React.ReactNode, onClick: () => void, o: { disabled?: boolean; danger?: boolean; value?: string } = {}) => (
    <button type="button" role="menuitem" className={`header-menu-item${o.danger ? ' is-danger' : ''}`} disabled={o.disabled} onClick={onClick}>
      {icon}<span className="header-menu-text">{text}</span>
      {o.value && <span className="header-menu-value" aria-hidden="true">{o.value}</span>}
    </button>
  );
  return (
    <>
      <HeaderMenu label="Notebook actions" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>}>
        {(done) => (<>
          {row(Icon.sliders, 'Configure chat', () => { done(); onConfigureChat(); })}
          {row(Icon.pencil, 'Customize notebook', () => { done(); onCustomize(); })}
          {row(Icon.activity, 'Retrieval analytics', () => { done(); onRetrievalAnalytics(); })}
          {row(Icon.download, 'Export notes', () => { done(); onExportNotes(); })}
          <div className="header-menu-divider" role="separator" />
          {row(Icon.trash, <><span>Delete chat history</span><small>Chat history is private to you.</small></>,
            () => { done(); setDialog('clear'); }, { disabled: !hasChat || !onClearChat })}
        </>)}
      </HeaderMenu>
      <HeaderMenu label="Settings" icon={Icon.gear} menuClass="header-menu-narrow">
        {(done) => (<>
          {row(Icon.type, 'Reading font', () => { const next = font === 'sans' ? 'serif' : 'sans'; setFont(next); setReadingFont(next); },
            { value: font === 'sans' ? 'Sans' : 'Serif' })}
          {row(Icon.sliders, 'Answer depth', () => onAnswerDepth(answerDepth === 'concise' ? 'detailed' : 'concise'),
            { value: answerDepth === 'concise' ? 'Concise' : 'Detailed' })}
          {row(Icon.help, 'Help & shortcuts', () => { done(); setDialog('help'); })}
          {row(Icon.download, 'Export notes', () => { done(); void exportAllNotes().catch(() => undefined); })}
          <div className="header-menu-divider" role="separator" />
          {row(Icon.reset, 'Reset workspace', () => { done(); setDialog('reset'); }, { danger: true, disabled: !onResetWorkspace })}
        </>)}
      </HeaderMenu>
      {dialog === 'clear' && (
        <Confirm title="Delete chat history?" body="This removes every question and answer in this chat. Notes and sources are kept. This cannot be undone."
          action="Delete history" onCancel={close} onConfirm={() => { close(); void onClearChat?.(); }} />
      )}
      {dialog === 'reset' && (
        <Confirm title="Reset Workspace?" body="Start a new guest workspace? This creates a fresh workspace for this browser, clearing all local notebooks, documents, and notes."
          action="Reset Workspace" onCancel={close} onConfirm={() => { close(); void onResetWorkspace?.(); }} />
      )}
      {dialog === 'help' && <ShortcutsDialog onClose={close} />}
    </>
  );
};
