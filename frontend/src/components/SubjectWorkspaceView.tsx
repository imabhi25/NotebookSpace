import { PendingUpload } from '../uploads';
import { EmptyStateIcon } from './EmptyStateIcon';
import React, { useState, useEffect, useRef } from 'react';
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
  formatConventionTopic,
  formatSourceTitle,
} from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { lazyView, preloadWhenIdle } from '../lazyView';

// Dialogs load when first opened and are fetched in the background once the workspace is idle.
const SourceModal = lazyView(() => import('./SourceModal').then((m) => m.SourceModal));
const SourceViewerModal = lazyView(() => import('./SourceViewerModal').then((m) => m.SourceViewerModal));
import { Composer } from './Composer';

interface SubjectWorkspaceViewProps {
  subject: Subject;
  sources: Source[];
  conversations: Conversation[];
  notes: Note[];
  activeConversationId: string | null;
  selectedSourceIds: string[];
  starterQuestions: string[];
  isDemoMode: boolean;
  currentUser?: User | null;
  onBackToDashboard: () => void;
  onSelectSources: (ids: string[]) => void;
  onSelectConversation: (convId: string) => void;
  onCreateConversation: () => Promise<void>;
  onRenameConversation: (convId: string, title: string) => Promise<void>;
  onDeleteConversation: (convId: string) => Promise<void>;
  onUploadFiles: (files: File[]) => void | Promise<void>;
  pendingUploads?: PendingUpload[];
  onRetryUpload?: (uploadId: string) => void;
  onDismissUpload?: (uploadId: string) => void;
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
  onStopGeneration?: () => void;
  onResetWorkspace?: () => Promise<void>;
  onToggleNotebooksDrawer?: () => void;
}

export const SubjectWorkspaceView: React.FC<SubjectWorkspaceViewProps> = ({
  subject,
  sources,
  conversations,
  notes,
  activeConversationId,
  selectedSourceIds,
  starterQuestions,
  isDemoMode,
  currentUser,
  onBackToDashboard,
  onSelectSources,
  onSelectConversation,
  onCreateConversation,
  onRenameConversation,
  onDeleteConversation,
  onUploadFiles,
  pendingUploads = [],
  onRetryUpload,
  onDismissUpload,
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
  onStopGeneration,
}) => {
  // --------------------------------------------------------------------------
  // LAYOUT STATE: Independently Collapsible Side Panels
  // --------------------------------------------------------------------------
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  const [isRightOpenMobile, setIsRightOpenMobile] = useState(false);

  // Left sidebar active tab: 'sources' | 'conversations'
  const [sidebarTab, setSidebarTab] = useState<'sources' | 'conversations'>('sources');

  // Right contextual panel tab: 'passage' | 'notes'
  // Dropping files anywhere on the Sources panel uploads them.
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const dragDepth = useRef(0);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files');

  const [rightPanelTab, setRightPanelTab] = useState<'tools' | 'passage' | 'notes'>('tools');

  // Search queries
  const [sourceSearch, setSourceSearch] = useState('');
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
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [renamingSource, isCreateNoteOpen, isSettingsOpen, viewingSource, isAddSourceOpen]);

  // Sources the answers in this conversation marked as current, and how often each source is cited.
  const currentSourceNames = React.useMemo(() => {
    const names = new Set<string>();
    for (const m of messages) {
      for (const conf of m.conflicts || []) {
        if (conf.resolution?.current_file) names.add(normalizeFileName(conf.resolution.current_file));
      }
    }
    return names;
  }, [messages]);

  const citationCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of messages) {
      const seen = new Set<string>();
      for (const c of m.citations || []) {
        const key = normalizeFileName(c.file);
        if (key && !seen.has(key)) {
          seen.add(key);
          counts[key] = (counts[key] || 0) + 1;
        }
      }
    }
    return counts;
  }, [messages]);

  // Compute superseded sources map from conversation messages
  const supersededSourcesMap = React.useMemo(() => {
    const map: Record<string, { supersededBy: string; topic: string }> = {};
    for (const m of messages) {
      if (Array.isArray(m.conflicts)) {
        for (const conf of m.conflicts) {
          if (conf.resolution?.current_file) {
            const currentNorm = normalizeFileName(conf.resolution.current_file);
            for (const claim of conf.claims || []) {
              const claimNorm = normalizeFileName(claim.file);
              if (claimNorm && claimNorm !== currentNorm) {
                map[claimNorm] = {
                  supersededBy: conf.resolution.current_file,
                  topic: conf.topic,
                };
              }
            }
          }
        }
      }
    }
    return map;
  }, [messages]);

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
    setIsRightCollapsed(false); // Auto-expand right panel
    setIsRightOpenMobile(true); // Auto-open right panel drawer on mobile/tablet
    setIsSidebarOpenMobile(false); // Close left drawer if open
    loadPassages(cit);
    setTimeout(() => {
      const panel = document.querySelector('.workspace-right-panel');
      if (panel && typeof panel.scrollIntoView === 'function') {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
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
      setPassages(data);
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
      setIsRightCollapsed(false); // Auto-expand right panel on save note
      setTimeout(() => setSavedNoteMsgId(null), 2500);
    } finally {
      setSavingNoteMsgId(null);
    }
  };

  // Tool tile counts, derived from the answers in the open conversation
  const conflictMessageCount = messages.filter(
    (m) => m.role === 'assistant' && (m.conflicts?.length ?? 0) > 0
  ).length;
  const conventionMessageCount = messages.filter(
    (m) => m.role === 'assistant' && (m.convention_mismatches?.length ?? 0) > 0
  ).length;
  const scrollToFirst = (selector: string) => {
    const el = document.querySelector(selector);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setIsRightOpenMobile(false);
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
    <div className="workspace-root">
      <input
        ref={replaceFileInputRef}
        type="file"
        accept=".pdf,.txt,.md,.markdown"
        style={{ display: 'none' }}
        onChange={handleReplaceFileChange}
      />

      {/* Mobile Drawer Overlay */}
      {(isSidebarOpenMobile || isRightOpenMobile) && (
        <div
          className="sidebar-overlay"
          onClick={() => {
            setIsSidebarOpenMobile(false);
            setIsRightOpenMobile(false);
          }}
          aria-hidden="true"
        />
      )}

      {/* ======================================================================
          COMPACT TOP BAR: NotebookSpace, back to subjects, current subject
          ====================================================================== */}
      <header className="workspace-top-bar">
        <div className="workspace-top-left">
          <button
            type="button"
            className="workspace-brand-link"
            onClick={onBackToDashboard}
            title="All notebooks"
            aria-label="Back to all notebooks"
          >
            <span className="brand-logo-letter-small" aria-hidden="true">N</span>
          </button>
          <h1 className="workspace-notebook-title" title={subject.name}>
            {subject.name}
          </h1>
        </div>

        <div className="workspace-top-right">
          {/* Panel toggles: only shown where the side panels become drawers */}
          <button
            type="button"
            className={`workspace-toggle-btn ${isSidebarOpenMobile ? 'active' : ''}`}
            onClick={() => setIsSidebarOpenMobile(!isSidebarOpenMobile)}
            title="Sources"
            aria-label="Toggle sources panel"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
            <span className="toggle-badge">{sources.length}</span>
          </button>

          <button
            type="button"
            className={`workspace-toggle-btn ${isRightOpenMobile ? 'active' : ''}`}
            onClick={() => setIsRightOpenMobile(!isRightOpenMobile)}
            title="Tools"
            aria-label="Toggle tools panel"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </button>

          <button
            type="button"
            className="btn-icon workspace-top-icon-btn"
            onClick={onCreateConversation}
            title="New conversation"
            aria-label="New conversation"
            data-testid="top-new-chat-btn"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <button
            type="button"
            className="btn-icon workspace-top-icon-btn"
            onClick={() => setIsSettingsOpen(true)}
            title="Notebook settings"
            aria-label="Notebook settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          {isDemoMode && (
            <span className="demo-pill" data-testid="demo-pill">
              Public demo
            </span>
          )}

          <span
            className="workspace-avatar"
            data-testid="guest-workspace-badge"
            title={currentUser?.email ? `Signed in as ${currentUser.email}` : 'Guest workspace, private to this browser'}
            aria-label={currentUser?.email ? `Signed in as ${currentUser.email}` : 'Guest workspace'}
            role="img"
          >
            {(currentUser?.email || 'G').charAt(0).toUpperCase()}
          </span>
        </div>
      </header>

      {/* ======================================================================
          3-COLUMN WORKSPACE BODY
          ====================================================================== */}
      <div className="workspace-body">
        {/* --------------------------------------------------------------------
            1. LEFT PANEL: NotebookLM's Source Workflow & Compact History
            -------------------------------------------------------------------- */}
        <aside
          className={`workspace-sidebar ${isLeftCollapsed ? 'panel-collapsed' : ''} ${
            isSidebarOpenMobile ? 'sidebar-open' : ''
          } ${isDraggingFiles ? 'is-drop-target' : ''}`}
          aria-label="Course Sources and Chats"
          onDragEnter={(e) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            dragDepth.current += 1;
            setIsDraggingFiles(true);
          }}
          onDragOver={(e) => {
            if (hasFiles(e)) e.preventDefault();
          }}
          onDragLeave={(e) => {
            if (!hasFiles(e)) return;
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setIsDraggingFiles(false);
          }}
          onDrop={(e) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            dragDepth.current = 0;
            setIsDraggingFiles(false);
            setSidebarTab('sources');
            const dropped = Array.from(e.dataTransfer.files);
            if (dropped.length > 0) void onUploadFiles(dropped);
          }}
        >
          {isDraggingFiles && (
            <div className="sources-drop-overlay" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>Drop to add to this notebook</span>
            </div>
          )}
          {/* Sidebar Tab Header */}
          <div className="workspace-sidebar-header">
            <div className="sidebar-segment-switcher">
              <button
                type="button"
                className={`segment-btn ${sidebarTab === 'sources' ? 'active' : ''}`}
                onClick={() => setSidebarTab('sources')}
              >
                Sources ({sources.length})
              </button>
              <button
                type="button"
                className={`segment-btn ${sidebarTab === 'conversations' ? 'active' : ''}`}
                onClick={() => setSidebarTab('conversations')}
              >
                Chats ({conversations.length})
              </button>
            </div>

            <button
              type="button"
              className="panel-collapse-btn"
              onClick={() => {
                setIsLeftCollapsed(true);
                setIsSidebarOpenMobile(false);
              }}
              title="Collapse sources panel"
              aria-label="Collapse sources panel"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </div>

          {/* TAB 1: SOURCES (NotebookLM Workflow) */}
          {sidebarTab === 'sources' && (
            <div className="sidebar-tab-content">
              <div className="sources-action-row">
                <button
                  type="button"
                  className="btn-pill btn-add-sources"
                  onClick={() => setIsAddSourceOpen(true)}
                  data-testid="add-source-btn"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Add sources</span>
                </button>
                <button
                  type="button"
                  className="btn-pill"
                  onClick={() => {
                    setNoteFormTitle('');
                    setNoteFormContent('');
                    setEditingNote(null);
                    setIsCreateNoteOpen(true);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Create note</span>
                </button>
              </div>
              <div className="sources-header-bar">
                <span className="selection-badge">
                  {selectedSourceIds.length} of {readySources.length} selected
                </span>
                <div className="selection-controls">
                  <button
                    type="button"
                    className="btn-link"
                    onClick={handleSelectAllSources}
                    disabled={readySources.length === 0}
                  >
                    Select all
                  </button>
                  <span>&bull;</span>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={handleClearSources}
                    disabled={selectedSourceIds.length === 0}
                  >
                    Clear
                  </button>
                </div>
              </div>


              {sources.length > 2 && (
                <div className="source-search-container">
                  <input
                    type="text"
                    placeholder="Search sources..."
                    value={sourceSearch}
                    onChange={(e) => setSourceSearch(e.target.value)}
                    className="source-search-input"
                  />
                </div>
              )}

              <div className="sources-list-scroll">
                {pendingUploads.length > 0 && (
                  <ul className="pending-uploads-ul" aria-label="Uploads in progress">
                    {pendingUploads.map((u) => (
                      <li key={u.id} className={`pending-upload-item ${u.error ? 'has-error' : ''}`}>
                        <div className="pending-upload-top">
                          <span className="pending-upload-name" title={u.name}>{u.name}</span>
                          {u.error ? (
                            <span className="pending-upload-actions">
                              {onRetryUpload && !u.rejected && (
                                <button type="button" className="btn-link" onClick={() => onRetryUpload(u.id)}>
                                  Retry
                                </button>
                              )}
                              {onDismissUpload && (
                                <button
                                  type="button"
                                  className="pending-upload-dismiss"
                                  onClick={() => onDismissUpload(u.id)}
                                  aria-label={`Dismiss ${u.name}`}
                                >
                                  &times;
                                </button>
                              )}
                            </span>
                          ) : (
                            <span className="pending-upload-percent">{u.progress}%</span>
                          )}
                        </div>
                        {u.error ? (
                          <p className="pending-upload-error" role="alert">{u.error}</p>
                        ) : (
                          <div
                            className="pending-upload-bar"
                            role="progressbar"
                            aria-label={`Uploading ${u.name}`}
                            aria-valuenow={u.progress}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <span style={{ width: `${u.progress}%` }} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {sources.length === 0 && pendingUploads.length > 0 ? null : sources.length === 0 ? (
                  <div className="sidebar-empty-box"><EmptyStateIcon />
                    <p>No materials added yet.</p>
                    <p className="subtext">Drop files here or use Add sources.</p>
                  </div>
                ) : filteredSources.length === 0 ? (
                  <p className="sidebar-empty-box"><EmptyStateIcon />No sources matching search.</p>
                ) : (
                  <ul className="workspace-sources-ul">
                    {filteredSources.map((s) => {
                      const isReady = s.status === 'ready';
                      const isSelected = selectedSourceIds.includes(s.id);

                      return (
                        <li key={s.id} className={`workspace-source-item ${isSelected ? 'selected' : ''}`}>
                          <div className={`source-type-badge-icon badge-${(s.source_type || 'doc').toLowerCase()}`}>
                            {s.source_type === 'pdf' ? (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                                <polyline points="10 9 9 9 8 9" />
                              </svg>
                            ) : s.source_type === 'url' ? (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="2" y1="12" x2="22" y2="12" />
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                              </svg>
                            ) : (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                              </svg>
                            )}
                          </div>

                          <div
                            className="source-info-col"
                            onClick={() => isReady && handleToggleSource(s.id)}
                            onKeyDown={(e) => {
                              if (e.target === e.currentTarget && isReady && (e.key === 'Enter' || e.key === ' ')) {
                                e.preventDefault();
                                handleToggleSource(s.id);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="source-title-row">
                              <span className="source-title-text" title={s.title}>
                                {s.title}
                              </span>
                              {(() => {
                                const supersededInfo =
                                  supersededSourcesMap[normalizeFileName(s.file_name)] ||
                                  supersededSourcesMap[normalizeFileName(s.title)];
                                if (!supersededInfo) return null;
                                return (
                                  <span
                                    className="source-superseded-tag"
                                    data-testid="source-superseded-tag"
                                    title={`Superseded by ${formatSourceTitle(supersededInfo.supersededBy, sources)}`}
                                  >
                                    Superseded
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="source-meta-row">
                              <span className="source-type-tag">{s.source_type === 'url' ? 'Web' : s.source_type === 'pdf' ? 'PDF' : 'Text'}</span>
                              {isReady ? (
                                <span>
                                  {s.page_count} {s.page_count === 1 ? 'page' : 'pages'}
                                  {(citationCounts[normalizeFileName(s.title)] || citationCounts[normalizeFileName(s.file_name)])
                                    ? ` · cited ${citationCounts[normalizeFileName(s.title)] || citationCounts[normalizeFileName(s.file_name)]}×`
                                    : ''}
                                </span>
                              ) : s.status === 'processing' ? (
                                <span className="status-processing">Reading…</span>
                              ) : (
                                <span className="status-failed" title={s.error_message || ''}>
                                  Failed
                                </span>
                              )}

                              <div className="source-actions-col">
                                <button
                                  type="button"
                                  className="source-item-btn"
                                  title="View content"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenSourceViewer(s);
                                  }}
                                  aria-label={`View ${s.title}`}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  className="source-item-btn"
                                  title="Rename source"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRenamingSource(s);
                                    setNewSourceTitle(s.title);
                                  }}
                                  aria-label={`Rename ${s.title}`}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                                  </svg>
                                </button>
                                {s.status === 'failed' && (s.source_type === 'url' || s.source_type === 'pasted') ? (
                                  <button
                                    type="button"
                                    className="source-item-btn"
                                    title="Retry ingestion"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onRetrySource(s.id);
                                    }}
                                    aria-label={`Retry ${s.title}`}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="1 4 1 10 7 10" />
                                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                    </svg>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="source-item-btn"
                                    title="Replace file"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleTriggerReplace(s.id);
                                    }}
                                    aria-label={`Replace ${s.title}`}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="23 4 23 10 17 10" />
                                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                    </svg>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="source-item-btn source-delete-btn"
                                  title="Remove source"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`Remove source "${s.title}" from this notebook?`)) {
                                      onDeleteSource(s.id);
                                    }
                                  }}
                                  aria-label={`Delete ${s.title}`}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="source-checkbox-col">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!isReady}
                              onChange={() => handleToggleSource(s.id)}
                              aria-label={`Select ${s.title}`}
                              data-testid={`source-checkbox-${s.id}`}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Compact Conversation History Underneath Sources */}
              {conversations.length > 0 && (
                <div className="compact-conversations-shelf">
                  <div className="shelf-header">
                    <span className="shelf-title">Recent Chats</span>
                    <button
                      type="button"
                      className="shelf-new-btn"
                      onClick={onCreateConversation}
                      title="New chat"
                    >
                      + New
                    </button>
                  </div>
                  <ul className="shelf-conv-list">
                    {conversations.slice(0, 4).map((c) => {
                      const isActive = c.id === activeConversationId;
                      return (
                        <li
                          key={c.id}
                          className={`shelf-conv-item ${isActive ? 'active' : ''}`}
                          onClick={() => onSelectConversation(c.id)}
                          tabIndex={0}
                          role="button"
                          onKeyDown={(e) => {
                            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              onSelectConversation(c.id);
                            }
                          }}
                          title={c.title}
                        >
                          <span className="shelf-conv-title">{c.title}</span>
                          <span className="shelf-conv-count">
                            {c.message_count ? `${c.message_count} msgs` : 'Empty'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CONVERSATIONS (Full Chat History) */}
          {sidebarTab === 'conversations' && (
            <div className="sidebar-tab-content">
              <button
                type="button"
                className="btn btn-secondary btn-full btn-new-conv"
                onClick={onCreateConversation}
                data-testid="new-conversation-btn"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>New conversation</span>
              </button>
              <ul className="workspace-conv-ul">
                {conversations.map((c) => {
                  const isActive = c.id === activeConversationId;
                  return (
                    <li
                      key={c.id}
                      className={`workspace-conv-item ${isActive ? 'active' : ''}`}
                      onClick={() => onSelectConversation(c.id)}
                          tabIndex={0}
                          role="button"
                          onKeyDown={(e) => {
                            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              onSelectConversation(c.id);
                            }
                          }}
                    >
                      <div className="conv-title-col" title={c.title}>
                        <span className="conv-title-text">{c.title}</span>
                        <span className="conv-meta-text">
                          {c.message_count ? `${c.message_count} messages` : 'Empty chat'}
                        </span>
                      </div>
                      <div className="conv-actions-col" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="source-item-btn"
                          title="Rename conversation"
                          onClick={() => {
                            const newName = window.prompt('Rename conversation:', c.title);
                            if (newName && newName.trim()) {
                              onRenameConversation(c.id, newName.trim());
                            }
                          }}
                          aria-label="Rename conversation"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="source-item-btn source-delete-btn"
                          title="Delete conversation"
                          onClick={() => {
                            if (window.confirm('Delete this conversation thread?')) {
                              onDeleteConversation(c.id);
                            }
                          }}
                          aria-label="Delete conversation"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Left Panel Footer: Subject Settings */}
          <div className="sidebar-bottom-bar">
            <button
              type="button"
              className="sidebar-settings-link"
              onClick={() => setIsSettingsOpen(true)}
              title="Notebook Settings"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1z" />
              </svg>
              <span>Notebook Settings</span>
            </button>
          </div>
        </aside>

        {/* --------------------------------------------------------------------
            2. CENTER CHAT AREA: ChatGPT / Claude Reading Experience
            -------------------------------------------------------------------- */}
        <main className="workspace-main-area">
          {/* Floating Reopen Button for Left Panel */}
          {isLeftCollapsed && (
            <button
              type="button"
              className="floating-reopen-btn left-reopen"
              onClick={() => setIsLeftCollapsed(false)}
              title="Open sources panel"
              aria-label="Open sources panel"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span>Sources ({sources.length})</span>
            </button>
          )}

          {/* Floating Reopen Button for Right Panel */}
          {isRightCollapsed && (
            <button
              type="button"
              className="floating-reopen-btn right-reopen"
              onClick={() => setIsRightCollapsed(false)}
              title="Open tools panel"
              aria-label="Open tools panel"
            >
              <span>Tools</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}

          {/* Conversation Thread */}
          {sources.length === 0 ? (
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

                                {/* Resolved conflict summary banner above answer */}
                                {msg.conflicts && msg.conflicts.some((c) => Boolean(c.resolution)) && (
                                  <div className="conflict-summary-banner" data-testid="conflict-summary-banner" role="status">
                                    <span className="summary-banner-icon" aria-hidden="true">💡</span>
                                    <span className="summary-banner-text">
                                      <strong>Heads up:</strong>{' '}
                                      {msg.conflicts
                                        .filter((c) => Boolean(c.resolution))
                                        .map((c, i) => (
                                          <span key={i}>
                                            {formatSourceTitle(c.resolution!.current_file, sources)} updates the {c.topic}.{' '}
                                          </span>
                                        ))}
                                    </span>
                                  </div>
                                )}

                                {/* Convention Pills above answer */}
                                {msg.conventions && msg.conventions.length > 0 && (
                                  <div className="conventions-pills-row" data-testid="conventions-pills">
                                    {msg.conventions.map((conv, idx) => {
                                      const isConvActive =
                                        selectedCitation?.messageId === msg.id &&
                                        normalizeFileName(selectedCitation?.file) === normalizeFileName(conv.file) &&
                                        selectedCitation?.page === conv.page;

                                      return (
                                        <button
                                          key={idx}
                                          type="button"
                                          className={`convention-pill ${conv.adopted ? 'adopted' : ''} ${isConvActive ? 'active' : ''}`}
                                          onClick={() => handleSelectCitation({ file: conv.file, page: conv.page }, msg.id)}
                                          data-testid={`convention-pill-${idx}`}
                                          aria-label={`Convention: ${conv.value} in ${formatSourceTitle(conv.file, sources)}`}
                                        >
                                          <span className="convention-pill-icon" aria-hidden="true">✦</span>
                                          <span>{conv.value} &middot; {formatSourceTitle(conv.file, sources)}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}

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
                                        <div className="conflict-topic">Conflict Topic: {conf.topic}</div>
                                        <div className="conflict-cards-row">
                                          {conf.claims.map((claim, clIdx) => {
                                            const isClaimActive =
                                              selectedCitation?.messageId === msg.id &&
                                              normalizeFileName(selectedCitation?.file) === normalizeFileName(claim.file) &&
                                              selectedCitation?.page === claim.page;
                                            const isCurrent =
                                              conf.resolution &&
                                              normalizeFileName(claim.file) === normalizeFileName(conf.resolution.current_file);
                                            const isSuperseded =
                                              conf.resolution &&
                                              normalizeFileName(claim.file) !== normalizeFileName(conf.resolution.current_file);

                                            return (
                                              <div
                                                key={clIdx}
                                                className={`conflict-source-card ${isCurrent ? 'claim-current' : ''} ${isSuperseded ? 'claim-superseded' : ''} ${isClaimActive ? 'active' : ''}`}
                                                onClick={() =>
                                                  handleSelectCitation({ file: claim.file, page: claim.page }, msg.id)
                                                }
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    handleSelectCitation({ file: claim.file, page: claim.page }, msg.id);
                                                  }
                                                }}
                                                aria-label={`Claim: ${claim.value} in ${claim.file} page ${claim.page}`}
                                              >
                                                <div className="conflict-card-badges">
                                                  {isCurrent && (
                                                    <span className="conflict-badge conflict-badge-current" data-testid="badge-current">
                                                      <span className="badge-dot" aria-hidden="true" />
                                                      Current
                                                    </span>
                                                  )}
                                                  {isSuperseded && (
                                                    <span className="conflict-badge conflict-badge-superseded" data-testid="badge-superseded">
                                                      Superseded
                                                    </span>
                                                  )}
                                                </div>
                                                <div className="source-value">&ldquo;{claim.value}&rdquo;</div>
                                                {isCurrent && conf.resolution?.evidence && (
                                                  <div className="conflict-evidence" data-testid="conflict-evidence">
                                                    <span className="evidence-label">Evidence:</span> {conf.resolution.evidence}
                                                  </div>
                                                )}
                                                <div className="source-meta">
                                                  <div>{formatSourceTitle(claim.file, sources)} &middot; p. {claim.page}</div>
                                                  {claim.upload_date && <div><strong>Uploaded:</strong> {claim.upload_date}</div>}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                        {!conf.resolution && (
                                          <div className="conflict-unresolved-note" data-testid="conflict-unresolved-note">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                              <circle cx="12" cy="12" r="10" />
                                              <line x1="12" y1="16" x2="12" y2="12" />
                                              <line x1="12" y1="8" x2="12.01" y2="8" />
                                            </svg>
                                            <span>The sources don&rsquo;t say which is newer. Check with your instructor.</span>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Convention Mismatch State */}
                                {!msg.abstained && msg.convention_mismatches && msg.convention_mismatches.length > 0 && (
                                  <div className="convention-mismatch-container" data-testid="convention-mismatch-view">
                                    <div className="convention-mismatch-header">
                                      <svg
                                        className="convention-icon-svg"
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden="true"
                                      >
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="16" x2="12" y2="12" />
                                        <line x1="12" y1="8" x2="12.01" y2="8" />
                                      </svg>
                                      <h3 className="convention-mismatch-heading">Convention Mismatch Noted</h3>
                                    </div>
                                    {msg.convention_mismatches.map((mismatch, mIdx) => {
                                      const summaryParts = mismatch.conventions.map(
                                        (c) => `${formatSourceTitle(c.file, sources)} uses ${c.value}`
                                      );
                                      const summaryText =
                                        summaryParts.join('; ') +
                                        (mismatch.adopted_file
                                          ? `. This answer follows ${formatSourceTitle(mismatch.adopted_file, sources)}.`
                                          : '.');

                                      return (
                                        <div key={mIdx} className="convention-mismatch-group">
                                          <div className="convention-mismatch-topic">
                                            Topic: {formatConventionTopic(mismatch.topic)}
                                          </div>
                                          <p className="convention-mismatch-summary" data-testid="convention-mismatch-summary">
                                            {summaryText}
                                          </p>
                                          <div className="convention-cards-row">
                                            {mismatch.conventions.map((conv, cIdx) => {
                                              const isConvActive =
                                                selectedCitation?.messageId === msg.id &&
                                                normalizeFileName(selectedCitation?.file) === normalizeFileName(conv.file) &&
                                                selectedCitation?.page === conv.page;

                                              return (
                                                <div
                                                  key={cIdx}
                                                  className={`convention-card ${conv.adopted ? 'adopted' : ''} ${isConvActive ? 'active' : ''}`}
                                                  onClick={() => handleSelectCitation({ file: conv.file, page: conv.page }, msg.id)}
                                                  role="button"
                                                  tabIndex={0}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                      e.preventDefault();
                                                      handleSelectCitation({ file: conv.file, page: conv.page }, msg.id);
                                                    }
                                                  }}
                                                  aria-label={`Convention: ${conv.value} in ${formatSourceTitle(conv.file, sources)} page ${conv.page}`}
                                                >
                                                  <div className="convention-badge-row">
                                                    {conv.adopted ? (
                                                      <span className="badge-adopted" data-testid="badge-adopted">
                                                        ✓ Followed in answer
                                                      </span>
                                                    ) : (
                                                      <span className="badge-alternative">Alternative</span>
                                                    )}
                                                  </div>
                                                  <div className="convention-value">&ldquo;{conv.value}&rdquo;</div>
                                                  <div className="convention-meta">
                                                    {formatSourceTitle(conv.file, sources)} &middot; p. {conv.page}
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Source strip: the sources this answer used, numbered like its footnotes */}
                                {msg.citations && msg.citations.length > 0 && (
                                  <div className="source-strip" role="group" aria-label="Sources used in this answer">
                                    {msg.citations.map((cit, cIdx) => {
                                      const isActive =
                                        selectedCitation?.messageId === msg.id &&
                                        normalizeFileName(selectedCitation.file) ===
                                          normalizeFileName(cit.file) &&
                                        selectedCitation.page === cit.page;
                                      const key = normalizeFileName(cit.file);
                                      const status = supersededSourcesMap[key]
                                        ? 'superseded'
                                        : currentSourceNames.has(key)
                                        ? 'current'
                                        : null;

                                      return (
                                        <button
                                          key={cIdx}
                                          type="button"
                                          className={`source-strip-card ${isActive ? 'active' : ''}`}
                                          onClick={() => handleSelectCitation(cit, msg.id)}
                                          data-testid={`citation-chip-${cIdx}`}
                                          aria-label={`${formatSourceTitle(cit.file, sources)} p.${cit.page}${status ? `, ${status}` : ''}`}
                                        >
                                          <span className="source-strip-num" aria-hidden="true">{cIdx + 1}</span>
                                          <span className="source-strip-text">
                                            <span className="source-strip-title">{formatSourceTitle(cit.file, sources)}</span>
                                            <span className="source-strip-meta">
                                              p. {cit.page}
                                              {status && <span className={`source-strip-status is-${status}`}> · {status}</span>}
                                            </span>
                                          </span>
                                        </button>
                                      );
                                    })}
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
        </main>

        {/* --------------------------------------------------------------------
            3. RIGHT CONTEXTUAL PANEL: Supporting Passage OR Saved Notes
            -------------------------------------------------------------------- */}
        <aside
          className={`workspace-right-panel ${isRightCollapsed ? 'panel-collapsed' : ''} ${
            isRightOpenMobile ? 'right-open' : ''
          }`}
          data-testid="passage-pane"
          aria-label="Inspector and Notes Panel"
        >
          {/* Right Panel Header: "Tools" home, or a back arrow into a tool */}
          <div className="right-panel-header">
            {rightPanelTab === 'tools' ? (
              <h2 className="right-panel-title">Tools</h2>
            ) : (
              <div className="right-panel-title-row">
                <button
                  type="button"
                  className="panel-back-btn"
                  onClick={() => setRightPanelTab('tools')}
                  aria-label="Back to tools"
                  title="Back to tools"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                  </svg>
                </button>
                <h2 className="right-panel-title">
                  {rightPanelTab === 'passage' ? 'Passage' : `Notes (${notes.length})`}
                </h2>
              </div>
            )}

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
                onClick={() => {
                  setIsRightCollapsed(true);
                  setIsRightOpenMobile(false);
                }}
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

          {/* RIGHT PANEL CONTENT: TOOLS HOME */}
          {rightPanelTab === 'tools' && (
            <div className="right-panel-body tools-home">
              <div className="tools-grid" role="list">
                <button type="button" role="listitem" className="tool-tile tool-passage" onClick={() => setRightPanelTab('passage')}>
                  <svg className="tool-tile-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <span className="tool-tile-label">Passage</span>
                </button>
                <button type="button" role="listitem" className="tool-tile tool-notes" onClick={() => setRightPanelTab('notes')}>
                  <svg className="tool-tile-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  <span className="tool-tile-label">Notes</span>
                  {notes.length > 0 && <span className="tool-tile-count">{notes.length}</span>}
                </button>
                <button
                  type="button"
                  role="listitem"
                  className="tool-tile tool-conflict"
                  onClick={() => scrollToFirst('[data-testid="conflict-view"]')}
                  disabled={conflictMessageCount === 0}
                  title={conflictMessageCount === 0 ? 'No conflicting sources in this chat yet' : 'Jump to the first conflict'}
                >
                  <svg className="tool-tile-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span className="tool-tile-label">Conflicts</span>
                  {conflictMessageCount > 0 && <span className="tool-tile-count">{conflictMessageCount}</span>}
                </button>
                <button
                  type="button"
                  role="listitem"
                  className="tool-tile tool-convention"
                  onClick={() => scrollToFirst('[data-testid="convention-mismatch-view"]')}
                  disabled={conventionMessageCount === 0}
                  title={conventionMessageCount === 0 ? 'No notation differences in this chat yet' : 'Jump to the first notation difference'}
                >
                  <svg className="tool-tile-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                    <polyline points="16 3 21 3 21 8" />
                    <line x1="4" y1="20" x2="21" y2="3" />
                    <polyline points="21 16 21 21 16 21" />
                    <line x1="15" y1="15" x2="21" y2="21" />
                    <line x1="4" y1="4" x2="9" y2="9" />
                  </svg>
                  <span className="tool-tile-label">Conventions</span>
                  {conventionMessageCount > 0 && <span className="tool-tile-count">{conventionMessageCount}</span>}
                </button>
                <button type="button" role="listitem" className="tool-tile tool-proof" disabled title="Coming soon">
                  <svg className="tool-tile-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                    <polyline points="9 11 12 14 22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                  <span className="tool-tile-label">Proof check</span>
                  <span className="tool-tile-soon">Soon</span>
                </button>
                <button type="button" role="listitem" className="tool-tile tool-trace" disabled title="Coming soon">
                  <svg className="tool-tile-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                    <rect x="2" y="7" width="5" height="10" rx="1" />
                    <rect x="9.5" y="7" width="5" height="10" rx="1" />
                    <rect x="17" y="7" width="5" height="10" rx="1" />
                  </svg>
                  <span className="tool-tile-label">Trace</span>
                  <span className="tool-tile-soon">Soon</span>
                </button>
              </div>

              {notes.length > 0 ? (
                <div className="tools-recent">
                  <h3 className="tools-recent-heading">Saved notes</h3>
                  <ul className="tools-recent-list">
                    {notes.slice(0, 5).map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          className="tools-recent-item"
                          onClick={() => {
                            setEditingNote(n);
                            setNoteFormTitle(n.title);
                            setNoteFormContent(n.content);
                            setIsCreateNoteOpen(true);
                          }}
                        >
                          <span className="tools-recent-title">{n.title}</span>
                          <span className="tools-recent-meta">
                            {n.is_saved_answer ? 'Saved answer' : 'Note'} · {new Date(n.updated_at).toLocaleDateString()}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="tools-empty">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                    <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
                  </svg>
                  <p>Saved notes and tool results appear here.</p>
                </div>
              )}
            </div>
          )}

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
        </aside>
      </div>

      {/* ======================================================================
          MODALS: Add Source, View Source, Rename Source, Note, Settings
          ====================================================================== */}
      {(isAddSourceOpen || hasOpenedAddSource.current) && (
        <SourceModal
          isOpen={isAddSourceOpen}
          onClose={() => setIsAddSourceOpen(false)}
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
              <button type="button" className="modal-close-btn" onClick={() => setRenamingSource(null)}>
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
                <button type="button" className="btn btn-secondary" onClick={() => setRenamingSource(null)}>
                  Cancel
                </button>
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
          <div className="modal-content modal-content-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingNote ? 'Edit Note' : 'Create Note'}</h2>
              <button type="button" className="modal-close-btn" onClick={() => setIsCreateNoteOpen(false)}>
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
                  placeholder="Write your study notes, formulas, or reminders here..."
                  value={noteFormContent}
                  onChange={(e) => setNoteFormContent(e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setIsCreateNoteOpen(false)}>
                  Cancel
                </button>
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
          <div className="modal-content modal-content-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Notebook Settings</h2>
              <button type="button" className="modal-close-btn" onClick={() => setIsSettingsOpen(false)}>
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
