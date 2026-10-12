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
} from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { SourceModal } from './SourceModal';
import { SourceViewerModal } from './SourceViewerModal';
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
  onResetWorkspace,
  onToggleNotebooksDrawer,
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
  const [rightPanelTab, setRightPanelTab] = useState<'passage' | 'notes'>('passage');

  // Search queries
  const [sourceSearch, setSourceSearch] = useState('');
  const [noteSearch, setNoteSearch] = useState('');

  // Modals
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [viewingSource, setViewingSource] = useState<Source | null>(null);
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

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

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
            className="workspace-back-btn"
            onClick={onToggleNotebooksDrawer || onBackToDashboard}
            title={onToggleNotebooksDrawer ? "Toggle notebooks list" : "Back to notebooks dashboard"}
            aria-label="Notebooks"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            <span>Notebooks</span>
          </button>

          <span className="workspace-header-divider" aria-hidden="true" />

          <button
            type="button"
            className="workspace-brand-link"
            onClick={onBackToDashboard}
            title="NotebookSpace Home"
          >
            <span className="brand-logo-letter-small" aria-hidden="true">N</span>
            <span className="workspace-brand-name">NotebookSpace</span>
          </button>

          <span className="workspace-header-divider" aria-hidden="true" />

          <div className="workspace-subject-pill" title={subject.name}>
            <span className="workspace-subject-pill-name">{subject.name}</span>
            {subject.course_code && (
              <span className="workspace-subject-pill-code">{subject.course_code}</span>
            )}
          </div>
        </div>

        <div className="workspace-top-center">
          <span className="workspace-active-chat-title">
            {activeConversation ? activeConversation.title : 'Chat'}
          </span>
          <span className="selected-sources-pill" data-testid="selected-sources-pill">
            {selectedSourceIds.length} {selectedSourceIds.length === 1 ? 'source' : 'sources'} selected
          </span>
        </div>

        <div className="workspace-top-right">
          {/* Panel Toggle Buttons */}
          <button
            type="button"
            className={`workspace-toggle-btn ${(!isLeftCollapsed && (typeof window === 'undefined' || window.innerWidth > 960)) || isSidebarOpenMobile ? 'active' : ''}`}
            onClick={() => {
              if (typeof window !== 'undefined' && window.innerWidth <= 960) {
                setIsSidebarOpenMobile(!isSidebarOpenMobile);
              } else {
                setIsLeftCollapsed(!isLeftCollapsed);
              }
            }}
            title={isLeftCollapsed ? 'Show sources panel' : 'Hide sources panel'}
            aria-label="Toggle sources panel"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
            <span className="toggle-label">Sources</span>
            <span className="toggle-badge">{sources.length}</span>
          </button>

          <button
            type="button"
            className={`workspace-toggle-btn ${(!isRightCollapsed && (typeof window === 'undefined' || window.innerWidth > 960)) || isRightOpenMobile ? 'active' : ''}`}
            onClick={() => {
              if (typeof window !== 'undefined' && window.innerWidth <= 960) {
                setIsRightOpenMobile(!isRightOpenMobile);
              } else {
                setIsRightCollapsed(!isRightCollapsed);
              }
            }}
            title={isRightCollapsed ? 'Show notes & passage inspector' : 'Hide notes & passage inspector'}
            aria-label="Toggle inspector panel"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
            <span className="toggle-label">
              {rightPanelTab === 'passage' && selectedCitation ? 'Passage' : 'Notes'}
            </span>
            {notes.length > 0 && <span className="toggle-badge">{notes.length}</span>}
          </button>

          {/* New Chat Button */}
          <button
            type="button"
            className="btn-icon workspace-top-icon-btn"
            onClick={onCreateConversation}
            title="New conversation"
            aria-label="New conversation"
            data-testid="top-new-chat-btn"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          {/* Settings Trigger */}
          <button
            type="button"
            className="btn-icon workspace-top-icon-btn"
            onClick={() => setIsSettingsOpen(true)}
            title="Notebook settings"
            aria-label="Notebook settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          {/* Demo Mode Badge */}
          {isDemoMode && (
            <span className="demo-pill" data-testid="demo-pill">
              Public demo
            </span>
          )}

          {/* Guest Workspace Badge */}
          <div
            className="guest-workspace-indicator"
            data-testid="guest-workspace-badge"
            title="Your notebook workspace is private to this browser."
            onClick={() => {
              if (onResetWorkspace) {
                onResetWorkspace();
              }
            }}
          >
            <span className="guest-status-indicator-dot" />
            <span className="guest-status-label">
              {currentUser?.email || 'Guest Workspace'}
            </span>
          </div>
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
          }`}
          aria-label="Course Sources and Chats"
        >
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

              <button
                type="button"
                className="btn btn-primary btn-full btn-add-sources"
                onClick={() => setIsAddSourceOpen(true)}
                data-testid="add-source-btn"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Add sources</span>
              </button>

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
                {sources.length === 0 ? (
                  <div className="sidebar-empty-box">
                    <p>No materials added yet.</p>
                    <p className="subtext">Upload PDFs, notes, or web articles.</p>
                  </div>
                ) : filteredSources.length === 0 ? (
                  <p className="sidebar-empty-box">No sources matching search.</p>
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
                            role="button"
                            tabIndex={0}
                          >
                            <div className="source-title-row">
                              <span className="source-title-text" title={s.title}>
                                {s.title}
                              </span>
                            </div>
                            <div className="source-meta-row">
                              <span className="source-type-tag">{s.source_type}</span>
                              {isReady ? (
                                <span>
                                  {s.page_count} {s.page_count === 1 ? 'page' : 'pages'} &bull; Ready
                                </span>
                              ) : s.status === 'processing' ? (
                                <span className="status-processing">Processing...</span>
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
                                {s.status === 'failed' && s.source_type === 'url' ? (
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
              title="Open notes & passage inspector"
              aria-label="Open notes & passage inspector"
            >
              <span>{rightPanelTab === 'passage' && selectedCitation ? 'Passage' : 'Notes'}</span>
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
                  <span className="brand-logo-letter empty-state-logo-letter">N</span>
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
                                <div className="answer-action-toolbar" style={{ marginTop: '0.75rem' }}>
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
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2.5">
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
                <div className="passage-loading-state">
                  <div className="step-spinner" aria-hidden="true" />
                  <p className="empty-state">Loading passage text...</p>
                </div>
              ) : selectedCitation ? (
                <div className="passage-content" data-testid="passage-content">
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
                  <div className="sidebar-empty-box">
                    <p>No saved notes yet.</p>
                    <p className="subtext">
                      Create personal notes or click &quot;Save to note&quot; on answers.
                    </p>
                  </div>
                ) : filteredNotes.length === 0 ? (
                  <p className="sidebar-empty-box">No notes matching search.</p>
                ) : (
                  <ul className="workspace-notes-ul">
                    {filteredNotes.map((n) => (
                      <li
                        key={n.id}
                        className="workspace-note-item"
                        onClick={() => {
                          setEditingNote(n);
                          setNoteFormTitle(n.title);
                          setNoteFormContent(n.content);
                          setIsCreateNoteOpen(true);
                        }}
                      >
                        <div className="note-card-top">
                          <span className="note-title-text">{n.title}</span>
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
      <SourceModal
        isOpen={isAddSourceOpen}
        onClose={() => setIsAddSourceOpen(false)}
        onUploadFiles={onUploadFiles}
        onPasteText={onPasteText}
        onAddUrl={onAddUrl}
      />

      <SourceViewerModal
        source={viewingSource}
        onClose={() => setViewingSource(null)}
      />

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
                  placeholder="e.g. Dijkstra vs Bellman-Ford Summary"
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
