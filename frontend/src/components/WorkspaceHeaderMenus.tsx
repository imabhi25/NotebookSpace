import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus } from '../useModalFocus';
import { getThemeSetting, setThemeSetting, ThemeSetting } from '../theme';
import { getReadingFont, setReadingFont, ReadingFont } from '../readingFont';
import { shortcutLabel } from '../commandPalette';
import { SettingsPanel } from './SettingsPanel';

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
  sun: <svg {...svgProps}><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></svg>,
  type: <svg {...svgProps}><path d="M5 7V5h14v2M12 5v14M9 19h6" /></svg>,
  help: <svg {...svgProps}><circle cx="12" cy="12" r="9" /><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5M12 17h.01" /></svg>,
  gear: <svg {...svgProps}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6" /></svg>,
  reset: <svg {...svgProps}><path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4" /></svg>,
  settings: <svg {...svgProps}><path d="M4 8h9M17 8h3M4 16h3M11 16h9" /><circle cx="15" cy="8" r="2" /><circle cx="9" cy="16" r="2" /></svg>,
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

const Segmented: React.FC<{ label: string; value: string; options: [string, string][]; onChange: (v: string) => void }> = ({ label, value, options, onChange }) => (
  <div className="header-menu-segmented" role="group" aria-label={label}>
    {options.map(([v, text]) => (
      <button key={v} type="button" role="menuitemradio" aria-checked={value === v} className="header-menu-seg"
        onClick={() => onChange(v)}>{text}</button>
    ))}
  </div>
);

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
  onConfigureChat: () => void;
  onCustomize: () => void;
  onRetrievalAnalytics: () => void;
  onExportNotes: () => void;
  onClearChat?: () => Promise<void> | void;
  onResetWorkspace?: () => Promise<void> | void;
}

export const WorkspaceHeaderMenus: React.FC<WorkspaceHeaderMenusProps> = ({
  hasChat, onConfigureChat, onCustomize, onRetrievalAnalytics, onExportNotes, onClearChat, onResetWorkspace,
}) => {
  const [theme, setTheme] = useState<ThemeSetting>(getThemeSetting);
  const [font, setFont] = useState<ReadingFont>(getReadingFont);
  const [dialog, setDialog] = useState<null | 'clear' | 'reset' | 'help' | 'settings'>(null);
  const close = () => setDialog(null);
  const row = (icon: React.ReactNode, text: React.ReactNode, onClick: () => void, o: { disabled?: boolean; danger?: boolean } = {}) => (
    <button type="button" role="menuitem" className={`header-menu-item${o.danger ? ' is-danger' : ''}`} disabled={o.disabled} onClick={onClick}>
      {icon}<span className="header-menu-text">{text}</span>
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
      <HeaderMenu label="App settings" icon={Icon.gear} menuClass="header-menu-narrow">
        {(done) => (<>
          <div className="header-menu-field">
            <span className="header-menu-field-label">{Icon.sun}Appearance</span>
            <Segmented label="Appearance" value={theme} options={[['light', 'Light'], ['dark', 'Dark'], ['auto', 'System']]}
              onChange={(v) => { setTheme(v as ThemeSetting); setThemeSetting(v as ThemeSetting); }} />
          </div>
          <div className="header-menu-field">
            <span className="header-menu-field-label">{Icon.type}Reading font</span>
            <Segmented label="Reading font" value={font} options={[['sans', 'Sans'], ['serif', 'Serif']]}
              onChange={(v) => { setFont(v as ReadingFont); setReadingFont(v as ReadingFont); }} />
          </div>
          {row(Icon.help, 'Help & shortcuts', () => { done(); setDialog('help'); })}
          {row(Icon.settings, 'All settings…', () => { done(); setDialog('settings'); })}
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
      {dialog === 'settings' && createPortal(
        <SettingsPanel onRequestReset={() => setDialog('reset')} onClose={close} />, document.body)}
    </>
  );
};
