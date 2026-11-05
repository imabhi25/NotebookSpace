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
import { RetrievalMapView } from './RetrievalMapView';

// Dialogs load when first opened and are fetched in the background once the workspace is idle.
const SourceModal = lazyView(() => import('./SourceModal').then((m) => m.SourceModal));
const SourceViewerModal = lazyView(() => import('./SourceViewerModal').then((m) => m.SourceViewerModal));
import { Composer } from './Composer';

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
  notes,
  activeConversationId,
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
  const [isCompact, setIsCompact] = useState(compactViewport);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(compactViewport);
  const [isRightCollapsed, setIsRightCollapsed] = useState(true);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [titleBelowBar, setTitleBelowBar] = useState(compactViewport);
  const headerRef = useRef<HTMLElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const titleMeasureRef = useRef<HTMLDivElement>(null);
  const leftToggleRef = useRef<HTMLButtonElement>(null);
  const rightToggleRef = useRef<HTMLButtonElement>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLElement>(null);
  const leftPanelRef = useRef<HTMLElement>(null);
  const rightPanelRef = useRef<HTMLElement>(null);
  const closeLeftPanel = () => { setIsLeftCollapsed(true); leftToggleRef.current?.focus(); };
  const closeRightPanel = () => { setIsRightCollapsed(true); rightToggleRef.current?.focus(); };

  useEffect(() => {
    let wasCompact = compactViewport();
    const onResize = () => {
      const next = compactViewport();
      if (next === wasCompact) return;
      wasCompact = next;
      setIsCompact(next);
      setIsLeftCollapsed(next);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
    if (chatAreaRef.current) chatAreaRef.current.inert = isCompact && (!isLeftCollapsed || !isRightCollapsed);
  }, [isCompact, isLeftCollapsed, isRightCollapsed]);

  useEffect(() => {
    if (isCompact && !isLeftCollapsed) leftPanelRef.current?.focus();
  }, [isCompact, isLeftCollapsed]);

  useEffect(() => {
    if (isCompact && !isRightCollapsed) rightPanelRef.current?.focus();
  }, [isCompact, isRightCollapsed]);

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

  // Left sidebar active tab: 'sources' | 'conversations'
  const [isPanelDragOver, setIsPanelDragOver] = useState(false);

  // Sources panel width: a fixed default the user can drag between limits; the choice is remembered.
  const SOURCES_WIDTH_KEY = 'notebookspace_sources_panel_width';
  const SOURCES_WIDTH_MIN = 300;
  const SOURCES_WIDTH_MAX = 560;
  // The chat keeps at least this much room (plus the body padding and gap), so the panel can never cover it.
  const CHAT_MIN_WIDTH = 420;
  const workspaceBodyRef = useRef<HTMLDivElement>(null);
  const sourcesWidthLimit = () => {
    const bodyWidth = workspaceBodyRef.current?.clientWidth || 0;
    if (!bodyWidth) return SOURCES_WIDTH_MAX;
    return Math.max(SOURCES_WIDTH_MIN, Math.min(SOURCES_WIDTH_MAX, bodyWidth - CHAT_MIN_WIDTH - 36));
  };
  const clampSourcesWidth = (value: number) => Math.round(Math.min(sourcesWidthLimit(), Math.max(SOURCES_WIDTH_MIN, value)));
  const [sourcesWidth, setSourcesWidth] = useState<number | null>(() => {
    try {
      const stored = Number(window.localStorage.getItem(SOURCES_WIDTH_KEY));
      return stored ? clampSourcesWidth(stored) : null;
    } catch {
      return null;
    }
  });
  const [isResizingSources, setIsResizingSources] = useState(false);
  const resizeStart = useRef<{ pointerX: number; width: number } | null>(null);
  const railRef = useRef<HTMLElement>(null);
  const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !leftPanelRef.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    resizeStart.current = { pointerX: e.clientX, width: leftPanelRef.current.getBoundingClientRect().width };
    setIsResizingSources(true);
  };
  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStart.current) return;
    setSourcesWidth(clampSourcesWidth(resizeStart.current.width + e.clientX - resizeStart.current.pointerX));
  };
  const handleResizeEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStart.current) return;
    const width = clampSourcesWidth(resizeStart.current.width + e.clientX - resizeStart.current.pointerX);
    resizeStart.current = null;
    setIsResizingSources(false);
    setSourcesWidth(width);
    try {
      window.localStorage.setItem(SOURCES_WIDTH_KEY, String(width));
    } catch {
      // ignore
    }
  };
  const handleResizeReset = () => {
    setSourcesWidth(null);
    try {
      window.localStorage.removeItem(SOURCES_WIDTH_KEY);
    } catch {
      // ignore
    }
  };
  // Whichever of the panel and the rail is not showing is taken out of the tab order and the accessibility tree.
  useEffect(() => {
    if (leftPanelRef.current) leftPanelRef.current.inert = isLeftCollapsed;
    if (railRef.current) railRef.current.inert = !isLeftCollapsed;
  }, [isLeftCollapsed]);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);

  // Right contextual panel tab: 'passage' | 'notes' | 'retrieval'
  const [rightPanelTab, setRightPanelTab] = useState<'passage' | 'notes' | 'retrieval'>('passage');

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

  // Citation inspection state
  const [selectedCitation, setSelectedCitation] = useState<ActiveCitation | null>(null);
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [passageLoading, setPassageLoading] = useState(false);

  // Composer & Turn Feedback
  const [question, setQuestion] = useState('');
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
        } else if (isCompact && !isRightCollapsed) {
          closeRightPanel();
        } else if (isCompact && !isLeftCollapsed) {
          closeLeftPanel();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [renamingSource, isCreateNoteOpen, isSettingsOpen, viewingSource, isAddSourceOpen, isActionsOpen, isCompact, isLeftCollapsed, isRightCollapsed]);

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
  const handleSelectCitation = (cit: Citation, messageId: string) => {
    setSelectedCitation({ ...cit, messageId });
    setRightPanelTab('passage');
    setIsRightCollapsed(false); // One open state for desktop, tablet, and phone.
    if (isCompact) setIsLeftCollapsed(true); // Preserve citation focus on small screens.
    loadPassages(cit);

  };

  const loadPassages = async (cit: Citation) => {
    const matchingSource = sources.find((s) => s.id === cit.source_id);
    const isHistoricalOnly =
      Boolean(cit.source_id && !matchingSource) ||
      Boolean(cit.source_id && matchingSource && typeof cit.source_version === 'number' && matchingSource.version !== cit.source_version);

    if (isHistoricalOnly) {
      setPassages([]);
      return;
    }

    setPassageLoading(true);
    try {
      const lookupFile = matchingSource?.file_name || cit.file;
      const data = await api.getPassages(lookupFile, cit.page);
      // Backup guard: deduplicate passages by chunk_index & text
      const seen = new Set<string>();
      const deduped = data.filter((p) => {
        const key = `${p.chunk_index ?? ''}:${(p.text || p.chunk_text || '').trim()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setPassages(deduped);
    } catch {
      setPassages([]);
    } finally {
      setPassageLoading(false);
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
      handleSelectCitation(activeCitations[currentCitationIndex - 1], selectedCitation.messageId);
    }
  };

  const handleNextCitation = () => {
    if (hasNextCitation && selectedCitation?.messageId) {
      handleSelectCitation(activeCitations[currentCitationIndex + 1], selectedCitation.messageId);
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
      setRightPanelTab('notes');
      setIsRightCollapsed(false); // Auto-expand right panel on save note at every viewport.
      if (isCompact) setIsLeftCollapsed(true);
      setTimeout(() => setSavedNoteMsgId(null), 2500);
    } finally {
      setSavingNoteMsgId(null);
    }
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
    <div className="workspace-root workspace-layout" data-left-open={!isLeftCollapsed} data-right-open={!isRightCollapsed}>
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
          <button type="button" ref={leftToggleRef}
            className={`workspace-toggle-btn ${!isLeftCollapsed ? 'active' : ''}`}
            onClick={() => setIsLeftCollapsed(!isLeftCollapsed)}
            title={isLeftCollapsed ? 'Show sources panel' : 'Hide sources panel'}
            aria-label="Toggle sources panel" aria-expanded={!isLeftCollapsed} aria-controls="workspace-sources-panel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" />
            </svg>
            <span className="toggle-label">Sources</span>
          </button>
          <button type="button" ref={rightToggleRef}
            className={`workspace-toggle-btn ${!isRightCollapsed ? 'active' : ''}`}
            onClick={() => setIsRightCollapsed(!isRightCollapsed)}
            title={isRightCollapsed ? 'Show notes & passage inspector' : 'Hide notes & passage inspector'}
            aria-label="Toggle inspector panel" aria-expanded={!isRightCollapsed} aria-controls="workspace-inspector-panel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 3v18" />
            </svg>
            <span className="toggle-label">{rightPanelTab === 'passage' && selectedCitation ? 'Passage' : 'Notes'}</span>
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
      <div className="workspace-body" ref={workspaceBodyRef}>
        {isCompact && (!isLeftCollapsed || !isRightCollapsed) && (
          <div className="sidebar-overlay workspace-panels-overlay" aria-hidden="true"
            onClick={() => { setIsLeftCollapsed(true); setIsRightCollapsed(true); leftToggleRef.current?.focus(); }} />
        )}
        <div
          className={`sources-slot ${isLeftCollapsed ? 'is-collapsed' : ''} ${isResizingSources ? 'is-resizing' : ''}`}
          style={sourcesWidth ? ({ '--sources-panel-user-width': `${sourcesWidth}px` } as React.CSSProperties) : undefined}
        >
          <nav className="workspace-sources-rail" aria-label="Sources" ref={railRef} aria-hidden={!isLeftCollapsed}>
            <button type="button" className="panel-toggle-btn" aria-label="Open sources panel" title="Open sources panel"
              aria-controls="workspace-sources-panel" aria-expanded={false}
              onClick={() => setIsLeftCollapsed(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="3.5" />
                <line x1="9" y1="9" x2="9" y2="15" />
              </svg>
            </button>
          </nav>
        {/* --------------------------------------------------------------------
            1. LEFT PANEL: NotebookLM's Source Workflow & Compact History
            -------------------------------------------------------------------- */}
        <aside
          className={`workspace-sidebar ${!isLeftCollapsed ? 'sidebar-open' : ''}`}
          id="workspace-sources-panel" aria-hidden={isLeftCollapsed} ref={leftPanelRef} tabIndex={-1}
          aria-label="Sources"
        >
          {/* Sidebar Tab Header */}
          <div className="workspace-sidebar-header">
            <h2 className="sources-panel-title">Sources</h2>

            <button
              type="button"
              className="panel-collapse-btn panel-toggle-btn"
              onClick={closeLeftPanel}
              title="Collapse sources panel"
              aria-label="Collapse sources panel"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="3.5" />
                <line x1="9" y1="9" x2="9" y2="15" />
              </svg>
            </button>
          </div>

          {/* SOURCES: add / note actions, link search, selection row, then the list (or the drop zone when empty) */}
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
                <label className="sources-select">
                  <span className="sr-only">Research depth</span>
                  <select defaultValue="fast" aria-label="Research depth">
                    <option value="fast">Fast Research</option>
                    <option value="deep" disabled>Deep Research (soon)</option>
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
        </aside>
          <div
            className="sources-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sources panel"
            title="Drag to resize. Double-click to reset."
            onPointerDown={handleResizeStart}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
            onDoubleClick={handleResizeReset}
          />
        </div>

        {/* --------------------------------------------------------------------
            2. CENTER CHAT AREA: ChatGPT / Claude Reading Experience
            -------------------------------------------------------------------- */}
        <section className="workspace-main-area" aria-label="Chat" ref={chatAreaRef}>
          <div className="workspace-chat-context">
            <span className="selected-sources-pill" data-testid="selected-sources-pill">
              {selectedSourceIds.length} {selectedSourceIds.length === 1 ? 'source' : 'sources'} selected
            </span>
          </div>
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
                  onStop={onStopGeneration}
                  selectedSourceCount={selectedSourceIds.length}
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
                            <div className="user-message-bubble">{msg.content}</div>
                            {(() => {
                              const msgIdx = messages.findIndex((m) => m.id === msg.id);
                              const nextMsg = messages[msgIdx + 1];
                              if (nextMsg && nextMsg.role === 'assistant' && nextMsg.abstained && nextMsg.abstain_reason === 'generation_failed') {
                                return (
                                  <div className="user-message-inline-error" data-testid={`inline-error-${msg.id}`}>
                                    <span className="error-icon" aria-hidden="true">✕</span>
                                    <span>Failed to generate response.</span>
                                    <button
                                      type="button"
                                      className="user-turn-retry-btn"
                                      data-testid={`retry-inline-btn-${msg.id}`}
                                      onClick={() => {
                                        onSendMessage(msg.content, {
                                          is_retry: true,
                                          retry_message_id: nextMsg.id,
                                        });
                                      }}
                                    >
                                      Retry
                                    </button>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        ) : (
                          <div className="assistant-message">
                            {/* 1. Abstention / Not Found view */}
                            {msg.abstained ? (
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
                                              onClick={() =>
                                                handleSelectCitation({ file: claim.file, page: claim.page }, msg.id)
                                              }
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
                                  />
                                </div>

                                {/* Citation Chips Row */}
                                {msg.citations && msg.citations.length > 0 && (
                                  <div className="citations-section">
                                    <div className="chips-row">
                                      {msg.citations.map((cit, cIdx) => {
                                        const isActive =
                                          selectedCitation?.messageId === msg.id &&
                                          normalizeFileName(selectedCitation.file) ===
                                            normalizeFileName(cit.file) &&
                                          selectedCitation.page === cit.page;

                                        return (
                                          <button
                                            key={cIdx}
                                            type="button"
                                            className={`chip ${isActive ? 'active' : ''}`}
                                            onClick={() => handleSelectCitation(cit, msg.id)}
                                            data-testid={`citation-chip-${cIdx}`}
                                          >
                                            <span className="chip-badge">[{cIdx + 1}]</span>
                                            <span>
                                              {cit.file} p.{cit.page}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

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
                                </div>
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
                              onClick={onStopGeneration}
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
                onStop={onStopGeneration}
                selectedSourceCount={selectedSourceIds.length}
              />
            </>
          )}
        </section>

        {/* --------------------------------------------------------------------
            3. RIGHT CONTEXTUAL PANEL: Supporting Passage OR Saved Notes
            -------------------------------------------------------------------- */}
        <aside
          className={`workspace-right-panel ${!isRightCollapsed ? 'right-open' : ''}`}
          id="workspace-inspector-panel" hidden={isRightCollapsed} ref={rightPanelRef} tabIndex={-1}
          data-testid="passage-pane"
          aria-label="Inspector and Notes Panel"
        >
          {/* Right Panel Header with Dual Mode Switcher */}
          <div className="right-panel-header">
            <div className="sidebar-segment-switcher">
              <button
                type="button"
                className={`segment-btn ${rightPanelTab === 'passage' ? 'active' : ''}`}
                onClick={() => setRightPanelTab('passage')}
              >
                Passage
              </button>
              <button
                type="button"
                className={`segment-btn ${rightPanelTab === 'notes' ? 'active' : ''}`}
                onClick={() => setRightPanelTab('notes')}
              >
                Notes ({notes.length})
              </button>
              <button
                type="button"
                className={`segment-btn ${rightPanelTab === 'retrieval' ? 'active' : ''}`}
                onClick={() => setRightPanelTab('retrieval')}
                data-testid="right-panel-tab-retrieval"
              >
                Retrieval
              </button>
            </div>

            <div className="right-header-actions">
              {/* Citation Step Controls when in Passage mode */}
              {rightPanelTab === 'passage' && selectedCitation && (
                <div className="citation-step-controls">
                  <button
                    type="button"
                    className="btn-step"
                    onClick={handlePreviousCitation}
                    disabled={!hasPreviousCitation}
                    aria-label="Previous citation"
                    title="Previous citation"
                  >
                    Prev
                  </button>
                  {activeCitations.length > 0 && currentCitationIndex !== -1 && (
                    <span
                      className="citation-step-counter"
                      aria-label={`Citation ${currentCitationIndex + 1} of ${activeCitations.length}`}
                    >
                      {currentCitationIndex + 1}/{activeCitations.length}
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn-step"
                    onClick={handleNextCitation}
                    disabled={!hasNextCitation}
                    aria-label="Next citation"
                    title="Next citation"
                  >
                    Next
                  </button>
                </div>
              )}

              <button
                type="button"
                className="panel-collapse-btn"
                onClick={closeRightPanel}
                title="Collapse inspector panel"
                aria-label="Close source panel"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* RIGHT PANEL CONTENT: PASSAGE VIEW */}
          {rightPanelTab === 'passage' && (
            <div className="right-panel-body">
              {selectedCitation && (
                <div className="passage-info-bar">
                  <span className="passage-doc-title" title={selectedCitation.file}>
                    {selectedCitation.file}
                  </span>
                  <span className="passage-page-badge">Page {selectedCitation.page}</span>
                </div>
              )}

              {isHistoricalOnly && (
                <div className="historical-citation-alert" role="alert" data-testid="historical-citation-alert">
                  <div className="alert-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>
                      {isSourceDeleted ? 'Original Source Removed' : `Source Replaced (v${selectedCitation?.source_version ?? 1})`}
                    </span>
                  </div>
                  <p className="historical-notice-desc">
                    {isSourceDeleted
                      ? `The source "${selectedCitation?.file}" has been deleted from this notebook. Historical citation evidence is preserved below.`
                      : `The source "${selectedCitation?.file}" was replaced with a newer version (currently v${matchedSource?.version}). Displaying verified historical excerpt captured at answer time:`}
                  </p>
                </div>
              )}

              {passageLoading ? (
                <div className="passage-loading-state" role="status">
                  <p className="empty-state">Loading passage text...</p>
                  <div className="skeleton-loader" aria-hidden="true">
                    <span className="skeleton-line line-long" />
                    <span className="skeleton-line line-long" />
                    <span className="skeleton-line line-long" />
                    <span className="skeleton-line line-short" />
                  </div>
                </div>
              ) : selectedCitation ? (
                <div
                  className="passage-content"
                  data-testid="passage-content"
                  key={`${selectedCitation.file}:${selectedCitation.page}`}
                >
                  <div className="passage-content-banner">
                    Showing content from <strong>{selectedCitation.file}</strong> (Page {selectedCitation.page}):
                  </div>

                  {passages.length > 0 ? (
                    <div className="passage-chunks-list">
                      {passages.map((p, idx) => {
                        const text = p.text || p.chunk_text || '';
                        const highlighted = hasRetrievedChunkText && isChunkHighlighted(text, p.chunk_index);

                        return (
                          <div
                            key={idx}
                            className={`passage-chunk ${highlighted ? 'passage-chunk-highlighted' : ''}`}
                          >
                            {highlighted && (
                              <div className="chunk-highlight-badge">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                </svg>
                                <span>Cited Passage Match</span>
                              </div>
                            )}
                            <p className="passage-chunk-text">{text}</p>
                          </div>
                        );
                      })}
                    </div>
                  ) : hasRetrievedChunkText ? (
                    <div className="passage-chunks-list">
                      {retrievedMatchingChunks.map((r, idx) => (
                        <div key={idx} className="passage-chunk passage-chunk-highlighted">
                          <div className="chunk-highlight-badge">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                            <span>Cited Passage Match</span>
                          </div>
                          <p className="passage-chunk-text">{r.text || r.chunk_text}</p>
                        </div>
                      ))}
                    </div>
                  ) : selectedCitation.excerpt ? (
                    <div className="passage-chunks-list">
                      <div className="passage-chunk passage-chunk-highlighted">
                        <div className="chunk-highlight-badge">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                          <span>Historical Verified Excerpt</span>
                        </div>
                        <p className="passage-chunk-text">{selectedCitation.excerpt}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="empty-state">No text chunks found for this page.</p>
                  )}
                </div>
              ) : (
                <div className="right-panel-empty-state">
                  <div className="empty-icon-circle">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                  </div>
                  <h3>Supporting Passage</h3>
                  <p>
                    Click any citation chip or conflict card in the chat to inspect its cited source passage here.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* RIGHT PANEL CONTENT: SAVED NOTES VIEW */}
          {rightPanelTab === 'notes' && (
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
          {rightPanelTab === 'retrieval' && (
            <div className="right-panel-body retrieval-panel-body">
              <RetrievalMapView
                subjectId={subject.id}
                conversationId={activeConversationId || undefined}
                sources={sources}
              />
            </div>
          )}
        </aside>
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
          <div className="modal-content modal-content-sm" onClick={(e) => e.stopPropagation()}>
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
