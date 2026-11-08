import { EmptyStateIcon } from './EmptyStateIcon';
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
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
import { SourceRow } from './SourceRow';
import { useModalFocus } from '../useModalFocus';
import { useMediaQuery } from '../viewport';
import { RetrievalMapView } from './RetrievalMapView';
import { WorkspaceNav } from './WorkspaceNav';
import { EvidenceBody, InlineEvidence } from './EvidenceBody';

// Dialogs load when first opened and are fetched in the background once the workspace is idle.
const SourceModal = lazyView(() => import('./SourceModal').then((m) => m.SourceModal));
const SourceViewerModal = lazyView(() => import('./SourceViewerModal').then((m) => m.SourceViewerModal));
import { Composer, ComposerScope } from './Composer';

const NAV_PREF_KEY = 'notebookspace_nav_open';
const CONTEXT_PREF_KEY = 'notebookspace_context_open';
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
function writePanelPref(key: string, open: boolean): void {
  try {
    window.localStorage.setItem(key, open ? '1' : '0');
  } catch {
    /* storage unavailable: the choice still applies for this visit */
  }
}

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
  onDeleteSource: (sourceId: string) => Promise<void>;
  onRetrySource: (sourceId: string) => Promise<void>;
  onReplaceSource: (sourceId: string, file: File) => Promise<void>;
  onSendMessage: (question: string, options?: { is_retry?: boolean; retry_message_id?: string }) => Promise<void>;
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
  onDeleteSource,
  onRetrySource,
  onReplaceSource,
  onSendMessage,
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
  const overlayViewport = () => typeof window !== 'undefined' && window.innerWidth <= 1180;
  const [isCompact, setIsCompact] = useState(compactViewport);
  // Navigation (left) and materials (right) collapse independently. Where they are docked the
  // choice is remembered; where they are overlays they always start closed.
  const [isNavCollapsed, setIsNavCollapsed] = useState(() => compactViewport() || !readPanelPref(NAV_PREF_KEY));
  const [isContextCollapsed, setIsContextCollapsed] = useState(() => overlayViewport() || !readPanelPref(CONTEXT_PREF_KEY));
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [titleBelowBar, setTitleBelowBar] = useState(compactViewport);
  const headerRef = useRef<HTMLElement>(null);
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
  const contextPanelRef = useRef<HTMLElement>(null);
  const evidenceRef = useRef<HTMLElement>(null);
  const selectedCardRef = useRef<HTMLElement>(null);
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
  // Below 1180px the materials panel is an on-demand overlay; below 961px navigation is a drawer.
  const isContextOverlay = useMediaQuery('(max-width: 1180px)', overlayViewport()) || isCompact;
  const setNavCollapsed = (collapsed: boolean, remember = true) => {
    setIsNavCollapsed(collapsed);
    if (remember && !isCompact) writePanelPref(NAV_PREF_KEY, !collapsed);
  };
  const setContextCollapsed = (collapsed: boolean, remember = true) => {
    setIsContextCollapsed(collapsed);
    if (remember && !isContextOverlay) writePanelPref(CONTEXT_PREF_KEY, !collapsed);
  };
  const closeNavPanel = () => { setNavCollapsed(true); navToggleRef.current?.focus(); };
  const closeContextPanel = () => { setContextCollapsed(true); contextToggleRef.current?.focus(); };

  const contextOverlayOpen = isContextOverlay && !isContextCollapsed;
  const navDrawerOpen = isCompact && !isNavCollapsed;
  useModalFocus<HTMLElement>(contextOverlayOpen, closeContextPanel, contextPanelRef);
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
        - (parseFloat(style.paddingRight) || 0) - (backButtonRef.current?.offsetWidth || 0)
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
    if (navPanelRef.current) navPanelRef.current.inert = isNavCollapsed;
  }, [isNavCollapsed]);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);

  // Right contextual panel tab: 'passage' | 'notes' | 'retrieval'
  const [contextView, setContextView] = useState<'sources' | 'notes' | 'retrieval'>('sources');
  const [selectedRetrievalMessageId, setSelectedRetrievalMessageId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedRetrievalMessageId(null);
  }, [activeConversationId]);

  // Search queries
  const [sourceSearch, setSourceSearch] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [webQuery, setWebQuery] = useState('');
  const [webHint, setWebHint] = useState('');
  const [initialUrl, setInitialUrl] = useState('');
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [noteSearch, setNoteSearch] = useState('');

  // Modals
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [viewingSource, setViewingSource] = useState<Source | null>(null);

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
  const createNoteModalRef = useModalFocus(isCreateNoteOpen, () => setIsCreateNoteOpen(false));
  const settingsModalRef = useModalFocus(isSettingsOpen, () => setIsSettingsOpen(false));
  const renameModalRef = useModalFocus(Boolean(renamingSource), () => setRenamingSource(null));

  // Citation inspection state
  const [selectedCitation, setSelectedCitation] = useState<ActiveCitation | null>(null);
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [passageLoading, setPassageLoading] = useState(false);

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

  // Scroll to bottom when messages update
  useEffect(() => {
    if (threadBottomRef.current && typeof threadBottomRef.current.scrollIntoView === 'function') {
      threadBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, chatLoading]);

  // Escape key handler to close all workspace modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (renamingSource) {
          setRenamingSource(null);
        } else if (isCreateNoteOpen) {
          setIsCreateNoteOpen(false);
        } else if (isSettingsOpen) {
          setIsSettingsOpen(false);
        } else if (viewingSource) {
          setViewingSource(null);
        } else if (isAddSourceOpen) {
          setIsAddSourceOpen(false);
        } else if (isActionsOpen) {
          closeActions();
        } else if (contextOverlayOpen) {
          closeContextPanel();
        } else if (navDrawerOpen) {
          closeNavPanel();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [renamingSource, isCreateNoteOpen, isSettingsOpen, viewingSource, isAddSourceOpen, isActionsOpen, contextOverlayOpen, navDrawerOpen]);

  // Ready sources
  const readySources = sources.filter((s) => s.status === 'ready');
  const readySelectedCount = readySources.filter((s) => selectedSourceIds.includes(s.id)).length;
  const allReadySelected = readySources.length > 0 && readySelectedCount === readySources.length;
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = readySelectedCount > 0 && !allReadySelected;
  }, [readySelectedCount, allReadySelected, sources.length]);

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

  // The link bar adds a page as a source: a link opens the Add sources dialog on its link tab, ready to confirm.
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
    try {
      const full = await api.getSourceDetail(subject.id, s.id);
      if (full) {
        setViewingSource(full);
      }
    } catch (err) {
      console.error('Failed to load source detail:', err);
    }
  };

  // --------------------------------------------------------------------------
  // CITATION INSPECTION HANDLERS
  // --------------------------------------------------------------------------
  // Show a view in the materials panel, opening it (as an overlay where it is one) if it is closed.
  const openContext = (view: 'sources' | 'notes' | 'retrieval') => {
    setContextView(view);
    setIsContextCollapsed(false);
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
    // Evidence appears under its answer; a citation with no answer on screen (a note's, or one picked
    // from the retrieval map) is shown with its source in the materials panel instead.
    if (!messages.some((m) => m.id === messageId)) {
      openContext('sources');
      setCardFocusTick((t) => t + 1); // the control that was clicked is about to unmount
    }
    loadPassages(cit);
  };

  // Keep newly opened evidence in view; smooth scrolling only when motion is welcome.
  useEffect(() => {
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
    if (cardFocusTick > 0) selectedCardRef.current?.focus();
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
      handleSelectCitation(activeCitations[currentCitationIndex - 1], selectedCitation.messageId, { keepOpener: true });
    }
  };

  const handleNextCitation = () => {
    if (hasNextCitation && selectedCitation?.messageId) {
      handleSelectCitation(activeCitations[currentCitationIndex + 1], selectedCitation.messageId, { keepOpener: true });
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
  const isHistoricalOnly = isSourceDeleted || isSourceReplaced;
  const isUnknownSource = Boolean(
    selectedCitation && !selectedCitation.source_id &&
    !sources.some((src) => normalizeFileName(src.file_name) === normalizeFileName(selectedCitation.file))
  );

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
    onOpenMaterials: () => openContext('sources'),
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
        '[data-testid="right-panel-tab-retrieval"]'
      );
      if (retrievalTabBtn) {
        retrievalTabBtn.focus();
      } else {
        contextPanelRef.current?.focus();
      }
    }, 0);
  };

  // Filtered sources & notes
  const filteredSources = sources.filter((s) => {
    if (!sourceSearch.trim()) return true;
    const q = sourceSearch.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.file_name.toLowerCase().includes(q);
  });

  const filteredNotes = notes.filter((n) => {
    if (!noteSearch.trim()) return true;
    const q = noteSearch.toLowerCase();
    return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
  });


  return (
    <div className="workspace-root workspace-layout" data-nav-open={!isNavCollapsed} data-context-open={!isContextCollapsed}>
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
        <button type="button" ref={navToggleRef}
          className={`workspace-toggle-btn workspace-nav-toggle ${!isNavCollapsed ? 'active' : ''}`}
          onClick={() => setNavCollapsed(!isNavCollapsed)}
          title={isNavCollapsed ? 'Show navigation' : 'Hide navigation'}
          aria-label="Toggle navigation" aria-expanded={!isNavCollapsed} aria-controls="workspace-nav-panel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" />
          </svg>
          <span className="toggle-label">Sessions</span>
        </button>
        <button type="button" className="workspace-back-btn" ref={backButtonRef}
          onClick={onBackToDashboard} title="Back to notebooks dashboard" aria-label="Back to notebooks dashboard">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Notebooks</span>
        </button>
        {!titleBelowBar && (
          <div className="workspace-subject-pill workspace-notebook-identity">
            <h1 className="workspace-subject-pill-name">{subject.name}</h1>
            {subject.course_code && <span className="workspace-subject-pill-code">{subject.course_code}</span>}
          </div>
        )}
        <div className="workspace-top-right workspace-essential-actions" ref={actionsRef}>
          <button type="button" ref={contextToggleRef}
            className={`workspace-toggle-btn ${!isContextCollapsed ? 'active' : ''}`}
            onClick={() => setContextCollapsed(!isContextCollapsed)}
            title={isContextCollapsed ? 'Show sources panel' : 'Hide sources panel'}
            aria-label="Toggle sources panel" aria-expanded={!isContextCollapsed} aria-controls="workspace-sources-panel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 3v18" />
            </svg>
            <span className="toggle-label">Sources</span>
          </button>
          <div className="workspace-actions-menu" ref={menuRootRef}>
            <button type="button" ref={menuButtonRef} className="btn-icon workspace-top-icon-btn"
              aria-label="Notebook actions" title="Notebook actions" aria-haspopup="menu" aria-expanded={isActionsOpen}
              aria-controls="workspace-actions-menu" onClick={() => setIsActionsOpen(!isActionsOpen)}
              onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setIsActionsOpen(true); } }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
              </svg>
            </button>
            {isActionsOpen && (
              <div id="workspace-actions-menu" className="notebook-overflow-menu workspace-overflow-menu"
                ref={menuRef} role="menu" aria-label="Notebook actions" onKeyDown={handleMenuKeys}>
                <button type="button" className="notebook-menu-item" role="menuitem"
                  onClick={() => { closeActions(); setIsSettingsOpen(true); }}>Notebook settings</button>
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
            <h1 className="workspace-subject-pill-name">{subject.name}</h1>
            {subject.course_code && <span className="workspace-subject-pill-code">{subject.course_code}</span>}
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
        {/* LEFT: navigation (notebook, sessions, saved notes) */}
        <div className={`nav-slot ${isNavCollapsed ? 'is-collapsed' : ''}`}>
          <WorkspaceNav
            ref={navPanelRef}
            subjectName={subject.name}
            courseCode={subject.course_code}
            conversations={conversations ?? []}
            activeConversationId={activeConversationId}
            notesCount={notes.length}
            onBackToDashboard={onBackToDashboard}
            onNewSession={onCreateConversation ? () => { void onCreateConversation(); if (isCompact) setNavCollapsed(true); } : undefined}
            onSelectSession={onSelectConversation ? (id) => { onSelectConversation(id); if (isCompact) setNavCollapsed(true); } : undefined}
            onOpenNotes={() => {
              openContext('notes');
              if (isCompact) setNavCollapsed(true);
            }}
            onCollapse={closeNavPanel}
            collapsed={isNavCollapsed}
          />
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
              <div className="empty-state-centered-box workspace-zero-sources-box">
                <div className="empty-state-brand-mark" aria-hidden="true">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                </div>
                <h1 className="empty-state-heading" data-testid="empty-state-heading">
                  Add your first source
                </h1>
                <p className="empty-state-subtext">
                  Upload course syllabi, lecture slides, assignments, or web articles to get started. Answers cite exact pages and quotes from your sources.
                </p>
                <div className="zero-sources-cta-group">
                  <button
                    type="button"
                    className="btn btn-primary btn-add-first-source"
                    onClick={() => setIsAddSourceOpen(true)}
                    data-testid="add-first-source-btn"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>Add course materials</span>
                  </button>
                </div>
                <div className="zero-sources-hints">
                  <span>PDF documents</span>
                  <span>&bull;</span>
                  <span>Web links</span>
                  <span>&bull;</span>
                  <span>Pasted text</span>
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
                {starterQuestions.length > 0 && (
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

                {/* Centered Composer in Empty State */}
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
                  placeholder="Ask about your selected materials"
                />
              </div>
            </div>
          ) : (
            <>
              <div className="thread-scroll-container">
                <div className="thread-content-max">
                  <div className="thread-messages-list">
                    {messages.map((msg) => (
                      <div key={msg.id} className={`thread-turn turn-${msg.role}`}>
                        {msg.role === 'user' ? (
                          <div className="user-turn-wrapper">
                            <h2 className="question-heading" data-testid="question-heading">{msg.content}</h2>
                          </div>
                        ) : (
                          <div className="assistant-message">
                            {/* 1. Abstention / Not Found view */}
                            {msg.abstained || msg.abstain_reason === 'generation_failed' ? (
                              <div
                                className={`card-not-found ${
                                  msg.abstain_reason === 'generation_failed' ? 'card-generation-failed' : ''
                                } ${msg.abstain_reason === 'stopped' ? 'card-generation-stopped' : ''}`}
                                data-testid="abstained-view"
                              >
                                <div
                                  className={`not-found-badge ${
                                    msg.abstain_reason === 'generation_failed' ? 'badge-failed' : ''
                                  } ${msg.abstain_reason === 'stopped' ? 'badge-stopped' : ''}`}
                                >
                                  {msg.abstain_reason === 'generation_failed'
                                    ? 'GENERATION FAILED'
                                    : msg.abstain_reason === 'stopped'
                                    ? 'STOPPED'
                                    : 'NOT FOUND IN YOUR DOCUMENTS'}
                                </div>
                                <div className="abstain-reason">{msg.content}</div>

                                {/* Retry Action Toolbar */}
                                <div className="answer-action-toolbar">
                                  <button
                                    type="button"
                                    className="answer-action-btn"
                                    onClick={() => {
                                      const msgIdx = messages.findIndex((m) => m.id === msg.id);
                                      const prevUser = [...messages.slice(0, msgIdx)]
                                        .reverse()
                                        .find((m) => m.role === 'user');
                                      if (prevUser) {
                                        onSendMessage(prevUser.content, {
                                          is_retry: true,
                                          retry_message_id: msg.id,
                                        });
                                      }
                                    }}
                                    title="Retry question with current sources"
                                    aria-label="Retry question"
                                    data-testid={`retry-btn-${msg.id}`}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="1 4 1 10 7 10" />
                                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                    </svg>
                                    <span>Retry</span>
                                  </button>
                                  {msg.retrieved && msg.retrieved.length > 0 && (
                                    <button
                                      type="button"
                                      className="answer-action-btn"
                                      onClick={() => handleSeeRetrieval(msg.id)}
                                      title="Retrieval details"
                                      aria-label="Retrieval details"
                                      data-testid={`see-retrieval-btn-${msg.id}`}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                        <circle cx="11" cy="11" r="8" />
                                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                      </svg>
                                      <span>Retrieval details</span>
                                    </button>
                                  )}
                                </div>

                                {msg.retrieved && msg.retrieved.length > 0 && (
                                  <div className="related-passages-section">
                                    <h4 className="related-passages-title">Passages checked</h4>
                                    <ul className="related-passages-list">
                                      {msg.retrieved.map((r, rIdx) => (
                                        <li key={rIdx} className="related-passage-item">
                                          <span>
                                            {r.title || r.file_name} (Page {r.page || r.page_number})
                                          </span>
                                          <span className="related-score">
                                            Score: {r.score?.toFixed(3)}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
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
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

                                {/* Conflicts Disagreement View */}
                                {msg.conflict_detected && msg.conflicts && msg.conflicts.length > 0 && (
                                  <div className="conflict-container" data-testid="conflict-view">
                                    <div className="conflict-header">
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                                        <line x1="12" y1="9" x2="12" y2="13" />
                                        <line x1="12" y1="17" x2="12.01" y2="17" />
                                      </svg>
                                      <h3 className="conflict-heading">These documents disagree</h3>
                                    </div>
                                    {msg.conflicts.map((conf, cIdx) => (
                                      <div key={cIdx} className="conflict-topic-group">
                                        <div className="conflict-topic">Topic: {conf.topic}</div>
                                        <div className="conflict-cards-row">
                                          {conf.claims.map((claim, clIdx) => (
                                            <div
                                              key={clIdx}
                                              className="conflict-source-card"
                                              role="button"
                                              tabIndex={0}
                                              aria-label={`Claim: ${claim.value} in ${claim.file} page ${claim.page}`}
                                              onClick={() =>
                                                handleSelectCitation({ file: claim.file, page: claim.page }, msg.id)
                                              }
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                  e.preventDefault();
                                                  handleSelectCitation({ file: claim.file, page: claim.page }, msg.id);
                                                }
                                              }}
                                            >
                                              <div className="source-value">&ldquo;{claim.value}&rdquo;</div>
                                              <div className="source-meta">
                                                {claim.file} (Page {claim.page})
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Grounded Answer Body */}
                                <div className="answer-text">
                                  <MarkdownRenderer
                                    content={msg.content}
                                    citations={msg.citations || []}
                                    isThisMessageSelected={selectedCitation?.messageId === msg.id}
                                    selectedCitation={selectedCitation}
                                    onSelectCitation={(cit) => handleSelectCitation(cit, msg.id)}
                                    citationState={citationStateOf}
                                  />
                                </div>

                                {/* Restrained Answer Actions (Copy, Save to Note, Retry) */}
                                <div className="answer-action-toolbar">
                                  <button
                                    type="button"
                                    className="answer-action-btn"
                                    onClick={() => handleCopyAnswer(msg.content, msg.id)}
                                    title="Copy response"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                    <span>{copiedMsgId === msg.id ? 'Copied!' : 'Copy'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="answer-action-btn"
                                    onClick={() => handleSaveToNote(msg)}
                                    title="Save this answer as a study note"
                                    aria-label="Save to note"
                                    data-testid={`save-note-btn-${msg.id}`}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                                    </svg>
                                    <span>{savedNoteMsgId === msg.id ? 'Saved to notes!' : 'Save to note'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="answer-action-btn"
                                    onClick={() => {
                                      const msgIdx = messages.findIndex((m) => m.id === msg.id);
                                      const prevUser = [...messages.slice(0, msgIdx)]
                                        .reverse()
                                        .find((m) => m.role === 'user');
                                      if (prevUser) {
                                        onSendMessage(prevUser.content, {
                                          is_retry: true,
                                          retry_message_id: msg.id,
                                        });
                                      }
                                    }}
                                    title="Retry question with current sources"
                                    aria-label="Retry question"
                                    data-testid={`retry-btn-${msg.id}`}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="1 4 1 10 7 10" />
                                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                    </svg>
                                    <span>Retry</span>
                                  </button>
                                  {msg.citations && msg.citations.length > 0 && (
                                    <button
                                      type="button"
                                      className="answer-action-btn"
                                      onClick={() => {
                                        if (selectedCitation?.messageId === msg.id) closeEvidence();
                                        else handleSelectCitation(msg.citations[0], msg.id);
                                      }}
                                      aria-expanded={selectedCitation?.messageId === msg.id}
                                      aria-controls={`evidence-${msg.id}`}
                                      aria-label={`Evidence, ${msg.citations.length} cited ${msg.citations.length === 1 ? 'passage' : 'passages'}`}
                                      data-testid={`evidence-btn-${msg.id}`}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                        <path d="M7 7h4v4H7zM13 7h4v4h-4zM7 11c0 3-1 4-3 5M13 11c0 3-1 4-3 5" />
                                      </svg>
                                      <span>Evidence · {msg.citations.length}</span>
                                    </button>
                                  )}
                                  {msg.retrieved && msg.retrieved.length > 0 && (
                                    <button
                                      type="button"
                                      className="answer-action-btn"
                                      onClick={() => handleSeeRetrieval(msg.id)}
                                      title="Retrieval details"
                                      aria-label="Retrieval details"
                                      data-testid={`see-retrieval-btn-${msg.id}`}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                        <circle cx="11" cy="11" r="8" />
                                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                      </svg>
                                      <span>Retrieval details</span>
                                    </button>
                                  )}
                                </div>

                                {/* Evidence for the selected citation, directly beneath the answer it supports */}
                                {selectedCitation && selectedCitation.messageId === msg.id && (
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
                                    index={currentCitationIndex}
                                    total={activeCitations.length}
                                    onPrevious={handlePreviousCitation}
                                    onNext={handleNextCitation}
                                    onClose={closeEvidence}
                                  />
                                )}
                              </div>
                            )}

                            {/* Status Strip */}
                            <div className="status-strip" data-testid="status-strip">
                              {typeof msg.latency === 'number' && (
                                <div className="status-strip-item">
                                  <span>{msg.latency.toFixed(2)}s</span>
                                </div>
                              )}
                              {msg.model && (
                                <div className="status-strip-item">
                                  <span>Model: {msg.model}</span>
                                </div>
                              )}
                              {msg.retrieved && (
                                <div className="status-strip-item">
                                  <span>{msg.retrieved.length} passages checked</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {chatLoading && (
                      <div className="thread-turn turn-assistant">
                        <div className="assistant-message message-loading" role="status">
                          <div className="loading-steps-container">
                            <div className="loading-step active">
                              <span className="step-spinner" />
                              <span className="step-label">Retrieving evidence from selected sources...</span>
                            </div>
                          </div>
                          <div className="skeleton-loader" aria-hidden="true">
                            <span className="skeleton-line line-long" />
                            <span className="skeleton-line line-long" />
                            <span className="skeleton-line line-med" />
                          </div>
                          {onStopGeneration && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm stop-gen-btn"
                              onClick={handleSafeStopGeneration}
                            >
                              Stop generation
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <div ref={threadBottomRef} />
                  </div>
                </div>
              </div>

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
                placeholder="Ask about your selected materials"
              />
            </>
          )}
        </section>

        <div
          className={`context-slot ${isContextCollapsed ? 'is-collapsed' : ''}`}
        >
        {/* --------------------------------------------------------------------
            RIGHT: floating materials panel (sources)
            -------------------------------------------------------------------- */}
        <aside
          className={`workspace-sidebar workspace-context-panel ${!isContextCollapsed ? 'sidebar-open' : ''}`}
          id="workspace-sources-panel" aria-hidden={isContextCollapsed} ref={contextPanelRef} tabIndex={-1}
          aria-label={contextView === 'notes' ? 'Saved notes' : contextView === 'retrieval' ? 'Retrieval' : 'Sources'}
        >
          {/* Sidebar Tab Header */}
          <div className="workspace-sidebar-header">
            <h2 className="sources-panel-title">{contextView === 'notes' ? 'Saved notes' : contextView === 'retrieval' ? 'Retrieval' : 'Sources'}</h2>

            <button
              type="button"
              className="panel-collapse-btn panel-toggle-btn"
              onClick={closeContextPanel}
              title="Collapse sources panel"
              aria-label="Collapse sources panel"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="3.5" />
                <line x1="9" y1="9" x2="9" y2="15" />
              </svg>
            </button>
          </div>

          <div className="context-view-switcher sidebar-segment-switcher" role="group" aria-label="Panel view">
            <button type="button" className={`segment-btn ${contextView === 'sources' ? 'active' : ''}`}
              aria-pressed={contextView === 'sources'} onClick={() => setContextView('sources')}>Sources</button>
            <button type="button" className={`segment-btn ${contextView === 'notes' ? 'active' : ''}`}
              aria-pressed={contextView === 'notes'} onClick={() => setContextView('notes')}>Notes ({notes.length})</button>
            <button type="button" className={`segment-btn ${contextView === 'retrieval' ? 'active' : ''}`}
              aria-pressed={contextView === 'retrieval'} onClick={() => setContextView('retrieval')}
              data-testid="right-panel-tab-retrieval">Retrieval</button>
          </div>

          {/* SOURCES: add / note actions, link search, selection row, then the list (or the drop zone when empty) */}
          {contextView === 'sources' && (
          <div
            className={`sidebar-tab-content sources-panel-body ${isPanelDragOver ? 'is-drag-over' : ''}`}
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
            {selectedCitation && (
              <section className="selected-source-card" aria-label="Selected source" data-testid="selected-source-card" ref={selectedCardRef} tabIndex={-1}>
                <div className="selected-source-head">
                  <h3 className="selected-source-title">Selected source</h3>
                  <button type="button" className="selected-source-clear" onClick={closeEvidence}>Clear</button>
                </div>
                <p className="selected-source-name" title={matchedSource?.title || selectedCitation.file}>
                  {matchedSource?.title || selectedCitation.file}
                </p>
                <p className="selected-source-line" data-testid="selected-source-line">
                  <span>Page {selectedCitation.page}</span>
                  {matchedSource && <span>v{matchedSource.version}</span>}
                  {matchedSource && matchedSource.page_count > 0 && <span>{matchedSource.page_count} pages</span>}
                  {matchedSource && <span>{matchedSource.status === 'ready' ? 'Ready' : matchedSource.status}</span>}
                </p>
                {selectedCitation.file !== (matchedSource?.title || selectedCitation.file) && (
                  <p className="selected-source-file" title={selectedCitation.file}>{selectedCitation.file}</p>
                )}
                {isUnknownSource && (
                  <p className="selected-source-note">This file is not among the notebook&rsquo;s current sources.</p>
                )}
                {isHistoricalOnly && (
                  <p className="selected-source-note">
                    {isSourceDeleted ? 'This source was removed from the notebook.' : `Replaced since this answer (cited v${selectedCitation.source_version ?? 1}).`}
                  </p>
                )}
                {matchedSource && (
                  <button type="button" className="selected-source-view" onClick={() => handleOpenSourceViewer(matchedSource)}>
                    View full source
                  </button>
                )}
                {!messages.some((m) => m.id === selectedCitation.messageId) && (
                  <EvidenceBody
                    citation={selectedCitation}
                    passages={passages}
                    loading={passageLoading}
                    retrievedChunks={retrievedMatchingChunks}
                    isHighlighted={isChunkHighlighted}
                    sourceRemoved={isSourceDeleted}
                    sourceReplaced={isSourceReplaced}
                    currentVersion={matchedSource?.version}
                  />
                )}
              </section>
            )}
            <div className="sources-action-row">
              <button type="button" className="sources-pill-btn" onClick={() => setIsAddSourceOpen(true)} data-testid="add-source-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Add sources</span>
              </button>
              <button type="button" className="sources-pill-btn" onClick={() => setIsCreateNoteOpen(true)} data-testid="create-note-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Create note</span>
              </button>
            </div>

            <form className="sources-web-search" role="search" aria-label="Add a web page as a source" onSubmit={handleWebSearch}>
              <input
                type="search"
                className="sources-web-input"
                placeholder="Search the web for new sources"
                aria-label="Search the web for new sources"
                value={webQuery}
                onChange={(e) => { setWebQuery(e.target.value); if (webHint) setWebHint(''); }}
              />
              <div className="sources-web-controls">
                <label className="sources-select">
                  <span className="sr-only">Where to search</span>
                  <select defaultValue="web" aria-label="Where to search">
                    <option value="web">Web</option>
                  </select>
                </label>
                <button type="submit" className="sources-web-go" aria-label="Add this link as a source" title="Add this link as a source">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="13 6 19 12 13 18" />
                  </svg>
                </button>
              </div>
              {webHint && <p className="sources-web-hint" role="status">{webHint}</p>}
            </form>

            {sources.length === 0 ? (
              <button
                type="button"
                className="sources-drop-zone"
                onClick={() => setIsAddSourceOpen(true)}
                data-testid="sources-drop-zone"
              >
                <svg className="sources-drop-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span className="sources-drop-title">Drop PDFs here or click to browse</span>
                <span className="sources-drop-hint">PDFs, links, pasted text</span>
              </button>
            ) : (
              <>
                <div className="sources-select-row">
                  <button
                    type="button"
                    className={`sources-filter-btn ${isFilterOpen ? 'active' : ''}`}
                    aria-label="Filter sources by name"
                    aria-pressed={isFilterOpen}
                    title="Filter sources by name"
                    onClick={() => { setIsFilterOpen((open) => !open); setSourceSearch(''); }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <line x1="4" y1="7" x2="20" y2="7" />
                      <line x1="7" y1="12" x2="17" y2="12" />
                      <line x1="10" y1="17" x2="14" y2="17" />
                    </svg>
                  </button>
                  <label className="sources-select-all">
                    <span>Select all</span>
                    <input
                      type="checkbox"
                      ref={selectAllRef}
                      className="source-row-checkbox"
                      checked={allReadySelected}
                      disabled={readySources.length === 0}
                      onChange={() => (allReadySelected ? handleClearSources() : handleSelectAllSources())}
                      aria-label="Select all sources"
                    />
                  </label>
                </div>
                <p className="sr-only" aria-live="polite">
                  {selectedSourceIds.length} of {readySources.length} selected
                </p>

                {isFilterOpen && (
                  <div className="source-search-container">
                    <input
                      type="text"
                      placeholder="Filter sources..."
                      aria-label="Filter sources by name"
                      value={sourceSearch}
                      onChange={(e) => setSourceSearch(e.target.value)}
                      className="source-search-input"
                      autoFocus
                    />
                  </div>
                )}

                <div className="sources-list-scroll">
                  {filteredSources.length === 0 ? (
                    <p className="sidebar-empty-box"><EmptyStateIcon />No sources matching search.</p>
                  ) : (
                    <ul className="workspace-sources-ul">
                      {filteredSources.map((s) => (
                        <SourceRow
                          key={s.id}
                          source={s}
                          isSelected={selectedSourceIds.includes(s.id)}
                          onToggle={() => handleToggleSource(s.id)}
                          onView={() => handleOpenSourceViewer(s)}
                          onRename={() => {
                            setRenamingSource(s);
                            setNewSourceTitle(s.title);
                          }}
                          onRetry={() => onRetrySource(s.id)}
                          onReplace={() => handleTriggerReplace(s.id)}
                          onRemove={() => {
                            if (window.confirm(`Remove source "${s.title}" from this notebook?`)) {
                              onDeleteSource(s.id);
                            }
                          }}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
          )}

          {/* RIGHT PANEL CONTENT: SAVED NOTES VIEW */}
          {contextView === 'notes' && (
            <div className="right-panel-body">
              <button
                type="button"
                className="btn btn-secondary btn-full btn-new-conv"
                onClick={() => {
                  setNoteFormTitle('');
                  setNoteFormContent('');
                  setEditingNote(null);
                  setIsCreateNoteOpen(true);
                }}
                data-testid="new-note-btn"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Create note</span>
              </button>

              {notes.length > 1 && (
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
                  <div className="sidebar-empty-box"><EmptyStateIcon />
                    <p>No saved notes yet.</p>
                    <p className="subtext">
                      Create personal notes or click &quot;Save to note&quot; on answers.
                    </p>
                  </div>
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
                            setEditingNote(n);
                            setNoteFormTitle(n.title);
                            setNoteFormContent(n.content);
                            setIsCreateNoteOpen(true);
                          }
                        }}
                        onClick={() => {
                          setEditingNote(n);
                          setNoteFormTitle(n.title);
                          setNoteFormContent(n.content);
                          setIsCreateNoteOpen(true);
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
                        <p className="note-snippet-text">{n.content}</p>
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
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            </div>
          )}


          {/* RIGHT PANEL CONTENT: RETRIEVAL MAP VIEW */}
          {contextView === 'retrieval' && (
            <div className="right-panel-body retrieval-panel-body">
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

      {/* ======================================================================
          MODALS: Add Source, View Source, Rename Source, Note, Settings
          ====================================================================== */}
      {(isAddSourceOpen || hasOpenedAddSource.current) && (
        <SourceModal
          isOpen={isAddSourceOpen}
          initialFiles={droppedFiles}
          initialUrl={initialUrl}
          onClose={() => { setIsAddSourceOpen(false); setDroppedFiles([]); setInitialUrl(''); }}
          onUploadFiles={onUploadFiles}
          onPasteText={onPasteText}
          onAddUrl={onAddUrl}
        />
      )}

      {viewingSource && (
        <SourceViewerModal
          source={viewingSource}
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

      {/* Create / Edit Note Modal */}
      {isCreateNoteOpen && (
        <div className="modal-backdrop" onClick={() => setIsCreateNoteOpen(false)}>
          <div ref={createNoteModalRef} className="modal-content modal-content-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingNote ? 'Edit Note' : 'Create Note'}</h2>
              <button type="button" className="modal-close-btn" onClick={() => setIsCreateNoteOpen(false)} aria-label="Close">
                &times;
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!noteFormTitle.trim() || !noteFormContent.trim()) return;
                if (editingNote) {
                  await onUpdateNote(editingNote.id, noteFormTitle.trim(), noteFormContent.trim());
                } else {
                  await onCreateNote(noteFormTitle.trim(), noteFormContent.trim());
                }
                setIsCreateNoteOpen(false);
              }}
              className="modal-form"
            >
              <div className="form-group">
                <label htmlFor="note-title-input">Note Title *</label>
                <input
                  id="note-title-input"
                  type="text"
                  required
                  value={noteFormTitle}
                  onChange={(e) => setNoteFormTitle(e.target.value)}
                  autoFocus
                />
              </div>
              {editingNote?.citations && editingNote.citations.length > 0 && (
                <div className="form-group">
                  <label>Referenced Sources</label>
                  <div className="note-citations-chips">
                    {editingNote.citations.map((c, cIdx) => (
                      <button
                        key={cIdx}
                        type="button"
                        className="citation-chip note-citation-chip"
                        onClick={() => {
                          setIsCreateNoteOpen(false);
                          handleSelectCitation(c, editingNote.id);
                        }}
                        title={`${c.file} (Page ${c.page})`}
                      >
                        <span className="citation-chip-num">{cIdx + 1}</span>
                        <span className="citation-chip-name">{c.file}</span>
                        <span className="citation-chip-page">p.{c.page}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="form-group">
                <label htmlFor="note-content-input">Content *</label>
                <textarea
                  id="note-content-input"
                  rows={8}
                  required
                  value={noteFormContent}
                  onChange={(e) => setNoteFormContent(e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">
                  {editingNote ? 'Save Changes' : 'Create Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notebook Settings Modal */}
      {isSettingsOpen && (
        <div className="modal-backdrop" onClick={() => setIsSettingsOpen(false)}>
          <div ref={settingsModalRef} className="modal-content modal-content-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Notebook Settings</h2>
              <button type="button" className="modal-close-btn" onClick={() => setIsSettingsOpen(false)} aria-label="Close">
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
                  onClick={() => setIsSettingsOpen(false)}
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
