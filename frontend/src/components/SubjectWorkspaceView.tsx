import { ReferenceIcon } from './ReferenceIcon';
import { EmptyStateIcon } from './EmptyStateIcon';
import React, { useState, useEffect, useLayoutEffect, useRef, startTransition } from 'react';
import { yieldToMain } from '../yieldToMain';
import { useSlidingIndicator } from '../useSlidingIndicator';
import { api } from '../api';
import {
  Subject,
  Source,
  Conversation,
  MessageItem,
  Note,
  Citation,
  ActiveCitation,
  PassageItem,
  SubjectSettings,
  User,
  normalizeFileName,
} from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { lazyView, preloadWhenIdle } from '../lazyView';
import { SourceRow, SourceTypeIcon, TYPE_INFO } from './SourceRow';
import { autoCleanTitle } from '../sourceTitles';
import { useModalFocus } from '../useModalFocus';
import { useMediaQuery, READER_NAV_ROOM_MIN_WIDTH } from '../viewport';
import { SourceReader, type ReaderNotice } from './SourceReader';
import { useSourceText } from '../useSourceText';
import type { PassageInput } from '../sourcePages';
import { RetrievalMapView } from './RetrievalMapView';
import { SessionsView } from './WorkspaceNav';
import { InlineEvidence } from './EvidenceBody';
import { abstainCopy, abstainText } from '../abstain';
import { CommandPalette } from './CommandPalette';
import { BackendStatus } from './BackendStatus';
import { CrossSourceCheck } from './CrossSourceCheck';
import { crossSourceCheck } from '../answerTelemetry';
import { CommandItem, matchShortcut, shortcutLabel } from '../commandPalette';
import { toEditorHtml, noteToText, sanitizeNoteHtml, safeNoteUrl } from '../noteHtml';
import { getThemeSetting, setThemeSetting, ThemeSetting } from '../theme';

// Dialogs load when first opened and are fetched in the background once the workspace is idle.
const SourceModal = lazyView(() => import('./SourceModal').then((m) => m.SourceModal));
const SourceViewerModal = lazyView(() => import('./SourceViewerModal').then((m) => m.SourceViewerModal));
import { Composer, ComposerScope } from './Composer';
import { BrandLogo } from './BrandLogo';

const SAMPLE_TAG = /^\*\*\[Sample Answer\]\*\*\s*/;

const NAV_PREF_KEY = 'notebookspace_nav_open';
const CONTEXT_PREF_KEY = 'notebookspace_context_open';
const NAV_W_KEY = 'notebookspace_nav_w';
const CTX_W_KEY = 'notebookspace_ctx_w';
const NAV_W = { def: 260, min: 210, max: 400, snap: 130 };
const CTX_W = { def: 360, min: 300, max: 560, snap: 180, note: 420 };
// Narrower desktops keep all three columns comfortable: a slimmer default and note width below 1280px.
const narrowDesktop = () => typeof window !== 'undefined' && window.innerWidth < 1280;
const ctxDefault = () => (narrowDesktop() ? 340 : CTX_W.def);
const ctxNoteWidth = () => (narrowDesktop() ? 400 : CTX_W.note);
const clampW = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));
function readWidth(key: string, def: number, min: number, max: number): number {
  try {
    const n = Number(window.localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? clampW(n, min, max) : def;
  } catch { return def; }
}
function writeWidth(key: string, v: number): void { try { window.localStorage.setItem(key, String(v)); } catch { /* optional */ } }
function readPanelPref(key: string): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? true : stored === '1';
  } catch {
    return true;
  }
}
function readDraft(key: string): string {
  try {
    return window.sessionStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}
function writeDraft(key: string, value: string): void {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    /* storage unavailable: the draft lives in memory only */
  }
}
const AUTO_RENAME_KEY = 'notebookspace_auto_rename';
type SourceSortKey = 'title' | 'date';
const SORT_OPTIONS: { value: SourceSortKey; label: string }[] = [
  { value: 'title', label: 'Title (A–Z)' },
  { value: 'date', label: 'Date added' },
];
function readAutoRename(): boolean {
  try { return window.localStorage.getItem(AUTO_RENAME_KEY) === '1'; } catch { return false; }
}
function writePanelPref(key: string, open: boolean): void {
  try {
    window.localStorage.setItem(key, open ? '1' : '0');
  } catch {
    /* storage unavailable: the choice still applies for this visit */
  }
}

/** Notebook title that reads as plain text until clicked, then edits in place. Enter/blur saves, Escape cancels. */
const NotebookTitle: React.FC<{ name: string; onRename?: (name: string) => Promise<void> }> = ({ name, onRename }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);
  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);
  if (!onRename) return <h1 className="workspace-subject-pill-name">{name}</h1>;
  const finish = (save: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    const next = draft.trim();
    setEditing(false);
    if (save && next && next !== name) void onRename(next).catch(() => undefined);
  };
  return (
    <h1 className="workspace-subject-pill-name notebook-title">
      {editing ? (
        <input ref={inputRef} className="notebook-title-input" value={draft} aria-label="Notebook name" maxLength={120}
          size={Math.max(draft.length, 3)}
          onChange={(e) => setDraft(e.target.value)} onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); finish(true); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDraft(name); finish(false); }
          }} />
      ) : (
        <span className="notebook-title-text" role="button" tabIndex={0} title="Click to rename"
          onClick={() => { doneRef.current = false; setDraft(name); setEditing(true); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); doneRef.current = false; setDraft(name); setEditing(true); } }}>{name}</span>
      )}
    </h1>
  );
};

interface SubjectWorkspaceViewProps {
  subject: Subject;
  sources: Source[];
  conversations?: Conversation[];
  notes: Note[];
  activeConversationId?: string | null;
  selectedSourceIds: string[];
  starterQuestions: string[];
  isDemoMode: boolean;
  currentUser?: User | null;
  onBackToDashboard: () => void;
  onSelectSources: (ids: string[]) => void;
  onSelectConversation?: (convId: string) => void;
  onCreateConversation?: () => Promise<void>;
  onRenameConversation?: (convId: string, title: string) => Promise<void>;
  onDeleteConversation?: (convId: string) => Promise<void>;
  onUploadFiles: (files: File[]) => Promise<void>;
  onPasteText: (title: string, text: string) => Promise<void>;
  onAddUrl: (url: string, title?: string) => Promise<void>;
  onRenameSource: (sourceId: string, title: string) => Promise<void>;
  /** Renames the open notebook (click-to-edit title in the header). */
  onRenameSubject?: (name: string) => Promise<void>;
  onDeleteSource: (sourceId: string) => Promise<void>;
  onRetrySource: (sourceId: string) => Promise<void>;
  onReplaceSource: (sourceId: string, file: File) => Promise<void>;
  onSendMessage: (question: string, options?: { is_retry?: boolean; retry_message_id?: string }) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void> | void;
  onUpdateSettings: (settings: SubjectSettings) => Promise<void>;
  onCreateNote: (title: string, content: string) => Promise<void>;
  onSaveAnswerAsNote: (msg: MessageItem) => Promise<void>;
  onUpdateNote: (noteId: string, title: string, content: string) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  messages: MessageItem[];
  chatLoading: boolean;
  historyLoading?: boolean;
  onStopGeneration?: () => void;
  onResetWorkspace?: () => Promise<void>;
}

interface ReaderState {
  sourceId: string;
  page: number;
  mode: 'cited' | 'current';
  version: number;
  cite: { messageId: string; citation: ActiveCitation } | null;
  /** The panel was collapsed when the reader opened; closing the reader puts it back. */
  panelWasCollapsed: boolean;
  /** The source was replaced while the reader was open. */
  replaced: boolean;
}
interface ReturnTarget {
  opener: HTMLElement | null;
  anchorTurnId: string | null;
  anchorOffset: number;
  scrollTop: number;
  userScrolled: boolean;
}

export const SubjectWorkspaceView: React.FC<SubjectWorkspaceViewProps> = ({
  subject,
  sources,
  conversations,
  notes,
  activeConversationId,
  onSelectConversation,
  onCreateConversation,
  selectedSourceIds,
  starterQuestions,
  isDemoMode,
  currentUser,
  onBackToDashboard,
  onSelectSources,
  onUploadFiles,
  onPasteText,
  onAddUrl,
  onRenameSource,
  onRenameSubject,
  onDeleteSource,
  onRetrySource,
  onReplaceSource,
  onSendMessage,
  onDeleteMessage,
  onUpdateSettings,
  onCreateNote,
  onSaveAnswerAsNote,
  onUpdateNote,
  onDeleteNote,
  messages,
  chatLoading,
  historyLoading = false,
  onStopGeneration,
  onResetWorkspace,
}) => {
  // --------------------------------------------------------------------------
  // LAYOUT STATE: Independently Collapsible Side Panels
  // --------------------------------------------------------------------------
  const compactViewport = () => typeof window !== 'undefined' && window.innerWidth <= 960;
  const overlayViewport = () => typeof window !== 'undefined' && window.innerWidth <= 768;
  const [isCompact, setIsCompact] = useState(compactViewport);
  // Navigation (left) and materials (right) collapse independently. Where they are docked the
  // choice is remembered; where they are overlays they always start closed.
  const [isNavCollapsed, setIsNavCollapsed] = useState(() => compactViewport() || !readPanelPref(NAV_PREF_KEY));
  const [navW, setNavW] = useState(() => readWidth(NAV_W_KEY, NAV_W.def, NAV_W.min, NAV_W.max));
  const [ctxW, setCtxW] = useState(() => readWidth(CTX_W_KEY, ctxDefault(), CTX_W.min, CTX_W.max));
  const [resizing, setResizing] = useState<'left' | 'right' | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [isContextCollapsed, setIsContextCollapsed] = useState(() => overlayViewport() || !readPanelPref(CONTEXT_PREF_KEY));
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [titleBelowBar, setTitleBelowBar] = useState(compactViewport);
  const headerRef = useRef<HTMLElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const titleMeasureRef = useRef<HTMLDivElement>(null);
  const contextToggleRef = useRef<HTMLButtonElement>(null);
  const navToggleRef = useRef<HTMLButtonElement>(null);
  const navPanelRef = useRef<HTMLElement>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const scrollThreadToBottom = () => {
    const el = chatAreaRef.current?.querySelector<HTMLElement>('.thread-scroll-container');
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollTo?.({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  };
  // Offer a jump to the latest message once the feed is scrolled more than 120px above the bottom.
  useEffect(() => {
    const el = chatAreaRef.current?.querySelector<HTMLElement>('.thread-scroll-container');
    if (!el) { setShowScrollDown(false); return; }
    const update = () => setShowScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
    update();
    el.addEventListener('scroll', update, { passive: true });
    return () => el.removeEventListener('scroll', update);
  }, [messages.length, chatLoading]);
  const contextPanelRef = useRef<HTMLElement>(null);
  const evidenceRef = useRef<HTMLElement>(null);
  const [cardFocusTick, setCardFocusTick] = useState(0);
  const evidenceOpenerRef = useRef<HTMLElement | null>(null);
  const lastSendTimeRef = useRef<number>(0);

  useEffect(() => {
    if (chatLoading) {
      lastSendTimeRef.current = Date.now();
    }
  }, [chatLoading]);

  const handleSafeStopGeneration = () => {
    if (Date.now() - lastSendTimeRef.current < 500) {
      return;
    }
    onStopGeneration?.();
  };
  // The study panel stays docked beside the conversation from 769px up; below that it is an on-demand overlay.
  // Navigation becomes a drawer at 960px and below.
  const isContextOverlay = useMediaQuery('(max-width: 768px)', overlayViewport());
  const resizingRef = useRef(false);
  // Reopening a closed panel always starts from its default width, not the squeezed one it was closed at.
  const resetNavWidth = () => { setNavW(NAV_W.def); writeWidth(NAV_W_KEY, NAV_W.def); rootRef.current?.style.setProperty('--nav-w', `${NAV_W.def}px`); };
  const resetCtxWidth = () => { noteWidthRestore.current = null; setCtxW(ctxDefault()); writeWidth(CTX_W_KEY, ctxDefault()); rootRef.current?.style.setProperty('--ctx-w', `${ctxDefault()}px`); };
  const setNavCollapsed = (collapsed: boolean, remember = true) => {
    if (!collapsed && isNavCollapsed && !resizingRef.current) resetNavWidth();
    setIsNavCollapsed(collapsed);
    if (remember && !isCompact) writePanelPref(NAV_PREF_KEY, !collapsed);
  };
  const setContextCollapsed = (collapsed: boolean, remember = true) => {
    if (!collapsed && isContextCollapsed && !resizingRef.current) resetCtxWidth();
    setIsContextCollapsed(collapsed);
    if (remember && !isContextOverlay) writePanelPref(CONTEXT_PREF_KEY, !collapsed);
  };
  const refocusNavToggle = useRef(false);
  const closeNavPanel = () => { refocusNavToggle.current = true; setNavCollapsed(true); };
  // The collapse button that held focus unmounts with the panel; the expand button that replaces it takes focus.
  useEffect(() => {
    if (refocusNavToggle.current && isNavCollapsed) { refocusNavToggle.current = false; navToggleRef.current?.focus(); }
  }, [isNavCollapsed]);
  // The toggle that reopens the panel only exists once the panel is collapsed, so focus moves to it after the render.
  const refocusContextToggle = useRef(false);
  const closeContextPanel = () => { refocusContextToggle.current = true; setContextCollapsed(true); };
  // Drag the inner edge of a side panel. Width is written straight to a CSS variable while dragging (no re-render
  // per frame) and committed on release; dragging far enough in collapses the panel, dragging out re-opens it.
  const startResize = (side: 'left' | 'right') => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const cfg = side === 'left' ? NAV_W : CTX_W;
    const collapsed0 = side === 'left' ? isNavCollapsed : isContextCollapsed;
    const startW = collapsed0 ? (side === 'left' ? 52 : 0) : (side === 'left' ? navW : ctxW);
    const startX = e.clientX;
    const varName = side === 'left' ? '--nav-w' : '--ctx-w';
    let width = side === 'left' ? navW : ctxW;
    let collapsed = collapsed0;
    setResizing(side);
    resizingRef.current = true;
    const move = (ev: PointerEvent) => {
      const raw = startW + (side === 'left' ? ev.clientX - startX : startX - ev.clientX);
      const shouldCollapse = raw < cfg.snap;
      if (shouldCollapse !== collapsed) {
        collapsed = shouldCollapse;
        if (side === 'left') setNavCollapsed(shouldCollapse); else setContextCollapsed(shouldCollapse);
      }
      width = clampW(raw, cfg.min, cfg.max);
      rootRef.current?.style.setProperty(varName, `${width}px`);
    };
    const done = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', done);
      window.removeEventListener('pointercancel', done);
      setResizing(null);
      resizingRef.current = false;
      if (side === 'left') { setNavW(width); writeWidth(NAV_W_KEY, width); } else { setCtxW(width); writeWidth(CTX_W_KEY, width); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', done);
    window.addEventListener('pointercancel', done);
  };
  const resizeHandle = (side: 'left' | 'right', inPanel: boolean) => (
    <div className={`panel-resize-handle panel-resize-${side} ${inPanel ? 'in-panel' : 'in-slot'}`} role="separator" aria-orientation="vertical"
      aria-label={side === 'left' ? 'Resize sources panel' : 'Resize study panel'} tabIndex={0}
      aria-valuemin={side === 'left' ? NAV_W.min : CTX_W.min} aria-valuemax={side === 'left' ? NAV_W.max : CTX_W.max}
      aria-valuenow={side === 'left' ? (isNavCollapsed ? 0 : navW) : (isContextCollapsed ? 0 : ctxW)}
      data-resizing={resizing === side ? 'true' : undefined}
      onPointerDown={startResize(side)} onDoubleClick={() => resetWidth(side)} onKeyDown={nudgeWidth(side)} />
  );
  const resetWidth = (side: 'left' | 'right') => {
    if (side === 'left') { setNavW(NAV_W.def); writeWidth(NAV_W_KEY, NAV_W.def); setNavCollapsed(false); }
    else { setCtxW(ctxDefault()); writeWidth(CTX_W_KEY, ctxDefault()); setContextCollapsed(false); }
    rootRef.current?.style.removeProperty(side === 'left' ? '--nav-w' : '--ctx-w');
  };
  const nudgeWidth = (side: 'left' | 'right') => (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const dir = (e.key === 'ArrowRight' ? 1 : -1) * (side === 'left' ? 1 : -1) * (e.shiftKey ? 48 : 16);
    if (side === 'left') { const v = clampW(navW + dir, NAV_W.min, NAV_W.max); setNavW(v); writeWidth(NAV_W_KEY, v); }
    else { const v = clampW(ctxW + dir, CTX_W.min, CTX_W.max); setCtxW(v); writeWidth(CTX_W_KEY, v); }
  };
  useEffect(() => {
    if (isContextCollapsed && refocusContextToggle.current) {
      refocusContextToggle.current = false;
      contextToggleRef.current?.focus();
    }
  }, [isContextCollapsed]);

  const contextOverlayOpen = isContextOverlay && !isContextCollapsed;
  const navDrawerOpen = isCompact && !isNavCollapsed;
  // One Escape handler for the panel (defined with the reader below), so the overlay's focus hook
  // and the workspace's key handler take the same steps.
  const panelEscapeRef = useRef<() => void>(() => {});
  useModalFocus<HTMLElement>(contextOverlayOpen, () => panelEscapeRef.current(), contextPanelRef);
  // Source reader state lives here, with the other layout state, because layout values derive from it.
  const [reader, setReader] = useState<ReaderState | null>(null);
  const [readerExpanded, setReaderExpanded] = useState(false);
  const readerEscapeRef = useRef<() => void>(() => {});
  const roomForNav = useMediaQuery(`(min-width: ${READER_NAV_ROOM_MIN_WIDTH}px)`, typeof window !== 'undefined' && window.innerWidth >= READER_NAV_ROOM_MIN_WIDTH);
  // Derived, never stored: the saved navigation preference is not touched.
  const navHiddenByReader = readerExpanded && !isContextOverlay && !roomForNav;
  useModalFocus<HTMLElement>(navDrawerOpen, closeNavPanel, navPanelRef);
  const [evidenceFocusTick, setEvidenceFocusTick] = useState(0);
  const passageRequestRef = useRef(0);

  useEffect(() => {
    let wasCompact = compactViewport();
    const onResize = () => {
      const next = compactViewport();
      if (next === wasCompact) return;
      wasCompact = next;
      setIsCompact(next);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Crossing a breakpoint switches between docked (remembered) and overlay (closed) states.
  useEffect(() => { setIsNavCollapsed(isCompact || !readPanelPref(NAV_PREF_KEY)); }, [isCompact]);
  useEffect(() => { setIsContextCollapsed(isContextOverlay || !readPanelPref(CONTEXT_PREF_KEY)); }, [isContextOverlay]);

  // An unusually long title moves below the controls instead of wrapping the bar or losing text.
  useLayoutEffect(() => {
    const measure = () => {
      if (isCompact) { setTitleBelowBar(true); return; }
      const header = headerRef.current;
      if (!header || !titleMeasureRef.current || header.clientWidth === 0) return;
      const style = getComputedStyle(header);
      const gap = parseFloat(style.columnGap) || 0;
      const available = header.clientWidth - (parseFloat(style.paddingLeft) || 0)
        - (parseFloat(style.paddingRight) || 0) - (brandRef.current?.offsetWidth || 0) - (backButtonRef.current?.offsetWidth || 0) - 24
        - (actionsRef.current?.offsetWidth || 0) - gap * 2;
      setTitleBelowBar(titleMeasureRef.current.offsetWidth > available);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    if (headerRef.current) observer.observe(headerRef.current);
    if (titleMeasureRef.current) observer.observe(titleMeasureRef.current);
    if (actionsRef.current) observer.observe(actionsRef.current);
    return () => observer.disconnect();
  }, [isCompact, subject.name, subject.course_code]);

  useEffect(() => {
    if (chatAreaRef.current) chatAreaRef.current.inert = contextOverlayOpen || navDrawerOpen;
  }, [contextOverlayOpen, navDrawerOpen]);

  useEffect(() => {
    if (contextOverlayOpen && contextPanelRef.current) {
      contextPanelRef.current.inert = false; // the inert sync below has not run yet in this commit
      contextPanelRef.current.focus();
    }
  }, [contextOverlayOpen]);

  useEffect(() => {
    if (navDrawerOpen && navPanelRef.current) {
      navPanelRef.current.inert = false;
      navPanelRef.current.focus();
    }
  }, [navDrawerOpen]);

  // Opened from the keyboard: move focus to the evidence that appeared under the answer.
  useEffect(() => {
    if (evidenceFocusTick > 0) evidenceRef.current?.focus();
  }, [evidenceFocusTick]);

  useEffect(() => {
    if (!isActionsOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (!menuRootRef.current?.contains(event.target as Node)) setIsActionsOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [isActionsOpen]);

  const closeActions = () => { setIsActionsOpen(false); menuButtonRef.current?.focus(); };
  const handleMenuKeys = (event: React.KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
      closeActions();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  };

  const [isPanelDragOver, setIsPanelDragOver] = useState(false);

  // Whichever panels are collapsed are removed from the tab order and the accessibility tree.
  useEffect(() => {
    if (contextPanelRef.current) contextPanelRef.current.inert = isContextCollapsed;
  }, [isContextCollapsed]);
  useEffect(() => {
    if (navPanelRef.current) navPanelRef.current.inert = isNavCollapsed || navHiddenByReader;
  }, [isNavCollapsed, navHiddenByReader]);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);

  // Right contextual panel tab: 'passage' | 'notes' | 'retrieval'
  const [contextView, setContextView] = useState<'notes' | 'evidence' | 'retrieval'>('evidence');
  const contextTabsRef = useRef<HTMLDivElement>(null);
  useSlidingIndicator(contextTabsRef, contextView === 'notes' ? 'notes' : 'evidence');
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useModalFocus(historyOpen, () => setHistoryOpen(false));
  const [selectedRetrievalMessageId, setSelectedRetrievalMessageId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedRetrievalMessageId(null);
  }, [activeConversationId]);

  // Search queries
  const [sourceSearch, setSourceSearch] = useState('');
  const [autoRename, setAutoRename] = useState<boolean>(readAutoRename);
  const [sourceSort, setSourceSort] = useState<SourceSortKey | null>(null);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortRootRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!isSortOpen) return;
    const onDown = (e: MouseEvent) => { if (!sortRootRef.current?.contains(e.target as Node)) setIsSortOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setIsSortOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [isSortOpen]);
  const [webQuery, setWebQuery] = useState('');
  const [webHint, setWebHint] = useState('');
  const [initialUrl, setInitialUrl] = useState('');
  const [noteSearch, setNoteSearch] = useState('');

  // Modals
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [sourceEntryTab, setSourceEntryTab] = useState<'upload' | 'paste' | 'url' | undefined>();

  const openSourceEntry = (tab: 'upload' | 'paste' | 'url') => {
    withViewTransition(() => {
      setSourceEntryTab(tab);
      setIsAddSourceOpen(true);
    });
  };
  const openAddSources = (tab?: 'upload' | 'paste' | 'url') => {
    withViewTransition(() => {
      if (tab) setSourceEntryTab(tab);
      setIsAddSourceOpen(true);
    });
  };
  const closeAddSources = () => {
    withViewTransition(() => {
      setIsAddSourceOpen(false);
      setSourceEntryTab(undefined);
      setDroppedFiles([]);
      setInitialUrl('');
    });
  };
  const openSettings = () => withViewTransition(() => setIsSettingsOpen(true));
  const closeSettings = () => withViewTransition(() => setIsSettingsOpen(false));
  useEffect(() => {
    try {
      if (sessionStorage.getItem('notebookspace_add_materials') === subject.id) {
        sessionStorage.removeItem('notebookspace_add_materials');
        setIsAddSourceOpen(true);
      }
    } catch { /* Browser storage may be unavailable. The Add sources button remains usable. */ }
  }, [subject.id]);

  const [viewingSource, setViewingSource] = useState<Source | null>(null);
  const [viewerStatus, setViewerStatus] = useState<'loading' | 'error' | 'ready'>('ready');

  // The Add sources dialog mounts on first open and then stays mounted, so a pasted draft survives closing it.
  const hasOpenedAddSource = useRef(false);
  if (isAddSourceOpen) hasOpenedAddSource.current = true;

  useEffect(() => {
    preloadWhenIdle(SourceModal);
    preloadWhenIdle(SourceViewerModal);
  }, []);
  const [renamingSource, setRenamingSource] = useState<Source | null>(null);
  const [newSourceTitle, setNewSourceTitle] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (!chatLoading) {
      setRetryingMessageId(null);
    }
  }, [chatLoading]);

  const withViewTransition = (fn: () => void) => {
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      (document as any).startViewTransition(fn);
    } else {
      fn();
    }
  };

  const getMatchedItemsForMessage = (msg: MessageItem) => {
    const list: Array<{
      file: string;
      title: string;
      page: number;
      score: number;
      citation: Citation;
    }> = [];
    const seen = new Set<string>();

    if (msg.citations && msg.citations.length > 0) {
      msg.citations.forEach((cit) => {
        const key = `${normalizeFileName(cit.file)}:${cit.page}`;
        if (seen.has(key)) return;
        seen.add(key);

        const match = msg.retrieved?.find(
          (r) =>
            normalizeFileName(r.file || r.file_name) === normalizeFileName(cit.file) &&
            (r.page ?? r.page_number) === cit.page
        );
        let rawScore = match?.score ?? match?.similarity_score;
        if (typeof rawScore !== 'number' || isNaN(rawScore)) {
          rawScore = 0.88;
        }
        const normalizedScore = Math.min(1, Math.max(0.2, rawScore > 1 ? rawScore / 1.5 : rawScore));
        list.push({
          file: cit.file,
          title: cit.title || cit.file,
          page: cit.page,
          score: normalizedScore,
          citation: cit,
        });
      });
    } else if (msg.retrieved && msg.retrieved.length > 0) {
      msg.retrieved.forEach((r) => {
        const file = r.file || r.file_name || 'Source document';
        const page = r.page ?? r.page_number ?? 1;
        const key = `${normalizeFileName(file)}:${page}`;
        if (seen.has(key)) return;
        seen.add(key);

        let rawScore = r.score ?? r.similarity_score;
        if (typeof rawScore !== 'number' || isNaN(rawScore)) rawScore = 0.85;
        const normalizedScore = Math.min(1, Math.max(0.2, rawScore > 1 ? rawScore / 1.5 : rawScore));
        list.push({
          file,
          title: r.title || file,
          page,
          score: normalizedScore,
          citation: {
            file,
            page,
            source_id: r.source_id,
            title: r.title,
          },
        });
      });
    }
    return list;
  };

  useEffect(() => {
    if (!isSettingsOpen) setSettingsError(null);
  }, [isSettingsOpen]);

  // Saves one response setting. Only the two known settings are sent, since the server
  // rejects anything else, and a failed save is shown instead of silently snapping back.
  const saveSettings = async (patch: Partial<SubjectSettings>) => {
    const lengths: SubjectSettings['response_length'][] = ['concise', 'default', 'detailed'];
    const styles: SubjectSettings['response_style'][] = ['general', 'learning-guide'];
    const current = subject.settings;
    const next: SubjectSettings = {
      response_length: current && lengths.includes(current.response_length) ? current.response_length : 'default',
      response_style: current && styles.includes(current.response_style) ? current.response_style : 'general',
      ...patch,
    };
    setSettingsError(null);
    try {
      await onUpdateSettings(next);
    } catch (err: any) {
      setSettingsError(`Settings were not saved. ${err?.message || 'Please try again.'}`);
    }
  };

  // Notes Modal
  const [isCreateNoteOpen, setIsCreateNoteOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteFormTitle, setNoteFormTitle] = useState('');
  const [noteFormContent, setNoteFormContent] = useState('');

  // Focus trap refs
  const settingsModalRef = useModalFocus(isSettingsOpen, () => setIsSettingsOpen(false));
  const renameModalRef = useModalFocus(Boolean(renamingSource), () => setRenamingSource(null));

  // Citation inspection state
  const [selectedCitation, setSelectedCitation] = useState<ActiveCitation | null>(null);
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [passageLoading, setPassageLoading] = useState(false);
  // Passages already fetched this session, so stepping back to a citation renders at once with no spinner.
  const passageCache = useRef<Map<string, PassageItem[]>>(new Map());

  // Composer & Turn Feedback
  // The draft question is kept per notebook and session, so switching, reloading or a failed send never loses it.
  const draftKey = `notebookspace_draft_${subject.id}_${activeConversationId || 'new'}`;
  const draftKeyRef = useRef(draftKey);
  const [question, setQuestionState] = useState(() => readDraft(draftKey));
  const setQuestion = (value: string) => {
    setQuestionState(value);
    writeDraft(draftKeyRef.current, value);
  };
  useEffect(() => {
    if (draftKeyRef.current === draftKey) return;
    draftKeyRef.current = draftKey;
    setQuestionState(readDraft(draftKey));
  }, [draftKey]);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [savedNoteMsgId, setSavedNoteMsgId] = useState<string | null>(null);
  const [savingNoteMsgId, setSavingNoteMsgId] = useState<string | null>(null);

  // File replacement input ref
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const [replacingSourceId, setReplacingSourceId] = useState<string | null>(null);

  const threadBottomRef = useRef<HTMLDivElement>(null);

  // Opening a notebook keeps the thread at the top, so the question and the start of the answer are visible.
  // Only a message the user just sent (or the answer arriving for it) scrolls to the bottom.
  const prevMessageCountRef = useRef(0);
  useEffect(() => {
    const prev = prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    const bottom = threadBottomRef.current;
    const scroller = bottom?.closest('.thread-scroll-container') as HTMLElement | null;
    const appended = prev > 0 && messages.length > prev && messages.length - prev <= 2;
    if (chatLoading || appended) {
      if (bottom && typeof bottom.scrollIntoView === 'function') bottom.scrollIntoView({ behavior: 'smooth' });
    } else if (scroller) {
      scroller.scrollTop = 0;
    }
  }, [messages, chatLoading]);

  // Auto-select the first citation of the latest cited answer, so the Evidence panel is never empty on load.
  const autoSelectedForRef = useRef<string | null>(null);
  const suppressEvidenceScrollRef = useRef(false);
  useEffect(() => {
    if (selectedCitation || autoSelectedForRef.current === subject.id) return;
    const answered = [...messages].reverse().find((m) => m.role === 'assistant' && m.citations && m.citations.length > 0);
    if (!answered) return;
    autoSelectedForRef.current = subject.id;
    suppressEvidenceScrollRef.current = true;
    const first = answered.citations[0];
    setSelectedCitation({ ...first, messageId: answered.id });
    loadPassages(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, subject.id]);

  // Escape key handler to close all workspace modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (renamingSource) {
          setRenamingSource(null);
        } else if (isCreateNoteOpen) {
          void flushRef.current();
        } else if (isSettingsOpen) {
          setIsSettingsOpen(false);
        } else if (viewingSource) {
          setViewingSource(null);
        } else if (isAddSourceOpen) {
          setIsAddSourceOpen(false);
        } else if (isActionsOpen) {
          closeActions();
        } else if (contextOverlayOpen) {
          panelEscapeRef.current();
        } else if (readerExpanded) {
          // Docked: the panel is not modal, but an expanded reader still steps back one level.
          readerEscapeRef.current();
        } else if (navDrawerOpen) {
          closeNavPanel();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [renamingSource, isCreateNoteOpen, isSettingsOpen, viewingSource, isAddSourceOpen, isActionsOpen, contextOverlayOpen, navDrawerOpen, readerExpanded]);

  // Ready sources
  const readySources = sources.filter((s) => s.status === 'ready');

  // Source selection handlers
  const handleToggleSource = (sourceId: string) => {
    if (selectedSourceIds.includes(sourceId)) {
      onSelectSources(selectedSourceIds.filter((id) => id !== sourceId));
    } else {
      onSelectSources([...selectedSourceIds, sourceId]);
    }
  };

  const handleSelectAllSources = () => {
    onSelectSources(readySources.map((s) => s.id));
  };

  const handleWebSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = webQuery.trim();
    if (!query) {
      setWebHint('Paste a link to a page to add it as a source.');
      return;
    }
    const candidate = /^https?:\/\//i.test(query) ? query : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(query) ? `https://${query}` : '';
    try {
      if (candidate) {
        new URL(candidate);
        setInitialUrl(candidate);
        setWebQuery('');
        setWebHint('');
        setIsAddSourceOpen(true);
        return;
      }
    } catch {
      // fall through to the hint
    }
    setWebHint('Web search is not available yet. Paste a link and it is added as a source.');
  };


  const handleClearSources = () => {
    onSelectSources([]);
  };

  // Replace source file trigger
  const handleTriggerReplace = (sourceId: string) => {
    setReplacingSourceId(sourceId);
    replaceFileInputRef.current?.click();
  };

  const handleReplaceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && replacingSourceId) {
      await onReplaceSource(replacingSourceId, e.target.files[0]);
      setReplacingSourceId(null);
      e.target.value = '';
    }
  };

  // View full source content modal
  const handleOpenSourceViewer = async (s: Source) => {
    setViewingSource(s);
    setViewerStatus('loading');
    try {
      const full = await api.getSourceDetail(subject.id, s.id);
      if (full) {
        setViewingSource(full);
      }
      setViewerStatus('ready');
    } catch (err) {
      console.error('Failed to load source detail:', err);
      setViewerStatus('error');
    }
  };


  // --------------------------------------------------------------------------
  // COMMAND PALETTE AND SHORTCUTS (Cmd/Ctrl+K, B and \)
  // --------------------------------------------------------------------------
  const [paletteOpen, setPaletteOpen] = useState(false);
  const toggleSourcesPanel = () => (isNavCollapsed ? setNavCollapsed(false) : closeNavPanel());
  const toggleStudyPanel = () => (isContextCollapsed ? setContextCollapsed(false) : closeContextPanel());
  const openNoteEditor = (note: Note | null) => {
    withViewTransition(() => {
      setEditingNote(note);
      setNoteFormTitle(note?.title ?? 'New Note');
      const html = toEditorHtml(note?.content ?? '');
      noteInitialHtml.current = html;
      setNoteFormContent(html);
      noteSavedRef.current = { title: note?.title ?? 'New Note', content: html.trim() };
      setNoteSaveStatus(note ? 'saved' : 'idle');
      setNoteSession((n) => n + 1);
      setNoteBlock('normal');
      setNoteMenu(null);
      setIsCreateNoteOpen(true);
      setContextView('notes');
      setContextCollapsed(false);
    });
  };
  const noteBodyRef = useRef<HTMLDivElement>(null);
  const noteInitialHtml = useRef('');
  const [noteSession, setNoteSession] = useState(0);
  const [noteMenu, setNoteMenu] = useState<null | 'block' | 'more'>(null);
  const [noteFormats, setNoteFormats] = useState({ bold: false, italic: false });
  const noteSavedRef = useRef({ title: '', content: '' });
  const [noteSaveStatus, setNoteSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [noteBlock, setNoteBlock] = useState('normal');
  // Persist the open note (no Save button). New notes are created once they have something worth keeping.
  const persistNote = async () => {
    const title = noteFormTitle.trim() || 'New Note';
    // Let the keystroke paint first, then sanitize what is about to be stored (the editor DOM is untrusted).
    await yieldToMain();
    const content = sanitizeNoteHtml(noteFormContent).trim();
    const saved = noteSavedRef.current;
    if (title === saved.title && content === saved.content) {
      setNoteSaveStatus((prev) => (prev === 'saving' ? 'saved' : prev));
      return;
    }
    if (editingNote) {
      noteSavedRef.current = { title, content };
      await onUpdateNote(editingNote.id, title, content);
      setNoteSaveStatus('saved');
    } else if (content || title !== 'New Note') {
      noteSavedRef.current = { title, content };
      await onCreateNote(title, content);
      setEditingNote(null);
      setNoteSaveStatus('saved');
    }
  };
  const flushNote = async () => {
    if (!isCreateNoteOpen) return;
    await persistNote();
    withViewTransition(() => {
      setIsCreateNoteOpen(false);
      setEditingNote(null);
      setNoteSaveStatus('idle');
    });
  };
  const closeNoteEditor = () => {
    withViewTransition(() => {
      setIsCreateNoteOpen(false);
      setEditingNote(null);
      setNoteSaveStatus('idle');
    });
  };
  const flushRef = useRef(flushNote);
  flushRef.current = flushNote;
  const persistRef = useRef(persistNote);
  persistRef.current = persistNote;
  // Debounced autosave for notes that already exist (a new note is created when you leave it).
  useEffect(() => {
    if (!isCreateNoteOpen || !editingNote) return;
    const t = window.setTimeout(async () => {
      await persistRef.current();
      setNoteSaveStatus('saved');
    }, 700);
    return () => window.clearTimeout(t);
  }, [noteFormTitle, noteFormContent, isCreateNoteOpen, editingNote]);

  // WYSIWYG canvas: the browser edits real HTML, the toolbar issues editing commands against the live selection.
  useLayoutEffect(() => {
    const el = noteBodyRef.current;
    if (!isCreateNoteOpen || !el) return;
    el.innerHTML = noteInitialHtml.current;
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* unsupported */ }
  }, [isCreateNoteOpen, noteSession]);
  const noteIsBlank = (el: HTMLElement) => !(el.textContent ?? '').trim() && !el.querySelector('hr,li,pre,img');
  const noteInput = () => {
    const el = noteBodyRef.current;
    if (!el) return;
    const html = noteIsBlank(el) ? '' : el.innerHTML;
    startTransition(() => {
      setNoteFormContent(html);
      setNoteSaveStatus('saving');
    });
    noteSyncFormats();
  };
  const noteExec = (cmd: string, value?: string) => {
    const el = noteBodyRef.current;
    if (!el) return;
    el.focus();
    try { document.execCommand(cmd, false, value); } catch { /* unsupported */ }
    noteInput();
  };
  const noteInsertHtml = (html: string) => noteExec('insertHTML', html);
  const noteSelectedText = () => window.getSelection()?.toString() ?? '';
  const escapeHtmlText = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const noteBlockFormat = (tag: 'p' | 'h1' | 'h2' | 'h3') => { noteExec('formatBlock', tag); setNoteBlock(tag === 'p' ? 'normal' : tag); setNoteMenu(null); };
  const noteLink = () => {
    const url = safeNoteUrl(window.prompt('Link URL', 'https://') ?? '');
    if (url) noteExec('createLink', url);
  };
  const noteInlineCode = () => noteInsertHtml(`<code>${escapeHtmlText(noteSelectedText() || 'code')}</code>`);
  const noteCodeBlock = () => noteInsertHtml(`<pre><code>${escapeHtmlText(noteSelectedText() || 'code')}</code></pre><p><br></p>`);
  const noteClearFormat = () => { noteExec('removeFormat'); noteExec('formatBlock', 'p'); noteExec('unlink'); setNoteMenu(null); };
  const noteMore = (cmd: () => void) => { cmd(); setNoteMenu(null); };
  const noteHistory = (cmd: 'undo' | 'redo') => noteExec(cmd);
  const noteSyncFormats = () => {
    const el = noteBodyRef.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
    try {
      const block = String(document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '');
      let bold = document.queryCommandState('bold');
      // Headings are bold by default; only count Bold as pressed there when the selection sits in an explicit <b>/<strong>.
      if (bold && /^h[1-3]$/.test(block)) {
        const n = sel.anchorNode;
        bold = Boolean((n instanceof Element ? n : n.parentElement)?.closest('b,strong'));
      }
      setNoteFormats({ bold, italic: document.queryCommandState('italic') });
      const v = String(document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '');
      setNoteBlock(/^h[1-3]$/.test(v) ? v : 'normal');
    } catch { /* unsupported (e.g. tests) */ }
  };
  useEffect(() => {
    if (!isCreateNoteOpen) return;
    document.addEventListener('selectionchange', noteSyncFormats);
    return () => document.removeEventListener('selectionchange', noteSyncFormats);
  });
  // Close the block-style / more-formatting popovers on an outside press or Escape.
  useEffect(() => {
    if (!noteMenu) return;
    const onDown = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.('[data-note-menu]')) setNoteMenu(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setNoteMenu(null); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [noteMenu]);
  // A note needs room: widen the study panel to 420px while one is open (and restore it afterwards).
  const noteWidthRestore = useRef<number | null>(null);
  useEffect(() => {
    if (isCreateNoteOpen && contextView === 'notes') {
      if (noteWidthRestore.current === null && ctxW < ctxNoteWidth()) { noteWidthRestore.current = ctxW; setCtxW(ctxNoteWidth()); }
    } else if (noteWidthRestore.current !== null) {
      const prev = noteWidthRestore.current;
      noteWidthRestore.current = null;
      setCtxW((w) => (w === ctxNoteWidth() ? prev : w));
    }
  }, [isCreateNoteOpen, contextView, ctxW]);
  // A shortcut never opens on top of another dialog; the dialog owns the keyboard until it closes.
  const dialogOpen = isAddSourceOpen || isCreateNoteOpen || isSettingsOpen || historyOpen || Boolean(viewingSource) || Boolean(renamingSource);
  const shortcutRef = useRef({ dialogOpen, paletteOpen, toggleSourcesPanel, toggleStudyPanel });
  shortcutRef.current = { dialogOpen, paletteOpen, toggleSourcesPanel, toggleStudyPanel };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const shortcut = matchShortcut(e);
      if (!shortcut) return;
      const state = shortcutRef.current;
      if (shortcut === 'palette') {
        // Closing is also handled here, so the same keys that opened the palette close it.
        if (state.dialogOpen && !state.paletteOpen) return;
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (state.dialogOpen || state.paletteOpen) return;
      e.preventDefault();
      if (shortcut === 'sources') state.toggleSourcesPanel();
      else state.toggleStudyPanel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const buildPaletteItems = (): CommandItem[] => {
    const theme = getThemeSetting();
    const chooseTheme = (next: ThemeSetting) => () => setThemeSetting(next);
    const typeLabel = (t: string) => ({ pdf: 'PDF', url: 'Web page', pasted: 'Pasted text', markdown: 'Markdown', txt: 'Text' }[t] ?? 'Document');
    const items: CommandItem[] = [];
    if (onCreateConversation) {
      items.push({ id: 'a-new-session', group: 'Actions', label: 'New session', keywords: 'conversation chat start', run: () => { void onCreateConversation(); } });
    }
    items.push(
      { id: 'a-add-sources', group: 'Actions', label: 'Add sources', keywords: 'upload paste link pdf file', run: () => setIsAddSourceOpen(true) },
      { id: 'a-new-note', group: 'Actions', label: 'New note', keywords: 'write save', run: () => openNoteEditor(null) },
      { id: 'a-history', group: 'Actions', label: 'Conversation history', keywords: 'sessions past chats', run: () => setHistoryOpen(true) },
      { id: 'a-sources-panel', group: 'Actions', label: isNavCollapsed ? 'Show sources panel' : 'Hide sources panel', keywords: 'sidebar rail', shortcut: 'B', run: toggleSourcesPanel },
      { id: 'a-study-panel', group: 'Actions', label: isContextCollapsed ? 'Show study panel' : 'Hide study panel', keywords: 'notes evidence', shortcut: '\\', run: toggleStudyPanel },
      { id: 'a-theme-light', group: 'Actions', label: 'Switch to light theme', hint: theme === 'light' ? 'Current' : undefined, keywords: 'appearance mode', run: chooseTheme('light') },
      { id: 'a-theme-dark', group: 'Actions', label: 'Switch to dark theme', hint: theme === 'dark' ? 'Current' : undefined, keywords: 'appearance mode', run: chooseTheme('dark') },
      { id: 'a-theme-auto', group: 'Actions', label: 'Match system theme', hint: theme === 'auto' ? 'Current' : undefined, keywords: 'appearance mode automatic', run: chooseTheme('auto') },
      { id: 'a-notebooks', group: 'Actions', label: 'Back to notebooks', keywords: 'library home dashboard', run: onBackToDashboard },
    );
    for (const c of conversations ?? []) {
      items.push({
        id: `c-${c.id}`, group: 'Sessions', label: c.title || 'New session',
        hint: c.id === activeConversationId ? 'Current session' : undefined,
        run: () => onSelectConversation?.(c.id),
      });
    }
    for (const src of readySources) {
      items.push({
        id: `s-${src.id}`, group: 'Sources', label: src.title,
        hint: `${typeLabel(src.source_type)} · ${src.page_count} ${src.page_count === 1 ? 'page' : 'pages'} · open full text`,
        keywords: `${src.file_name} read view`, run: () => { void handleOpenSourceViewer(src); },
      });
    }
    for (const n of notes) {
      items.push({
        id: `n-${n.id}`, group: 'Notes', label: n.title || 'Untitled note',
        hint: noteToText(n.content).replace(/\s+/g, ' ').trim().slice(0, 80) || undefined,
        keywords: noteToText(n.content).slice(0, 400), run: () => openNoteEditor(n),
      });
    }
    return items;
  };

  // --------------------------------------------------------------------------
  // CITATION INSPECTION HANDLERS
  // --------------------------------------------------------------------------
  // Show a view in the materials panel, opening it (as an overlay where it is one) if it is closed.
  const openContext = (view?: 'notes' | 'evidence' | 'retrieval') => {
    if (view) { setContextView(view); if (reader) { setReader(null); setReaderExpanded(false); } }
    setIsContextCollapsed(false);
  };
  // Sources live in the left panel; show it (as a drawer on narrow screens) when something points at them.
  const openSources = () => {
    setIsNavCollapsed(false);
    window.setTimeout(() => {
      const el = navPanelRef.current;
      if (el) { el.inert = false; if (isCompact) el.focus(); }
    }, 0);
  };

  const handleSelectCitation = (cit: Citation, messageId: string, options?: { keepOpener?: boolean }) => {
    const active = document.activeElement;
    if (!options?.keepOpener) {
      evidenceOpenerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    try {
      // :focus-visible matches only when the citation was activated from the keyboard.
      if (active instanceof HTMLElement && active.matches(':focus-visible') && !options?.keepOpener) {
        setEvidenceFocusTick((t) => t + 1);
      }
    } catch {
      /* selector unsupported: skip */
    }
    setSelectedCitation({ ...cit, messageId });
    openContext('evidence');
    if (!messages.some((m) => m.id === messageId)) setCardFocusTick((t) => t + 1);
    loadPassages(cit);
  };

  // Keep newly opened evidence in view; smooth scrolling only when motion is welcome.
  useEffect(() => {
    if (suppressEvidenceScrollRef.current) { suppressEvidenceScrollRef.current = false; return; }
    const el = evidenceRef.current;
    if (!el || typeof el.scrollIntoView !== 'function') return;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Evidence taller than the thread area is aligned to its top, so Prev/Next/Close stay reachable.
    const scroller = el.closest('.thread-scroll-container');
    const tall = scroller ? el.getBoundingClientRect().height > scroller.clientHeight - 96 : false;
    el.scrollIntoView({ block: tall ? 'start' : 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [selectedCitation?.messageId, selectedCitation?.file, selectedCitation?.page]);

  // A citation chosen from a note or the retrieval map has no answer to anchor to: focus its card in the panel.
  useEffect(() => {
    if (cardFocusTick > 0) evidenceRef.current?.focus();
  }, [cardFocusTick]);

  // Collapse the evidence and hand focus back to the control that opened it.
  const closeEvidence = () => {
    const opener = evidenceOpenerRef.current;
    evidenceOpenerRef.current = null;
    setSelectedCitation(null);
    setTimeout(() => {
      if (opener && opener.isConnected) opener.focus();
      else chatAreaRef.current?.focus();
    }, 0);
  };

  const handleSelectPassageFromRetrieval = (fileName: string, pageNumber: number) => {
    const matchingSource = sources.find((s) => s.file_name === fileName || s.title === fileName);
    const cit: Citation = {
      file: fileName,
      page: pageNumber,
      source_id: matchingSource?.id,
      source_version: matchingSource?.version ?? 1,
    };
    handleSelectCitation(cit, '');
  };

  const loadPassages = async (cit: Citation) => {
    const requestId = ++passageRequestRef.current;
    const isLatest = () => requestId === passageRequestRef.current;
    const matchingSource =
      sources.find((s) => s.id === cit.source_id) ??
      (cit.source_id ? undefined : sources.find((s) => normalizeFileName(s.file_name) === normalizeFileName(cit.file)));
    const isHistoricalOnly =
      Boolean(cit.source_id && !matchingSource) ||
      Boolean(cit.source_id && matchingSource && typeof cit.source_version === 'number' && matchingSource.version !== cit.source_version);

    if (isHistoricalOnly) {
      setPassages([]);
      setPassageLoading(false);
      return;
    }

    // A file that is not among this notebook's sources cannot be read back: do not look it up by name alone.
    if (!matchingSource) {
      setPassages([]);
      setPassageLoading(false);
      return;
    }

    const cacheKey = `${subject.id}:${matchingSource.id}:v${matchingSource.version ?? 0}:${cit.page}`;
    const cached = passageCache.current.get(cacheKey);
    if (cached) {
      setPassages(cached);
      setPassageLoading(false);
      return;
    }

    setPassageLoading(true);
    try {
      const lookupFile = matchingSource.file_name || cit.file;
      // Scoped to this notebook and source, so a same-named file elsewhere can never be shown.
      const data = await api.getPassages(lookupFile, cit.page, subject.id, matchingSource.id);
      // Backup guard: deduplicate passages by chunk_index & text
      const seen = new Set<string>();
      const deduped = data.filter((p) => {
        const key = `${p.chunk_index ?? ''}:${(p.text || p.chunk_text || '').trim()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      passageCache.current.set(cacheKey, deduped);
      if (isLatest()) setPassages(deduped);
    } catch {
      if (isLatest()) setPassages([]);
    } finally {
      if (isLatest()) setPassageLoading(false);
    }
  };

  // Active message & citations for right passage inspector
  const activeMessage = selectedCitation
    ? messages.find((m) => m.id === selectedCitation.messageId)
    : [...messages].reverse().find((m) => m.role === 'assistant' && m.citations && m.citations.length > 0);

  const activeCitations = activeMessage?.citations || [];
  const activeRetrieved = activeMessage?.retrieved || [];

  // Citation stepping in the right panel (Prev / Next)
  const currentCitationIndex = selectedCitation
    ? activeCitations.findIndex(
        (c) =>
          normalizeFileName(c.file) === normalizeFileName(selectedCitation.file) &&
          c.page === selectedCitation.page
      )
    : -1;

  const hasPreviousCitation = currentCitationIndex > 0;
  const hasNextCitation = currentCitationIndex >= 0 && currentCitationIndex < activeCitations.length - 1;

  const handlePreviousCitation = () => {
    if (hasPreviousCitation && selectedCitation?.messageId) {
      const prevCit = activeCitations[currentCitationIndex - 1];
      withViewTransition(() => {
        handleSelectCitation(prevCit, selectedCitation.messageId, { keepOpener: true });
      });
    }
  };

  const handleNextCitation = () => {
    if (hasNextCitation && selectedCitation?.messageId) {
      const nextCit = activeCitations[currentCitationIndex + 1];
      withViewTransition(() => {
        handleSelectCitation(nextCit, selectedCitation.messageId, { keepOpener: true });
      });
    }
  };

  // Passage chunk highlight calculation
  const retrievedMatchingChunks = selectedCitation
    ? activeRetrieved.filter((r) => {
        const rFile = r.file || r.file_name;
        const rPage = r.page !== undefined ? r.page : r.page_number;
        const rText = r.text || r.chunk_text;
        return (
          rFile &&
          normalizeFileName(rFile) === normalizeFileName(selectedCitation.file) &&
          rPage === selectedCitation.page &&
          typeof rText === 'string' &&
          rText.trim().length > 0
        );
      })
    : [];

  const hasRetrievedChunkText = retrievedMatchingChunks.length > 0;

  const isChunkHighlighted = (chunkText: string, chunkIndex?: number): boolean => {
    if (!hasRetrievedChunkText) return false;
    return retrievedMatchingChunks.some((r) => {
      const rText = (r.text || r.chunk_text || '').trim();
      if (!rText) return false;
      const cText = chunkText.trim();
      return (
        cText.includes(rText) ||
        rText.includes(cText) ||
        (typeof chunkIndex === 'number' &&
          typeof (r as any).chunk_index === 'number' &&
          chunkIndex === (r as any).chunk_index)
      );
    });
  };

  // Historical citation detection
  const matchedSource = selectedCitation?.source_id && sources
    ? sources.find((s) => s.id === selectedCitation.source_id)
    : undefined;
  const isSourceDeleted = Boolean(selectedCitation?.source_id && sources && !matchedSource);
  const isSourceReplaced = Boolean(
    selectedCitation?.source_id &&
    matchedSource &&
    typeof selectedCitation.source_version === 'number' &&
    matchedSource.version !== selectedCitation.source_version
  );

  // --------------------------------------------------------------------------
  // SOURCE READER
  // --------------------------------------------------------------------------
  const [readerAnnouncement, setReaderAnnouncement] = useState('');
  const [readerFocusTick, setReaderFocusTick] = useState(0);
  const returnTargetRef = useRef<ReturnTarget | null>(null);
  const readerExpandRef = useRef<HTMLButtonElement>(null);
  const readerHeadingRef = useRef<HTMLHeadingElement>(null);
  const readerSource = reader ? sources.find((s) => s.id === reader.sourceId) : undefined;
  const readerRemoved = Boolean(reader && !readerSource);
  const readerText = useSourceText(subject.id, reader && readerSource ? reader.sourceId : null, readerSource?.version ?? null, Boolean(reader && readerSource));
  const readerNotice: ReaderNotice = !reader || reader.mode === 'cited' ? 'none' : reader.replaced ? 'replaced' : 'current';

  // Text to look for on the page: the full chunks saved with the answer, else the saved excerpt.
  const readerPassages = React.useMemo<PassageInput[]>(() => {
    if (!reader || reader.mode !== 'cited' || !reader.cite) return [];
    const cit = reader.cite.citation;
    const msg = messages.find((m) => m.id === reader.cite!.messageId);
    const chunks = (msg?.retrieved ?? []).filter((r) => {
      const file = r.file || r.file_name;
      const pg = r.page !== undefined ? r.page : r.page_number;
      const t = r.text || r.chunk_text;
      return Boolean(file) && normalizeFileName(file as string) === normalizeFileName(cit.file) && pg === reader.page && typeof t === 'string' && t.trim().length > 0;
    });
    if (chunks.length) return chunks.map((r) => ({ text: (r.text || r.chunk_text) as string, kind: 'passage' as const }));
    return cit.excerpt && cit.page === reader.page ? [{ text: cit.excerpt, kind: 'excerpt' as const }] : [];
  }, [reader, messages]);

  const announce = (message: string) => {
    setReaderAnnouncement('');
    window.setTimeout(() => setReaderAnnouncement(message), 30);
  };
  const readerScroller = () => chatAreaRef.current?.querySelector<HTMLElement>('.thread-scroll-container') ?? null;
  const prefersReducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Accepts a getter so the target is looked up after React has re-rendered.
  const focusSoon = (target: HTMLElement | null | undefined | (() => HTMLElement | null | undefined)) => window.setTimeout(() => {
    const el = typeof target === 'function' ? target() : target;
    if (el && el.isConnected) el.focus({ preventScroll: true });
  }, 0);

  const readerActionFor = (cit: ActiveCitation | null) => {
    if (!cit || !cit.source_id) return null;
    const src = sources.find((s) => s.id === cit.source_id);
    if (!src || src.status !== 'ready') return null;
    const replaced = typeof cit.source_version === 'number' && src.version !== cit.source_version;
    return replaced
      ? { label: `Open current version in reader (v${src.version})`, onOpen: () => openReader(cit, 'current') }
      : { label: 'Open in reader', onOpen: () => openReader(cit, 'cited') };
  };
  const readerAction = readerActionFor(selectedCitation);

  const openReader = (cit: ActiveCitation, intent: 'cited' | 'current') => {
    const src = cit.source_id ? sources.find((s) => s.id === cit.source_id) : undefined;
    if (!src) return;
    startReader(src, cit.page, intent, intent === 'cited' ? (cit.source_version ?? src.version) : src.version, { messageId: cit.messageId, citation: cit });
  };
  // Opening a source to read it, with no citation: first page, no passage mark.
  const openSourceInReader = (src: Source) => {
    if (src.status !== 'ready') return;
    startReader(src, 1, 'cited', src.version, null);
    // The navigation drawer would cover the sheet on small screens.
    if (isCompact) setIsNavCollapsed(true);
  };
  const startReader = (
    src: Source, page: number, intent: 'cited' | 'current', version: number,
    cite: { messageId: string; citation: ActiveCitation } | null,
  ) => {
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    let keyboard = false;
    try { keyboard = active instanceof HTMLElement && active.matches(':focus-visible'); } catch { /* unsupported */ }
    returnTargetRef.current = { opener, anchorTurnId: null, anchorOffset: 0, scrollTop: 0, userScrolled: false };
    setReader({
      sourceId: src.id,
      page,
      mode: intent,
      version,
      cite,
      // Remembered across a reader opened on top of a reader, so closing restores the original state.
      panelWasCollapsed: reader ? reader.panelWasCollapsed : isContextCollapsed,
      replaced: false,
    });
    setReaderExpanded(false);
    // Opening the panel for the reader is temporary: the saved panel preference is never written.
    if (isContextCollapsed) setContextCollapsed(false, false);
    announce(intent === 'current' ? `Opened current version of ${src.title}` : `Opened ${src.title}`);
    if (keyboard) setReaderFocusTick((t) => t + 1);
  };
  useEffect(() => {
    if (readerFocusTick > 0) focusSoon(readerHeadingRef.current);
  }, [readerFocusTick]);

  const closeReader = () => {
    const wasCollapsed = reader?.panelWasCollapsed ?? false;
    const opener = returnTargetRef.current?.opener;
    returnTargetRef.current = null;
    setReader(null);
    setReaderExpanded(false);
    if (wasCollapsed) setContextCollapsed(true, false);
    announce('Reader closed');
    // The opener may have been replaced while the reader was open (the pointer stands in for the button
    // while expanded), so fall back to the current "Open source" button, then the evidence block.
    const back = () => (opener && opener.isConnected && !opener.closest('[inert]') ? opener : null)
      ?? document.querySelector<HTMLElement>('[data-testid="open-reader-btn"]')
      ?? evidenceRef.current ?? chatAreaRef.current;
    if (wasCollapsed) {
      focusSoon(() => back() ?? contextToggleRef.current);
    } else {
      focusSoon(() => back() ?? contextPanelRef.current);
    }
  };

  const expandReader = () => {
    const scroller = readerScroller();
    const t = returnTargetRef.current ?? { opener: null, anchorTurnId: null, anchorOffset: 0, scrollTop: 0, userScrolled: false };
    t.userScrolled = false;
    if (scroller) {
      const top = scroller.getBoundingClientRect().top;
      const turn = Array.from(scroller.querySelectorAll<HTMLElement>('[data-turn-id]')).find((el) => el.getBoundingClientRect().top >= top);
      t.scrollTop = scroller.scrollTop;
      t.anchorTurnId = turn?.dataset.turnId ?? null;
      t.anchorOffset = turn ? turn.getBoundingClientRect().top - top : 0;
    }
    returnTargetRef.current = t;
    setReaderExpanded(true);
    announce('Reader expanded');
  };

  const collapseReader = () => {
    if (!readerExpanded) return;
    const scroller = readerScroller();
    const t = returnTargetRef.current;
    const slot = chatAreaRef.current?.closest('.workspace-layout')?.querySelector<HTMLElement>('.context-slot') ?? null;
    if (scroller) scroller.style.overflowAnchor = 'none'; // the browser must not move the scroll while the width animates
    setReaderExpanded(false);
    announce('Returned to the answer');

    const finish = () => {
      if (scroller) {
        if (t && !t.userScrolled) {
          const anchor = t.anchorTurnId
            ? Array.from(scroller.querySelectorAll<HTMLElement>('[data-turn-id]')).find((el) => el.dataset.turnId === t.anchorTurnId)
            : undefined;
          if (anchor) {
            scroller.scrollTop += anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top - t.anchorOffset;
          } else if (t.scrollTop <= scroller.scrollHeight - scroller.clientHeight) {
            scroller.scrollTop = t.scrollTop;
          }
        }
        scroller.style.overflowAnchor = '';
      }
      // Focus moves after the scroll, so it cannot scroll the answer away from the restored place.
      const target = [readerExpandRef.current, evidenceRef.current, chatAreaRef.current].find((el) => el && el.isConnected);
      target?.focus({ preventScroll: true });
    };

    // Wait for the panel's width transition; an overlay or reduced motion has none to wait for.
    if (isContextOverlay || prefersReducedMotion() || !slot) {
      window.setTimeout(() => window.requestAnimationFrame(finish), 0);
      return;
    }
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      slot.removeEventListener('transitionend', onEnd);
      window.clearTimeout(timer);
      finish();
    };
    const onEnd = (e: TransitionEvent) => { if (e.target === slot && e.propertyName === 'width') run(); };
    slot.addEventListener('transitionend', onEnd);
    const duration = (parseFloat(getComputedStyle(slot).transitionDuration) || 0.25) * 1000;
    const timer = window.setTimeout(run, duration + 50);
  };

  // Escape steps back one level: expanded reader, then the reader/panel (overlay), then nothing when docked.
  const handlePanelEscape = () => {
    if (readerExpanded) collapseReader();
    else if (reader) closeReader();
    else closeContextPanel();
  };
  panelEscapeRef.current = handlePanelEscape;
  readerEscapeRef.current = () => { if (readerExpanded) collapseReader(); };

  const onNavToggle = () => {
    if (navHiddenByReader) {
      collapseReader();
      if (isNavCollapsed) setNavCollapsed(false);
    } else if (isNavCollapsed) {
      setNavCollapsed(false);
    } else {
      closeNavPanel();
    }
  };

  const goToReaderPage = (page: number) => {
    if (!reader) return;
    setReader({ ...reader, page });
    const order = readerText.order;
    const total = readerSource && readerSource.page_count > 0 ? readerSource.page_count : order.length;
    const unit = readerSource && readerSource.source_type !== 'pdf' ? 'Section' : 'Page';
    announce(`${unit} ${page}${total ? ` of ${total}` : ''}`);
  };

  // The student scrolling the conversation themselves (not the reflow) cancels the scroll restore.
  useEffect(() => {
    if (!readerExpanded) return;
    const scroller = readerScroller();
    if (!scroller) return;
    const mark = () => { if (returnTargetRef.current) returnTargetRef.current.userScrolled = true; };
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) mark();
    };
    const onPointer = (e: PointerEvent) => {
      // Only a press on the scrollbar itself, not on content inside the scroller.
      if (e.target === scroller) mark();
    };
    scroller.addEventListener('wheel', mark, { passive: true });
    scroller.addEventListener('touchmove', mark, { passive: true });
    scroller.addEventListener('keydown', onKey);
    scroller.addEventListener('pointerdown', onPointer);
    return () => {
      scroller.removeEventListener('wheel', mark);
      scroller.removeEventListener('touchmove', mark);
      scroller.removeEventListener('keydown', onKey);
      scroller.removeEventListener('pointerdown', onPointer);
    };
  }, [readerExpanded]);

  // A source opened without a citation starts at its first stored page, whatever that number is.
  useEffect(() => {
    if (reader && !reader.cite && readerText.status === 'ready' && !readerText.order.includes(reader.page)) {
      setReader({ ...reader, page: readerText.order[0] });
    }
  }, [reader, readerText.status, readerText.order]);

  // The reader closes with its conversation; a replaced source switches to its current text.
  useEffect(() => {
    setReader(null);
    setReaderExpanded(false);
  }, [activeConversationId]);
  useEffect(() => {
    if (reader && reader.mode === 'cited' && readerSource && readerSource.version !== reader.version) {
      setReader({ ...reader, mode: 'current', version: readerSource.version, replaced: true });
    }
  }, [reader, readerSource]);

  // --------------------------------------------------------------------------
  // ANSWER ACTIONS
  // --------------------------------------------------------------------------
  const handleCopyAnswer = (text: string, msgId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2500);
  };

  const handleSaveToNote = async (msg: MessageItem) => {
    if (savingNoteMsgId === msg.id || savedNoteMsgId === msg.id) return;
    setSavingNoteMsgId(msg.id);
    try {
      await onSaveAnswerAsNote(msg);
      setSavedNoteMsgId(msg.id);
      openContext('notes');
      setTimeout(() => setSavedNoteMsgId(null), 2500);
    } finally {
      setSavingNoteMsgId(null);
    }
  };

  const composerScope: ComposerScope = {
    sources,
    selectedSourceIds,
    onToggleSource: (id) => handleToggleSource(id),
    onSelectAllReady: () => handleSelectAllSources(),
    onClearSources: () => handleClearSources(),
    onOpenMaterials: () => openSources(),
  };

  // Whether a cited source has since been removed or replaced, so its marker can say so.
  const citationStateOf = (c: Citation): 'replaced' | 'removed' | undefined => {
    if (!c.source_id) return undefined;
    const src = sources.find((x) => x.id === c.source_id);
    if (!src) return 'removed';
    return typeof c.source_version === 'number' && src.version !== c.source_version ? 'replaced' : undefined;
  };

  const handleSeeRetrieval = (messageId: string) => {
    setSelectedRetrievalMessageId(messageId);
    openContext('retrieval');
    setTimeout(() => {
      const retrievalTabBtn = document.querySelector<HTMLButtonElement>(
        '[data-testid="right-panel-tab-evidence"]'
      );
      if (retrievalTabBtn) {
        retrievalTabBtn.focus();
      } else {
        contextPanelRef.current?.focus();
      }
    }, 0);
  };

  // Filtered sources & notes
  const displayTitleFor = (src: Source) => (autoRename ? autoCleanTitle(src) : src.title);
  const filteredSources = sources.filter((s) => {
    if (!sourceSearch.trim()) return true;
    const q = sourceSearch.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.file_name.toLowerCase().includes(q) || displayTitleFor(s).toLowerCase().includes(q);
  });
  if (sourceSort) {
    filteredSources.sort((a, b) => {
      if (sourceSort === 'title') return displayTitleFor(a).localeCompare(displayTitleFor(b), undefined, { sensitivity: 'base', numeric: true });
      return (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);
    });
  }
  const allReadySelected = readySources.length > 0 && readySources.every((s) => selectedSourceIds.includes(s.id));
  const someReadySelected = readySources.some((s) => selectedSourceIds.includes(s.id));
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someReadySelected && !allReadySelected;
  });
  const toggleAutoRename = () => {
    const next = !autoRename;
    setAutoRename(next);
    try { window.localStorage.setItem(AUTO_RENAME_KEY, next ? '1' : '0'); } catch { /* choice applies for this visit */ }
  };
  const toggleSelectAll = () => onSelectSources(allReadySelected ? [] : readySources.map((s) => s.id));

  const filteredNotes = notes.filter((n) => {
    if (!noteSearch.trim()) return true;
    const q = noteSearch.toLowerCase();
    return n.title.toLowerCase().includes(q) || noteToText(n.content).toLowerCase().includes(q);
  });


  return (
    <div className={`workspace-root workspace-layout${resizing ? ' is-resizing' : ''}`} ref={rootRef}
      style={{
        ...(isCompact ? {} : { '--nav-w': `${navW}px` }),
        ...(isContextOverlay || reader ? {} : { '--ctx-w': `${ctxW}px` }),
      } as React.CSSProperties}
      data-nav-open={!isNavCollapsed && !navHiddenByReader} data-context-open={!isContextCollapsed}
      data-note-open={contextView === 'notes' && isCreateNoteOpen && !reader ? 'true' : undefined}
      data-reader={reader ? (readerExpanded ? 'expanded' : 'compact') : undefined}>
      <div className="sr-only" role="status" aria-live="polite" data-testid="reader-live-region">{readerAnnouncement}</div>
      <input
        ref={replaceFileInputRef}
        type="file"
        accept=".pdf,.txt,.md,.markdown"
        style={{ display: 'none' }}
        onChange={handleReplaceFileChange}
      />

      <div className="workspace-subject-pill workspace-subject-pill-name workspace-title-measure"
        ref={titleMeasureRef} aria-hidden="true" data-title={`${subject.name} ${subject.course_code || ''}`} />
      <header className="workspace-top-bar workspace-control-bar" ref={headerRef}>
        <div className="workspace-brand" ref={brandRef}>
          <button type="button" className="workspace-logo-btn workspace-back-btn" ref={backButtonRef}
            onClick={onBackToDashboard} title="All notebooks" aria-label="Back to notebooks">
            <BrandLogo size={22} />
          </button>
        </div>
        <div className="workspace-breadcrumb">
          {!titleBelowBar && (
            <div className="workspace-subject-pill workspace-notebook-identity">
              <NotebookTitle name={subject.name} onRename={onRenameSubject} />
            </div>
          )}
        </div>
        <div className="workspace-top-right workspace-essential-actions" ref={actionsRef}>
          <BackendStatus className="backend-status-bar" />
          <button type="button" className="workspace-history-btn" onClick={() => setPaletteOpen(true)} aria-label="Search and commands"
            title={`Search and commands (${shortcutLabel('K')})`} aria-haspopup="dialog" data-testid="open-command-palette">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg><span>Search</span><kbd className="workspace-kbd" aria-hidden="true">{shortcutLabel('K')}</kbd>
          </button>
          <button type="button" className="workspace-history-btn" onClick={() => setHistoryOpen(true)} aria-label="Conversation history" title="Conversation history">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 119 10M3 4v7h7M12 7v5l3 2"/></svg>
          </button>
          <div className="workspace-actions-menu" ref={menuRootRef}>
            <button type="button" ref={menuButtonRef} className="btn-icon workspace-top-icon-btn"
              aria-label="Notebook actions" title="Notebook actions" aria-haspopup="menu" aria-expanded={isActionsOpen}
              aria-controls="workspace-actions-menu" onClick={() => setIsActionsOpen(!isActionsOpen)}
              onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setIsActionsOpen(true); } }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" aria-hidden="true">
                <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
              </svg>
            </button>
            {isActionsOpen && (
              <div id="workspace-actions-menu" className="notebook-overflow-menu workspace-overflow-menu"
                ref={menuRef} role="menu" aria-label="Notebook actions" onKeyDown={handleMenuKeys}>
                <button type="button" className="notebook-menu-item" role="menuitem"
                  onClick={() => { closeActions(); openSettings(); }}>Notebook settings</button>
                <button type="button" className="notebook-menu-item" role="menuitem" data-testid="guest-workspace-badge"
                  title="Your notebook workspace is private to this browser."
                  onClick={() => { closeActions(); onResetWorkspace?.(); }}>{currentUser?.email || 'Guest Workspace'}</button>
                {isDemoMode && <span className="demo-pill" data-testid="demo-pill">Public demo</span>}
              </div>
            )}
          </div>
        </div>
      </header>
      {titleBelowBar && (
        <div className="workspace-notebook-heading">
          <div className="workspace-subject-pill workspace-notebook-identity">
            <NotebookTitle name={subject.name} onRename={onRenameSubject} />
          </div>
        </div>
      )}

      {/* ======================================================================
          3-COLUMN WORKSPACE BODY
          ====================================================================== */}
      <div className="workspace-body">
        {(contextOverlayOpen || navDrawerOpen) && (
          <div className="sidebar-overlay workspace-panels-overlay" aria-hidden="true"
            onClick={() => {
              if (contextOverlayOpen) closeContextPanel();
              else closeNavPanel();
            }} />
        )}
        {/* LEFT: sources (notebook, add, find, selection, list) */}
        <div className={`nav-slot ${isNavCollapsed || navHiddenByReader ? 'is-collapsed' : ''}`}>
          {isNavCollapsed && resizeHandle('left', false)}
          {(isNavCollapsed || navHiddenByReader) && (
            <div className="nav-expand-rail" role="toolbar" aria-label="Sources rail" aria-orientation="vertical">
              <button type="button" ref={navToggleRef} className="rail-icon-btn workspace-nav-toggle" onClick={onNavToggle}
                title={`Show sources panel (${shortcutLabel('B')})`}
                aria-label="Toggle sources panel" aria-expanded={false} aria-controls="workspace-nav-panel">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M9 3v18" />
                </svg>
              </button>
              <button type="button" className="rail-icon-btn" onClick={() => setIsAddSourceOpen(true)}
                aria-label="Add sources" title="Add sources">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              {sources.length > 0 && <span className="nav-rail-divider" aria-hidden="true" />}
              <div className="nav-rail-sources">
                {sources.map((src) => {
                  const t = (src.source_type || 'doc').toLowerCase();
                  const info = TYPE_INFO[t] || { badge: 'DOC', label: 'Document' };
                  const tip = `${displayTitleFor(src)}${src.status === 'ready' && src.page_count > 0 ? ` · ${src.page_count} ${src.page_count === 1 ? 'page' : 'pages'}` : ''}`;
                  return (
                    <button key={src.id} type="button" className={`rail-icon-btn rail-source-btn ${selectedSourceIds.includes(src.id) ? 'is-selected' : ''}`}
                      data-tip={tip} aria-label={tip} aria-pressed={selectedSourceIds.includes(src.id)}
                      disabled={src.status !== 'ready'} onClick={() => handleToggleSource(src.id)}>
                      <SourceTypeIcon type={t} badge={info.badge} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <aside className="workspace-nav workspace-sources-rail sources-panel" id="workspace-nav-panel" aria-label="Sources"
            aria-hidden={isNavCollapsed || navHiddenByReader} ref={navPanelRef} tabIndex={-1}>
            {!isNavCollapsed && resizeHandle('left', true)}
            <div className="rail-header sources-panel-header">
              <div className="rail-title-group">
                <h2 className="rail-title">Sources<span className="sr-only"> ({sources.length})</span></h2>
                <span className="rail-count-pill" aria-hidden="true">{sources.length}</span>
              </div>
              <button type="button" className="rail-icon-btn workspace-nav-toggle" onClick={onNavToggle}
                title={`Hide sources panel (${shortcutLabel('B')})`}
                aria-label="Toggle sources panel" aria-expanded={!isNavCollapsed && !navHiddenByReader} aria-controls="workspace-nav-panel">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M9 3v18" />
                </svg>
              </button>
            </div>
            <div
              className={`sources-panel-body ${isPanelDragOver ? 'is-drag-over' : ''}`}
              onDragOver={(e) => {
                if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
                e.preventDefault();
                setIsPanelDragOver(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsPanelDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsPanelDragOver(false);
                const files = Array.from(e.dataTransfer?.files || []);
                if (files.length > 0) {
                  setDroppedFiles(files);
                  setIsAddSourceOpen(true);
                }
              }}
            >
              <div className="sources-search-row">
                {sources.length > 0 && (
                  <label className="rail-find sources-search">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="20" y1="20" x2="16.5" y2="16.5" /></svg>
                    <input type="search" placeholder="Find in sources" aria-label="Find in sources" value={sourceSearch}
                      onChange={(e) => setSourceSearch(e.target.value)} />
                  </label>
                )}
                <button type="button" className="sources-add-btn" onClick={() => setIsAddSourceOpen(true)} data-testid="add-source-btn"
                  aria-label="Add sources" title="Add sources">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>

              {sources.length > 0 && (
                <div className="sources-toolbar">
                  <div className="sources-toolbar-left">
                    <button type="button" className={`sources-tool-btn ${autoRename ? 'is-active' : ''}`} onClick={toggleAutoRename}
                      aria-label={autoRename ? 'Restore original filenames' : 'Clean up source titles'} aria-pressed={autoRename} data-tip={autoRename ? 'Restore original filenames' : 'Clean up source titles'}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
                      </svg>
                    </button>
                    <div className="sources-sort" ref={sortRootRef}>
                      <button type="button" className={`sources-tool-btn ${isSortOpen || sourceSort ? 'is-active' : ''}`} aria-label="Sort sources"
                        aria-haspopup="menu" aria-expanded={isSortOpen} title="Sort sources" onClick={() => setIsSortOpen((o) => !o)}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                          <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="15" y2="12" /><line x1="4" y1="17" x2="10" y2="17" />
                        </svg>
                      </button>
                      {isSortOpen && (
                        <div className="sources-sort-menu" role="menu" aria-label="Sort sources">
                          {SORT_OPTIONS.map((o) => (
                            <button key={o.value} type="button" role="menuitemradio" aria-checked={sourceSort === o.value}
                              className={`sources-sort-item ${sourceSort === o.value ? 'is-selected' : ''}`}
                              onClick={() => { setSourceSort(o.value); setIsSortOpen(false); }}>
                              <span>{o.label}</span>
                              {sourceSort === o.value && (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <label className="sources-select-all">
                    <span>Select all</span>
                    <input ref={selectAllRef} type="checkbox" className="source-row-checkbox" checked={allReadySelected}
                      disabled={readySources.length === 0} onChange={toggleSelectAll} aria-label="Select all sources" data-testid="select-all-sources" />
                  </label>
                </div>
              )}

              {sources.length === 0 ? (
                <button type="button" className="sources-drop-zone" onClick={() => setIsAddSourceOpen(true)} data-testid="sources-drop-zone">
                  <svg className="sources-drop-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span className="sources-drop-title">Drop PDFs here or click to browse</span>
                  <span className="sources-drop-hint">PDFs, links, pasted text</span>
                </button>
              ) : (
                <>
                  <p className="sr-only" aria-live="polite">{selectedSourceIds.length} of {readySources.length} selected</p>
                  <div className="sources-list-scroll sources-list">
                    {filteredSources.length === 0 ? (
                      <p className="sidebar-empty-box"><EmptyStateIcon />No sources matching search.</p>
                    ) : (
                      <ul className="workspace-sources-ul sources-list-items">
                        {filteredSources.map((s) => (
                          <SourceRow
                            key={s.id}
                            source={s}
                            displayTitle={displayTitleFor(s)}
                            isSelected={selectedSourceIds.includes(s.id)}
                            onToggle={() => handleToggleSource(s.id)}
                            onView={() => handleOpenSourceViewer(s)}
                            onRead={() => openSourceInReader(s)}
                            onRename={() => { setRenamingSource(s); setNewSourceTitle(s.title); }}
                            onRetry={() => onRetrySource(s.id)}
                            onReplace={() => handleTriggerReplace(s.id)}
                            onRemove={() => {
                              if (window.confirm(`Remove source "${s.title}" from this notebook?`)) onDeleteSource(s.id);
                            }}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}

              <div className="rail-footer">
                <form className="sources-web-search" role="search" aria-label="Add a web page as a source" onSubmit={handleWebSearch}>
                  <input type="search" className="sources-web-input" placeholder="Paste a link to add it"
                    aria-label="Search the web for new sources" value={webQuery}
                    onChange={(e) => { setWebQuery(e.target.value); if (webHint) setWebHint(''); }} />
                  <div className="sources-web-controls">
                    <button type="submit" className="sources-web-go" aria-label="Add this link as a source" title="Add this link as a source">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="13 6 19 12 13 18" />
                      </svg>
                    </button>
                  </div>
                  {webHint && <p className="sources-web-hint" role="status">{webHint}</p>}
                </form>
              </div>
            </div>
          </aside>
        </div>

        {/* --------------------------------------------------------------------
            2. CENTER CHAT AREA: ChatGPT / Claude Reading Experience
            -------------------------------------------------------------------- */}
        <section className="workspace-main-area" aria-label="Chat" ref={chatAreaRef} tabIndex={-1} data-focus-fallback>
          {/* Conversation Thread */}
          {historyLoading ? (
            <div className="empty-state-scroll-container" role="status" aria-live="polite" aria-label="Loading conversation history" data-testid="chat-history-loading">
              <div className="empty-state-centered-box" style={{ maxWidth: '560px', width: '100%', alignItems: 'stretch' }}>
                <div className="skeleton-loader" aria-hidden="true" style={{ width: '100%' }}>
                  <span className="skeleton-line line-short" style={{ width: '35%', marginBottom: '14px' }} />
                  <span className="skeleton-line line-long" style={{ width: '92%', marginBottom: '8px' }} />
                  <span className="skeleton-line line-long" style={{ width: '78%', marginBottom: '28px' }} />
                  <span className="skeleton-line line-short" style={{ width: '28%', marginBottom: '14px' }} />
                  <span className="skeleton-line line-long" style={{ width: '88%', marginBottom: '8px' }} />
                  <span className="skeleton-line line-med" style={{ width: '64%' }} />
                </div>
              </div>
            </div>
          ) : sources.length === 0 ? (
            <div className="empty-state-scroll-container">
              <div className="empty-state-centered-box workspace-zero-sources-box source-onboarding">
                <div className="source-onboarding-mark"><ReferenceIcon name="file" size={24} /></div>
                <div className="source-onboarding-intro">
                  <p className="source-onboarding-eyebrow">YOUR {subject.name} NOTEBOOK</p>
                  <h1 className="empty-state-heading" data-testid="empty-state-heading">Make room for understanding.</h1>
                  <p className="empty-state-subtext">Bring your materials. Connect the ideas. Find answers you can trace back to the source.</p>
                </div>
                <div className="source-onboarding-upload">
                  <div className="source-onboarding-upload-row">
                    <span className="source-onboarding-upload-icon"><ReferenceIcon name="upload" size={22} /></span>
                    <div><h2>Start with a source</h2><p>PDFs, lecture slides, readings, and more</p></div>
                    <button type="button" className="btn btn-primary" onClick={() => openSourceEntry('upload')} data-testid="add-first-source-btn">+ Add source</button>
                  </div>
                  <p className="source-onboarding-hint">Add your first source to start a conversation grounded in your materials.</p>
                </div>
                <div className="source-onboarding-alternatives">
                  <button type="button" onClick={() => openSourceEntry('url')}><ReferenceIcon name="globe" /><span><strong>Paste a link</strong><small>Articles &amp; web pages</small></span><span aria-hidden="true">↗</span></button>
                  <button type="button" onClick={() => openSourceEntry('paste')}><ReferenceIcon name="text" /><span><strong>Add text</strong><small>Notes &amp; copied content</small></span><span aria-hidden="true">↗</span></button>
                </div>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-state-scroll-container">
              <div className="empty-state-centered-box">
                <div className="empty-state-brand-mark" aria-hidden="true">
                  <EmptyStateIcon />
                </div>
                <h1 className="empty-state-heading" data-testid="empty-state-heading">
                  What would you like to understand?
                </h1>
                <p className="empty-state-subtext">
                  Ask about your course materials. Every answer starts with your selected sources.
                </p>

                {/* Starter questions */}
                {readySources.length > 0 && starterQuestions.length > 0 && (
                  <div className="starter-chips-container" role="group" aria-label="Starter questions">
                    {starterQuestions.map((sq, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="starter-chip-btn"
                        onClick={() => onSendMessage(sq)}
                      >
                        {sq}
                      </button>
                    ))}
                  </div>
                )}

                {readySources.length === 0 && (
                  <div className="workspace-no-sources-alert" role="status">
                    <p>No ready sources in this notebook yet.</p>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setIsAddSourceOpen(true)}
                    >
                      Add course materials
                    </button>
                  </div>
                )}

              </div>
            </div>
          ) : (
            <>
              <div className="thread-scroll-container">
                <div className="thread-content-max">
                  <div className="thread-messages-list">
                    {messages.map((msg) => {
                      const isThisRetrying = Boolean((retryingMessageId === msg.id && chatLoading) || (msg as any).is_retrying);
                      return (
                      <div key={msg.id} className={`thread-turn turn-${msg.role}`} data-turn-id={msg.id}>
                        {msg.role === 'user' ? (
                          <div className="user-turn-wrapper">
                            <div className="grounding-status">
                              ⚡ Grounded on {selectedSourceIds.length > 0 ? selectedSourceIds.length : sources.length} {(selectedSourceIds.length > 0 ? selectedSourceIds.length : sources.length) === 1 ? 'source' : 'sources'} · Verified
                            </div>
                            <h2 className="question-heading" data-testid="question-heading">{msg.content}</h2>
                          </div>
                        ) : isThisRetrying ? (
                          <div className="assistant-message message-loading in-place-retry" role="status" aria-label="Thinking" data-testid={`retry-loading-${msg.id}`}>
                            <span className="thinking-dot" role="img" aria-label="Thinking" />
                          </div>
                        ) : (
                          <div className="assistant-message">
                            {/* 1. Abstention / Not Found view */}
                            {msg.abstained || msg.abstain_reason === 'generation_failed' ? (
                              (() => {
                                const copy = abstainCopy(msg, selectedSourceIds.length);
                                const recoveryChips: string[] = [];
                                if (selectedSourceIds.length > 0) {
                                  recoveryChips.push('Summarize selected sources');
                                } else if (sources.length > 0) {
                                  recoveryChips.push('Summarize sources');
                                }
                                recoveryChips.push('List key topics');
                                const hasSyllabusOrPolicy = sources.some((s) =>
                                  /syllabus|policy|grading|schedule|handout|rule/i.test(s.title || s.file_name || '')
                                );
                                if (hasSyllabusOrPolicy) {
                                  recoveryChips.push('Show course policies');
                                } else {
                                  recoveryChips.push('Explain core concepts');
                                }
                                return (
                                  <div className="abstain-prose" data-testid="abstained-view" role={copy.tone === 'error' ? 'alert' : 'status'}>
                                    <p className="answer-text">
                                      {msg.abstain_reason === 'generation_failed'
                                        ? <><span>{copy.title}.</span> <span>{copy.body}</span></>
                                        : abstainText(msg, selectedSourceIds.length)}
                                    </p>
                                    <div className="abstain-recovery-chips" role="group" aria-label="Suggested follow-up questions">
                                      {recoveryChips.slice(0, 3).map((chipText) => (
                                        <button
                                          key={chipText}
                                          type="button"
                                          className="starter-chip-btn abstain-recovery-chip"
                                          onClick={() => onSendMessage(chipText)}
                                        >
                                          {chipText}
                                        </button>
                                      ))}
                                    </div>
                                    <div className="answer-action-toolbar">
                                      <button
                                        type="button"
                                        className="answer-action-btn"
                                        onClick={() => {
                                          const msgIdx = messages.findIndex((m) => m.id === msg.id);
                                          const prevUser = [...messages.slice(0, msgIdx)].reverse().find((m) => m.role === 'user');
                                          if (prevUser) {
                                            setRetryingMessageId(msg.id);
                                            onSendMessage(prevUser.content, { is_retry: true, retry_message_id: msg.id });
                                          }
                                        }}
                                        title="Retry question with current sources"
                                        aria-label="Retry question"
                                        data-tooltip="Retry"
                                        data-testid={`retry-btn-${msg.id}`}
                                      >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" aria-hidden="true">
                                          <polyline points="1 4 1 10 7 10" />
                                          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                        </svg>
                                      </button>
                                      {msg.retrieved && msg.retrieved.length > 0 && (
                                        <button
                                          type="button"
                                          className="answer-action-btn"
                                          onClick={() => handleSeeRetrieval(msg.id)}
                                          title="Retrieval details"
                                          aria-label="Retrieval details"
                                          data-tooltip="Retrieval details"
                                          data-testid={`see-retrieval-btn-${msg.id}`}
                                        >
                                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" aria-hidden="true">
                                            <circle cx="11" cy="11" r="7" />
                                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                          </svg>
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className="answer-action-btn delete-turn-btn"
                                        onClick={() => onDeleteMessage?.(msg.id)}
                                        aria-label="Remove turn"
                                        data-tooltip="Remove turn"
                                        data-testid={`delete-turn-btn-${msg.id}`}
                                      >
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" aria-hidden="true">
                                          <polyline points="3 6 5 6 21 6" />
                                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })()
                            ) : (
                              <div className="answer-view-container" data-testid="answer-view">
                                {/* Earlier source version warning */}
                                {(() => {
                                  const outdated = sources.filter((s) => {
                                    const msgVer = msg.source_versions?.[s.id];
                                    return msgVer !== undefined && s.version > msgVer;
                                  });
                                  if (outdated.length > 0) {
                                    return (
                                      <div
                                        className="outdated-version-badge"
                                        data-testid="outdated-source-warning"
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                                          <circle cx="12" cy="12" r="10" />
                                          <line x1="12" y1="8" x2="12" y2="12" />
                                          <line x1="12" y1="16" x2="12.01" y2="16" />
                                        </svg>
                                        <span>
                                          Based on earlier source version (
                                          {outdated
                                            .map((s) => `${s.title || s.file_name} v${msg.source_versions[s.id]}`)
                                            .join(', ')}{' '}
                                          vs current {outdated.map((s) => `v${s.version}`).join(', ')})
                                        </span>
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}

                                {/* Grounded Answer Body */}
                                <div className="answer-text">
                                  <MarkdownRenderer
                                    content={(msg.content || '').replace(SAMPLE_TAG, '')}
                                    citations={msg.citations || []}
                                    isThisMessageSelected={selectedCitation?.messageId === msg.id}
                                    selectedCitation={selectedCitation}
                                    onSelectCitation={(cit) => handleSelectCitation(cit, msg.id)}
                                    citationState={citationStateOf}
                                  />
                                </div>

                                {/* Named Citation Pills */}
                                {msg.citations && msg.citations.length > 0 && (
                                  <div className="answer-citations-row">
                                    {msg.citations.map((c, cIdx) => {
                                      const src = sources.find((s) => s.id === c.source_id || normalizeFileName(s.file_name) === normalizeFileName(c.file));
                                      const label = src?.title || c.file?.replace(/\.(pdf|md|txt)$/i, '') || 'Source';
                                      const isSelected = Boolean(
                                        selectedCitation?.messageId === msg.id &&
                                        selectedCitation.page === c.page &&
                                        normalizeFileName(selectedCitation.file) === normalizeFileName(c.file)
                                      );
                                      return (
                                        <button
                                          key={cIdx}
                                          type="button"
                                          className={`citation-pill-badge ${isSelected ? 'is-active' : ''}`}
                                          onClick={() => handleSelectCitation(c, msg.id)}
                                          title={`Jump to ${label} page ${c.page} in Citations panel`}
                                        >
                                          [{label} p.{c.page}]
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Cross-Source Evidence Check: several sources, or a flagged contradiction */}
                                {(() => {
                                  const check = crossSourceCheck(msg);
                                  return check ? (
                                    <CrossSourceCheck
                                      check={check}
                                      onOpen={(o) => handleSelectCitation({ ...o, source_id: o.source_id ?? undefined }, msg.id)}
                                    />
                                  ) : null;
                                })()}

                                {/* Modern-Web Interactive Accordion: "Sources matched" Drawer */}
                                {(() => {
                                  const matchedItems = getMatchedItemsForMessage(msg);
                                  if (matchedItems.length === 0) return null;
                                  const uniqueFiles = new Set(matchedItems.map((m) => m.file));
                                  const matchedCount = uniqueFiles.size;

                                  return (
                                    <details className="sources-matched-drawer" data-testid={`sources-matched-drawer-${msg.id}`}>
                                      <summary className="sources-matched-summary">
                                        <span className="sources-matched-pill">
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                                          </svg>
                                          <span>{matchedCount} {matchedCount === 1 ? 'source' : 'sources'} matched</span>
                                          <svg className="sources-matched-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <polyline points="6 9 12 15 18 9" />
                                          </svg>
                                        </span>
                                      </summary>
                                      <div className="sources-matched-content">
                                        <div className="sources-matched-list">
                                          {matchedItems.map((item, iIdx) => {
                                            const percent = Math.round(item.score * 100);
                                            return (
                                              <button
                                                key={`${item.file}-${item.page}-${iIdx}`}
                                                type="button"
                                                className="sources-matched-item"
                                                onClick={() => handleSelectCitation(item.citation, msg.id)}
                                                title={`Select ${item.title}, page ${item.page} in Citations panel`}
                                                data-testid={`matched-source-item-${item.file}-${item.page}`}
                                              >
                                                <div className="sources-matched-item-info">
                                                  <svg className="sources-matched-file-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                    <polyline points="14 2 14 8 20 8" />
                                                  </svg>
                                                  <span className="sources-matched-item-title" title={item.file}>{item.title}</span>
                                                  <span className="sources-matched-item-page">p. {item.page}</span>
                                                </div>
                                                <div className="sources-matched-item-relevance">
                                                  <div className="sources-matched-score-bar" aria-hidden="true">
                                                    <div className="sources-matched-score-fill" style={{ width: `${percent}%` }} />
                                                  </div>
                                                  <span className="sources-matched-score-label">{percent}%</span>
                                                </div>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </details>
                                  );
                                })()}

                                {/* Restrained Answer Actions (Copy, Save to Note, Retry, Remove turn) */}
                                <div className="answer-action-toolbar">
                                  <button
                                    type="button"
                                    className="answer-action-btn"
                                    onClick={() => handleCopyAnswer(msg.content, msg.id)}
                                    aria-label="Copy"
                                    data-tooltip={copiedMsgId === msg.id ? 'Copied' : 'Copy'}
                                  >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="answer-action-btn"
                                    onClick={() => {
                                      const msgIdx = messages.findIndex((m) => m.id === msg.id);
                                      const prevUser = [...messages.slice(0, msgIdx)].reverse().find((m) => m.role === 'user');
                                      if (prevUser) {
                                        setRetryingMessageId(msg.id);
                                        onSendMessage(prevUser.content, { is_retry: true, retry_message_id: msg.id });
                                      }
                                    }}
                                    aria-label="Retry question"
                                    data-tooltip="Retry"
                                    data-testid={`retry-btn-${msg.id}`}
                                  >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" aria-hidden="true">
                                      <polyline points="1 4 1 10 7 10" />
                                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="answer-action-btn"
                                    onClick={() => handleSaveToNote(msg)}
                                    data-tooltip={savedNoteMsgId === msg.id ? 'Saved to notes' : 'Save to notes'}
                                    aria-label="Save to note"
                                    data-testid={`save-note-btn-${msg.id}`}
                                  >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                                    </svg>
                                  </button>
                                  {msg.retrieved && msg.retrieved.length > 0 && (
                                    <button
                                      type="button"
                                      className="answer-action-btn"
                                      onClick={() => handleSeeRetrieval(msg.id)}
                                      data-tooltip="Retrieval details"
                                      aria-label="Retrieval details"
                                      data-testid={`see-retrieval-btn-${msg.id}`}
                                    >
                                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" aria-hidden="true">
                                        <circle cx="11" cy="11" r="8" />
                                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                      </svg>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="answer-action-btn delete-turn-btn"
                                    onClick={() => onDeleteMessage?.(msg.id)}
                                    aria-label="Remove turn"
                                    data-tooltip="Remove turn"
                                    data-testid={`delete-turn-btn-${msg.id}`}
                                  >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" aria-hidden="true">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                    })}

                    {chatLoading && !retryingMessageId && (
                      <div className="thread-turn turn-assistant">
                        <div className="assistant-message message-loading" role="status" aria-label="Thinking">
                          <span className="thinking-dot" role="img" aria-label="Thinking" />
                        </div>
                      </div>
                    )}

                    <div ref={threadBottomRef} />
                  </div>
                </div>
              </div>

            </>
          )}
              {/* Floating Suggestion Chips Dock */}
              {sources.length > 0 && !chatLoading && (
                <div className="composer-suggestions-dock" role="group" aria-label="Suggested questions">
                  {[
                    'What is the late penalty?',
                    'List required C functions',
                    'Show exam dates',
                  ].map((suggestion, sIdx) => (
                    <button
                      key={sIdx}
                      type="button"
                      className="composer-suggestion-pill"
                      onClick={() => onSendMessage(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
              {/* Pinned Bottom Composer */}
              <Composer
                question={question}
                setQuestion={setQuestion}
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (question.trim() && !chatLoading) {
                    lastSendTimeRef.current = Date.now();
                    const q = question.trim();
                    try {
                      setQuestion('');
                      await onSendMessage(q);
                    } catch {
                      setQuestion(q);
                    }
                  }
                }}
                loading={chatLoading}
                onStop={handleSafeStopGeneration}
                scope={composerScope}
                blockedReason={sources.length === 0 ? 'Add a source to start chatting' : readySources.length === 0 ? 'Waiting for a ready source' : undefined}
                placeholder="Ask anything about your sources..."
                onAddSources={() => openAddSources()}
                scrollDown={{ visible: showScrollDown, onClick: scrollThreadToBottom }}
              />
        </section>

        <div
          className={`context-slot ${isContextCollapsed ? 'is-collapsed' : ''}`}
        >
          {isContextCollapsed && resizeHandle('right', false)}
        {isContextCollapsed && (
          <button type="button" ref={contextToggleRef} className="rail-icon-btn context-expand-btn" onClick={() => setContextCollapsed(false)}
            title={`Open citations panel (${shortcutLabel('\\')})`} aria-label="Open citations panel" aria-expanded={false} aria-controls="workspace-sources-panel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M15 3v18" />
            </svg>
          </button>
        )}
        {/* --------------------------------------------------------------------
            RIGHT: floating materials panel (sources)
            -------------------------------------------------------------------- */}
        <aside
          className={`workspace-sidebar workspace-context-panel ${!isContextCollapsed ? 'sidebar-open' : ''}`}
          id="workspace-sources-panel" aria-hidden={isContextCollapsed} ref={contextPanelRef} tabIndex={-1}
          aria-label={reader ? 'Source reader' : 'Study panel'} data-reader={reader ? (readerExpanded ? 'expanded' : 'compact') : undefined}
        >
          {!isContextCollapsed && resizeHandle('right', true)}
          {reader && (
            <SourceReader
              title={readerSource?.title ?? reader.cite?.citation.file ?? 'Source'}
              sourceType={readerSource?.source_type ?? 'pdf'}
              version={reader.version}
              pageCount={readerSource?.page_count ?? 0}
              page={reader.page}
              expanded={readerExpanded}
              notice={readerNotice}
              currentVersion={readerSource?.version}
              passages={readerPassages}
              text={readerText}
              removed={readerRemoved}
              onPage={goToReaderPage}
              onToggleExpanded={() => (readerExpanded ? collapseReader() : expandReader())}
              onBack={closeReader}
              onViewPlain={() => { if (readerSource) void handleOpenSourceViewer(readerSource); }}
              expandButtonRef={readerExpandRef}
              headingRef={readerHeadingRef}
            />
          )}
          {!(contextView === 'notes' && isCreateNoteOpen) && <div className="context-tabs-row">
          <div className="context-view-switcher sidebar-segment-switcher sliding-tabs" ref={contextTabsRef} role="group" aria-label="Panel view" data-active={contextView === 'notes' ? 'notes' : 'evidence'}>
            <button type="button" className={`segment-btn ${contextView === 'notes' ? 'active' : ''}`} aria-pressed={contextView === 'notes'} onClick={() => { void flushNote(); setContextView('notes'); }}>{notes.length > 0 ? `Notes · ${notes.length}` : 'Notes'}</button>
            <button type="button" className={`segment-btn ${contextView !== 'notes' ? 'active' : ''}`} aria-pressed={contextView !== 'notes'} onClick={() => { void flushNote(); setContextView('evidence'); }} data-testid="right-panel-tab-evidence">Citations</button>
          </div>
          <button type="button" ref={contextToggleRef} className="rail-icon-btn context-collapse-btn" onClick={closeContextPanel}
            title={`Hide study panel (${shortcutLabel('\\')})`} aria-label="Toggle study panel" aria-expanded={!isContextCollapsed} aria-controls="workspace-sources-panel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M15 3v18" />
            </svg>
          </button>
          </div>}

          {contextView === 'evidence' && (
            <div className="right-panel-body study-evidence-body tab-panel-fade" key="panel-evidence">
              {selectedCitation ? <section data-testid="selected-source-card" className="evidence-source-summary" tabIndex={-1}>
                {!matchedSource && !selectedCitation.source_id && <p className="evidence-note">This file is not among the notebook’s current sources.</p>}
                                  <InlineEvidence
                                    ref={evidenceRef}
                                    citation={selectedCitation}
                                    passages={passages}
                                    loading={passageLoading}
                                    retrievedChunks={retrievedMatchingChunks}
                                    isHighlighted={isChunkHighlighted}
                                    sourceRemoved={isSourceDeleted}
                                    sourceReplaced={isSourceReplaced}
                                    currentVersion={matchedSource?.version}
                                    readerAction={readerAction}
                                    index={currentCitationIndex}
                                    total={activeCitations.length}
                                    onPrevious={handlePreviousCitation}
                                    onNext={handleNextCitation}
                                    onClose={closeEvidence}
                                    displayTitle={matchedSource ? displayTitleFor(matchedSource) : undefined}
                                    footerExtra={
                                      <button type="button" className="evidence-reader-btn evidence-save-btn" onClick={() => {
                                        setEditingNote(null);
                                        setNoteFormTitle(matchedSource?.title || selectedCitation.file);
                                        const passage = retrievedMatchingChunks.map(c => c.text).join('\n\n') || selectedCitation.excerpt || '';
                                        setNoteFormContent(`${passage}\n\nSource: ${selectedCitation.file}, page ${selectedCitation.page}`);
                                        setIsCreateNoteOpen(true);
                                        setContextView('notes');
                                      }} aria-label="Save passage to notes">Save to notes</button>
                                    }
                                  />
              </section> : <p className="study-empty">Select a citation in an answer to inspect its source.</p>}
              {selectedRetrievalMessageId && <button type="button" className="selected-source-view" onClick={() => setContextView('retrieval')}>Show retrieval diagnostics</button>}
            </div>
          )}

          {/* RIGHT PANEL CONTENT: SAVED NOTES VIEW */}
          {contextView === 'notes' && (
            <div className="right-panel-body tab-panel-fade" key="panel-notes">
              {isCreateNoteOpen ? (
                <form className="note-editor studio-note" data-testid="inline-note-editor" aria-label={editingNote ? 'Edit note' : 'New note'}
                  onSubmit={(e) => { e.preventDefault(); void flushNote(); }}
                  onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void flushNote(); } }}>
                  <div className="note-editor-bar">
                    <nav className="note-breadcrumb" aria-label="Breadcrumb">
                      <button type="button" className="note-editor-back" onClick={() => void flushNote()}>Notes</button>
                      <svg className="note-crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
                      <span className="note-crumb-current" aria-current="page">Note</span>
                    </nav>
                    <button type="button" ref={contextToggleRef} className="rail-icon-btn context-collapse-btn" onClick={() => { void flushNote(); closeContextPanel(); }}
                      title="Hide study panel" aria-label="Collapse panel">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M15 3v18" />
                      </svg>
                    </button>
                  </div>
                  <div className="note-title-row">
                    <input id="note-title-input" className="note-editor-title note-studio-title" type="text" placeholder="New Note" aria-label="Note title"
                      value={noteFormTitle} onChange={(e) => { setNoteFormTitle(e.target.value); setNoteSaveStatus('saving'); }} onFocus={(e) => { if (e.currentTarget.value === 'New Note') e.currentTarget.select(); }} />
                    {noteSaveStatus !== 'idle' && (
                      <span className="note-save-status" aria-live="polite" data-testid="note-save-status">
                        {noteSaveStatus === 'saving' ? 'Saving…' : '✓ Saved'}
                      </span>
                    )}
                    <button type="button" className="rail-icon-btn note-editor-delete tip-end" aria-label="Delete note" data-tooltip="Delete note"
                      onClick={() => {
                        if (editingNote) {
                          if (!window.confirm(`Delete note "${editingNote.title}"?`)) return;
                          onDeleteNote(editingNote.id);
                        }
                        closeNoteEditor();
                      }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6" /><path d="M4 6h16" /><path d="M6.5 9l1 10a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8l1-10" /></svg>
                    </button>
                  </div>
                  <div className="note-toolbar" role="toolbar" aria-label="Formatting">
                    <button type="button" className="note-tool tip-start" aria-label="Undo" data-tooltip="Undo" onMouseDown={(e) => e.preventDefault()} onClick={() => noteHistory('undo')}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H6" /></svg></button>
                    <button type="button" className="note-tool tip-start" aria-label="Redo" data-tooltip="Redo" onMouseDown={(e) => e.preventDefault()} onClick={() => noteHistory('redo')}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H18" /></svg></button>
                    <span className="note-tool-sep" aria-hidden="true" />
                    <div className="note-menu-anchor" data-note-menu>
                      <button type="button" className={`note-block-btn ${noteMenu === 'block' ? 'is-open' : ''}`} aria-label="Text style" data-tooltip="See options" aria-haspopup="menu" aria-expanded={noteMenu === 'block'}
                        onMouseDown={(e) => e.preventDefault()} onClick={() => setNoteMenu(noteMenu === 'block' ? null : 'block')}>
                        {noteBlock === 'normal' ? 'Normal' : `H${noteBlock[1]}`}<span aria-hidden="true"> ▾</span>
                      </button>
                      {noteMenu === 'block' && (
                        <div className="note-popover note-block-menu" role="menu" aria-label="Text style">
                          {([['p', 'Normal'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3']] as const).map(([tag, label]) => (
                            <button key={tag} type="button" role="menuitemradio" aria-checked={(noteBlock === 'normal' ? 'p' : noteBlock) === tag}
                              className={`note-menu-item note-menu-${tag}`} onMouseDown={(e) => e.preventDefault()} onClick={() => noteBlockFormat(tag)}>{label}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="note-tool-sep" aria-hidden="true" />
                    <button type="button" className={`note-tool note-tool-bold ${noteFormats.bold ? 'is-active' : ''}`} aria-label="Bold" aria-pressed={noteFormats.bold} data-tooltip="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => noteExec('bold')}>B</button>
                    <button type="button" className={`note-tool note-tool-italic ${noteFormats.italic ? 'is-active' : ''}`} aria-label="Italic" aria-pressed={noteFormats.italic} data-tooltip="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => noteExec('italic')}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" /></svg></button>
                    <span className="note-tool-sep" aria-hidden="true" />
                    <button type="button" className="note-tool" aria-label="Insert link" data-tooltip="Insert link" onMouseDown={(e) => e.preventDefault()} onClick={noteLink}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" /></svg>
                    </button>
                    <button type="button" className="note-tool" aria-label="Inline code" data-tooltip="Inline code" onMouseDown={(e) => e.preventDefault()} onClick={noteInlineCode}>{'<>'}</button>
                    <button type="button" className="note-tool tip-end" aria-label="Code block" data-tooltip="Code block" onMouseDown={(e) => e.preventDefault()} onClick={noteCodeBlock}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M10 9l-2.5 3 2.5 3" /><path d="M14 9l2.5 3-2.5 3" /></svg></button>
                    <span className="note-tool-sep" aria-hidden="true" />
                    <div className="note-menu-anchor note-more-anchor" data-note-menu>
                      <button type="button" className={`note-tool tip-end ${noteMenu === 'more' ? 'is-active' : ''}`} aria-label="More formatting" data-tooltip="More options" aria-haspopup="menu" aria-expanded={noteMenu === 'more'}
                        onMouseDown={(e) => e.preventDefault()} onClick={() => setNoteMenu(noteMenu === 'more' ? null : 'more')}>•••</button>
                    </div>
                    {noteMenu === 'more' && (
                      <div className="note-popover note-more-pill" role="toolbar" aria-label="More formatting" data-note-menu>
                        <button type="button" className="note-tool" aria-label="Bulleted list" data-tooltip="Bulleted list" onMouseDown={(e) => e.preventDefault()} onClick={() => noteMore(() => noteExec('insertUnorderedList'))}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" /><circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></svg></button>
                        <button type="button" className="note-tool" aria-label="Numbered list" data-tooltip="Numbered list" onMouseDown={(e) => e.preventDefault()} onClick={() => noteMore(() => noteExec('insertOrderedList'))}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="10" y1="6" x2="20" y2="6" /><line x1="10" y1="12" x2="20" y2="12" /><line x1="10" y1="18" x2="20" y2="18" /><path d="M4 5l1.5-1v4" /><path d="M3.8 11.5a1.4 1.4 0 0 1 2.6.7c0 1-1.4 1.6-2.6 3h2.8" /><path d="M3.8 18.2h2.4l-1.2 1.4a1.3 1.3 0 1 1-1.2 1.7" /></svg></button>
                        <button type="button" className="note-tool" aria-label="Blockquote" data-tooltip="Blockquote" onMouseDown={(e) => e.preventDefault()} onClick={() => noteMore(() => noteExec('formatBlock', 'blockquote'))}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.5 7H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2.5v1.5A2.5 2.5 0 0 1 6 18" /><path d="M20 7h-3.5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2H19v1.5a2.5 2.5 0 0 1-2.5 2.5" /></svg></button>
                        <button type="button" className="note-tool" aria-label="Horizontal divider" data-tooltip="Horizontal divider" onMouseDown={(e) => e.preventDefault()} onClick={() => noteMore(() => noteExec('insertHorizontalRule'))}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="4" y1="12" x2="20" y2="12" /></svg></button>
                        <button type="button" className="note-tool tip-end" aria-label="Clear formatting" data-tooltip="Clear formatting" onMouseDown={(e) => e.preventDefault()} onClick={noteClearFormat}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 6V4h14v2" /><line x1="12" y1="4" x2="12" y2="12" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="16" x2="12" y2="20" /><line x1="4" y1="20" x2="20" y2="4" /></svg></button>
                      </div>
                    )}
                  </div>
                  {editingNote?.citations && editingNote.citations.length > 0 && (
                    <div className="note-citations-chips">
                      {editingNote.citations.map((c, cIdx) => (
                        <button key={cIdx} type="button" className="citation-chip note-citation-chip"
                          onClick={() => { void flushNote(); handleSelectCitation(c, editingNote.id); }}
                          title={`${c.file} (Page ${c.page})`}>
                          <span className="citation-chip-num">{cIdx + 1}</span>
                          <span className="citation-chip-name">{c.file}</span>
                          <span className="citation-chip-page">p.{c.page}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div id="note-content-input" ref={noteBodyRef} className="note-editor-body note-studio-canvas" contentEditable suppressContentEditableWarning
                    role="textbox" aria-multiline="true" aria-label="Note body" data-placeholder="Write your study notes, formulas, or key takeaways..."
                    data-empty={noteFormContent === '' ? 'true' : 'false'} spellCheck
                    onInput={noteInput}
                    onPaste={(e) => { e.preventDefault(); const t = e.clipboardData.getData('text/plain'); if (t) noteExec('insertText', t); }}
                    onDrop={(e) => { e.preventDefault(); const t = e.dataTransfer.getData('text/plain'); if (t) noteExec('insertText', t); }}
                    onKeyUp={noteSyncFormats} onMouseUp={noteSyncFormats} />
                </form>
              ) : (
              <>
              <div className="notes-top-bar">
                <button type="button" className="notes-new-pill" data-testid="new-note-btn" onClick={() => openNoteEditor(null)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>New note</span>
                </button>
              </div>

              {notes.length > 5 && (
                <div className="source-search-container">
                  <input
                    type="text"
                    placeholder="Find notes..."
                    value={noteSearch}
                    onChange={(e) => setNoteSearch(e.target.value)}
                    className="source-search-input"
                  />
                </div>
              )}

              <div className="notes-list-scroll">
                {notes.length === 0 ? (
                  <button type="button" className="notes-empty-card" onClick={() => openNoteEditor(null)}>
                    <span className="notes-empty-title">No notes yet</span>
                    <span className="notes-empty-sub">Save an answer or write your own note.</span>
                  </button>
                ) : filteredNotes.length === 0 ? (
                  <p className="sidebar-empty-box"><EmptyStateIcon />No notes matching search.</p>
                ) : (
                  <ul className="workspace-notes-ul">
                    {filteredNotes.map((n) => (
                      <li
                        key={n.id}
                        className="workspace-note-item"
                        tabIndex={0}
                        role="button"
                        onKeyDown={(e) => {
                          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            openNoteEditor(n);
                          }
                        }}
                        onClick={() => {
                          openNoteEditor(n);
                        }}
                      >
                        <div className="note-card-top">
                          <span className="note-title-text" title={n.title}>{n.title}</span>
                          {n.is_saved_answer ? (
                            <span className="saved-answer-tag">Saved Answer</span>
                          ) : (
                            <span className="personal-note-tag">Note</span>
                          )}
                        </div>
                        <p className="note-snippet-text">{noteToText(n.content)}</p>
                        {n.citations && n.citations.length > 0 && (
                          <div className="note-citations-container" onClick={(e) => e.stopPropagation()}>
                            <div className="note-citations-chips">
                              {n.citations.map((c, cIdx) => (
                                <button
                                  key={cIdx}
                                  type="button"
                                  className="citation-chip note-citation-chip"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectCitation(c, n.id);
                                  }}
                                  title={`${c.file} (Page ${c.page})`}
                                  data-testid={`note-citation-chip-${cIdx}`}
                                >
                                  <span className="citation-chip-num">{cIdx + 1}</span>
                                  <span className="citation-chip-name">{c.file}</span>
                                  <span className="citation-chip-page">p.{c.page}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="note-card-footer" onClick={(e) => e.stopPropagation()}>
                          <span className="note-date">
                            {new Date(n.updated_at).toLocaleDateString()}
                          </span>
                          <button
                            type="button"
                            className="source-item-btn source-delete-btn"
                            title="Delete note"
                            onClick={() => {
                              if (window.confirm(`Delete note "${n.title}"?`)) {
                                onDeleteNote(n.id);
                              }
                            }}
                            aria-label="Delete note"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            </svg>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              </>
              )}
            </div>
          )}


          {/* RIGHT PANEL CONTENT: RETRIEVAL MAP VIEW */}
          {contextView === 'retrieval' && (
            <div className="right-panel-body retrieval-panel-body">
              <button type="button" className="selected-source-view" onClick={() => setContextView('evidence')}>Back to evidence</button>
              <RetrievalMapView
                subjectId={subject.id}
                conversationId={activeConversationId || (messages.length > 0 ? messages[0].conversation_id : undefined)}
                messageId={selectedRetrievalMessageId || undefined}
                selectedSourceIds={selectedSourceIds}
                sources={sources}
                onSelectPassage={handleSelectPassageFromRetrieval}
              />
            </div>
          )}

        </aside>
        </div>

      </div>

      {paletteOpen && <CommandPalette items={buildPaletteItems()} onClose={() => setPaletteOpen(false)} />}

      {historyOpen && <div className="modal-backdrop" onClick={() => setHistoryOpen(false)}>
        <div className="modal-content workspace-history-dialog" ref={historyRef} role="dialog" aria-modal="true" aria-labelledby="history-title" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h2 id="history-title">Conversation history</h2><button type="button" className="modal-close-btn" aria-label="Close history" onClick={() => setHistoryOpen(false)}>×</button></div>
          <SessionsView conversations={conversations ?? []} activeConversationId={activeConversationId}
            onNewSession={onCreateConversation ? () => { void onCreateConversation(); setHistoryOpen(false); } : undefined}
            onSelectSession={onSelectConversation ? id => { onSelectConversation(id); setHistoryOpen(false); } : undefined} />
        </div>
      </div>}
      {/* ======================================================================
          MODALS: Add Source, View Source, Rename Source, Note, Settings
          ====================================================================== */}
      {(isAddSourceOpen || hasOpenedAddSource.current) && (
        <SourceModal
          isOpen={isAddSourceOpen}
          initialTab={sourceEntryTab}
          initialFiles={droppedFiles}
          initialUrl={initialUrl}
          onClose={closeAddSources}
          onUploadFiles={onUploadFiles}
          onPasteText={onPasteText}
          onAddUrl={onAddUrl}
        />
      )}

      {viewingSource && (
        <SourceViewerModal
          source={viewingSource}
          status={viewerStatus}
          onRetry={() => { void handleOpenSourceViewer(viewingSource); }}
          onClose={() => setViewingSource(null)}
        />
      )}

      {/* Rename Source Modal */}
      {renamingSource && (
        <div className="modal-backdrop" onClick={() => setRenamingSource(null)}>
          <div ref={renameModalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Rename source"
            className="modal-content modal-content-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Rename Source</h2>
              <button type="button" className="modal-close-btn" onClick={() => setRenamingSource(null)} aria-label="Close">
                &times;
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (newSourceTitle.trim()) {
                  await onRenameSource(renamingSource.id, newSourceTitle.trim());
                  setRenamingSource(null);
                }
              }}
              className="modal-form"
            >
              <div className="form-group">
                <label htmlFor="rename-src-input">Display Title</label>
                <input
                  id="rename-src-input"
                  type="text"
                  required
                  value={newSourceTitle}
                  onChange={(e) => setNewSourceTitle(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notebook Settings Modal */}
      {isSettingsOpen && (
        <div className="modal-backdrop" onClick={closeSettings}>
          <div ref={settingsModalRef} className="modal-content modal-content-sm settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Notebook Settings</h2>
              <button type="button" className="modal-close-btn" onClick={closeSettings} aria-label="Close">
                &times;
              </button>
            </div>
            <div className="modal-form">
              {settingsError && (
                <div className="form-error-banner" role="alert">
                  {settingsError}
                </div>
              )}
              <div className="form-group">
                <label htmlFor="settings-resp-length">Response Length</label>
                <select
                  id="settings-resp-length"
                  value={subject.settings?.response_length || 'default'}
                  onChange={(e) =>
                    saveSettings({ response_length: e.target.value as SubjectSettings['response_length'] })
                  }
                >
                  <option value="concise">Concise (brief, direct facts)</option>
                  <option value="default">Default (balanced)</option>
                  <option value="detailed">Detailed (in-depth breakdown)</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="settings-resp-style">Response Style</label>
                <select
                  id="settings-resp-style"
                  value={subject.settings?.response_style || 'general'}
                  onChange={(e) =>
                    saveSettings({ response_style: e.target.value as SubjectSettings['response_style'] })
                  }
                >
                  <option value="general">General (objective academic assistant)</option>
                  <option value="learning-guide">Learning Guide (interactive tutor, step-by-step)</option>
                </select>
              </div>

              <div className="settings-note">
                Preferences are persisted per notebook for this browser session.
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={closeSettings}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
