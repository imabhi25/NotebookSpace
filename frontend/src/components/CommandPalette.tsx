import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CommandIcon, CommandItem, rankCommands, shortcutLabel } from '../commandPalette';
import { SourceTypeIcon } from './SourceRow';
import { useModalFocus } from '../useModalFocus';

const ip = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
const ICONS: Record<CommandIcon, React.ReactNode> = {
  session: <svg {...ip}><path d="M12 5v14M5 12h14" /></svg>,
  add: <svg {...ip}><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v4h14v-4" /></svg>,
  note: <svg {...ip}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>,
  history: <svg {...ip}><path d="M3 11a9 9 0 1 1 3 6.7M3 4v7h7M12 7v5l3 2" /></svg>,
  sources: <svg {...ip}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M9 3v18" /></svg>,
  notes: <svg {...ip}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M15 3v18" /></svg>,
  back: <svg {...ip}><path d="M15 6l-6 6 6 6" /></svg>,
  chat: <svg {...ip}><path d="M21 12a8 8 0 0 1-11.7 7L4 20l1.1-4.6A8 8 0 1 1 21 12Z" /></svg>,
};

interface CommandPaletteProps {
  items: CommandItem[];
  onClose: () => void;
}

/** A search box over the workspace's actions, sessions, sources and notes. Mount it only while open. */
export const CommandPalette: React.FC<CommandPaletteProps> = ({ items, onClose }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const dialogRef = useModalFocus<HTMLDivElement>(true, onClose);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();

  const results = useMemo(() => rankCommands(items, query), [items, query]);
  useEffect(() => { setActive(0); }, [query]);
  const current = results[Math.min(active, results.length - 1)];

  // Keep the highlighted entry in view as the arrow keys move through a long list.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [active, results]);

  const run = (item: CommandItem | undefined) => {
    if (!item) return;
    onClose();
    // After the palette has unmounted and focus is back on the control that opened it, so a dialog
    // opened by the command remembers that control and not this search box.
    window.setTimeout(item.run, 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!results.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + results.length) % results.length);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : Math.max(0, results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(current);
    }
  };

  const optionId = (item: CommandItem) => `${baseId}-${item.id}`;
  let lastGroup = '';

  return (
    <div className="command-palette-backdrop modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Command palette" className="command-palette" data-testid="command-palette">
        <div className="command-palette-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text" data-autofocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Search or run a command"
            role="combobox" aria-expanded="true" aria-controls={`${baseId}-list`} aria-autocomplete="list"
            aria-activedescendant={current ? optionId(current) : undefined} aria-label="Search or run a command"
            autoComplete="off" spellCheck={false}
          />
          <kbd className="command-palette-kbd" aria-hidden="true">Esc</kbd>
        </div>
        <ul id={`${baseId}-list`} className="command-palette-list" role="listbox" aria-label="Results" ref={listRef}>
          {results.map((item, i) => {
            const heading = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <React.Fragment key={item.id}>
                {heading && <li role="presentation" className="command-palette-group">{heading}</li>}
                <li
                  id={optionId(item)} role="option" aria-selected={i === active}
                  className={`command-palette-item ${i === active ? 'is-active' : ''}`}
                  onMouseMove={() => { if (i !== active) setActive(i); }}
                  onClick={() => run(item)}
                >
                  <span className="command-palette-icon" aria-hidden="true">
                    {item.sourceBadge ? <SourceTypeIcon type={item.sourceBadge.type} badge={item.sourceBadge.badge} />
                      : item.icon ? ICONS[item.icon] : null}
                  </span>
                  <span className="command-palette-text">
                    <span className="command-palette-label">{item.label}</span>
                    {item.hint && <span className="command-palette-hint">{item.hint}</span>}
                  </span>
                  {item.tag && <span className="command-palette-tag">{item.tag}</span>}
                  {i === active && !item.shortcut && !item.tag && <kbd className="command-palette-kbd command-palette-enter" aria-hidden="true">↵</kbd>}
                  {item.shortcut && <kbd className="command-palette-kbd">{shortcutLabel(item.shortcut)}</kbd>}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
        {!results.length && <p className="command-palette-empty" role="status">Nothing matches &ldquo;{query}&rdquo;.</p>}
        <div className="command-palette-footer" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Select</span><span><kbd>Esc</kbd> Close</span>
        </div>
        <div className="sr-only" role="status" aria-live="polite">{results.length ? `${results.length} results` : 'No results'}</div>
      </div>
    </div>
  );
};
