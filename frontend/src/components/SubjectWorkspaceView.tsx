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
} from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { SourceModal } from './SourceModal';
import { SourceViewerModal } from './SourceViewerModal';
import { SourcePanel } from './SourcePanel';
import { Composer } from './Composer';
import { BrandMark } from './BrandMark';
import { ModalShell } from './ModalShell';
import { useDialog, useMediaQuery } from '../hooks';

interface SubjectWorkspaceViewProps {
  subject: Subject;
  sources: Source[];
  conversations: Conversation[];
  notes: Note[];
  activeConversationId: string | null;
  selectedSourceIds: string[];
  starterQuestions: string[];
  isDemoMode: boolean;
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
  onSendMessage: (question: string) => Promise<void>;
  onUpdateSettings: (settings: SubjectSettings) => Promise<void>;
  onCreateNote: (title: string, content: string) => Promise<void>;
  onSaveAnswerAsNote: (msg: MessageItem) => Promise<void>;
  onUpdateNote: (noteId: string, title: string, content: string) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  messages: MessageItem[];
  chatLoading: boolean;
  onStopGeneration?: () => void;
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
}) => {
  // Left sidebar tab: 'sources' | 'conversations' | 'notes' | 'settings'
  const [sidebarTab, setSidebarTab] = useState<'sources' | 'conversations' | 'notes' | 'settings'>('sources');
  const [sourceSearch, setSourceSearch] = useState('');
  const [noteSearch, setNoteSearch] = useState('');

  // Mobile drawer
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);

  const isMobileViewport = useMediaQuery('(max-width: 768px)');
  const drawerActive = isMobileViewport && isSidebarOpenMobile;
  const sidebarRef = useDialog<HTMLElement>(drawerActive, () => setIsSidebarOpenMobile(false));

  // Desktop: supporting panels can be collapsed. On narrower desktops the sources
  // sidebar starts collapsed so the conversation keeps a comfortable reading width.
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(min-width: 769px) and (max-width: 1180px)').matches
  );

  // Modals
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [viewingSource, setViewingSource] = useState<Source | null>(null);
  const [renamingSource, setRenamingSource] = useState<Source | null>(null);
  const [newSourceTitle, setNewSourceTitle] = useState('');

  // Notes Modal
  const [isCreateNoteOpen, setIsCreateNoteOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteFormTitle, setNoteFormTitle] = useState('');
  const [noteFormContent, setNoteFormContent] = useState('');

  // Citation Panel state
  const [selectedCitation, setSelectedCitation] = useState<ActiveCitation | null>(null);
  const [isSourcePanelOpen, setIsSourcePanelOpen] = useState(false);
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [passageLoading, setPassageLoading] = useState(false);

  // Composer
  const [question, setQuestion] = useState('');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [savedNoteMsgId, setSavedNoteMsgId] = useState<string | null>(null);

  // Replace file input
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const [replacingSourceId, setReplacingSourceId] = useState<string | null>(null);

  const threadBottomRef = useRef<HTMLDivElement>(null);
  const passageRequestRef = useRef(0);
  const [evidenceFocusTick, setEvidenceFocusTick] = useState(0);
  const citationTriggerRef = useRef<HTMLElement | null>(null);

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

  // Scroll to bottom when messages update
  useEffect(() => {
    if (threadBottomRef.current && typeof threadBottomRef.current.scrollIntoView === 'function') {
      threadBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, chatLoading]);

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

  // Replace source handler
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

  // Citation click handler
  const handleSelectCitation = (cit: Citation, messageId: string) => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('.thread-scroll-container')) {
      citationTriggerRef.current = active;
      try {
        // :focus-visible matches only when the citation was activated from the keyboard.
        if (active.matches(':focus-visible')) setEvidenceFocusTick((t) => t + 1);
      } catch {
        /* selector unsupported: skip */
      }
    }
    setSelectedCitation({ ...cit, messageId });
    setIsSourcePanelOpen(true);
    // Find passages for citation
    loadPassages(cit);
  };

  const closeEvidence = () => {
    setIsSourcePanelOpen(false);
    setSelectedCitation(null);
    const trigger = citationTriggerRef.current;
    citationTriggerRef.current = null;
    if (trigger && trigger.isConnected) {
      window.setTimeout(() => trigger.focus(), 0);
    }
  };

  const loadPassages = async (cit: Citation) => {
    const requestId = ++passageRequestRef.current;
    // Check if source was deleted or replaced
    const matchingSource = sources.find((s) => s.id === cit.source_id);
    const isHistoricalOnly =
      Boolean(cit.source_id && !matchingSource) ||
      Boolean(cit.source_id && matchingSource && typeof cit.source_version === 'number' && matchingSource.version !== cit.source_version);

    if (isHistoricalOnly) {
      // Historical citation: do not query current source passages to prevent silent substitution
      setPassages([]);
      setPassageLoading(false);
      return;
    }

    setPassageLoading(true);
    try {
      const data = await api.getPassages(cit.file, cit.page);
      if (requestId === passageRequestRef.current) setPassages(data);
    } catch {
      if (requestId === passageRequestRef.current) setPassages([]);
    } finally {
      if (requestId === passageRequestRef.current) setPassageLoading(false);
    }
  };

  // Copy Answer
  const handleCopyAnswer = (text: string, msgId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2500);
  };

  // Save Answer to Note
  const handleSaveToNote = async (msg: MessageItem) => {
    await onSaveAnswerAsNote(msg);
    setSavedNoteMsgId(msg.id);
    setTimeout(() => setSavedNoteMsgId(null), 2500);
  };

  // Active message & citations for SourcePanel
  const activeMessage = selectedCitation
    ? messages.find((m) => m.id === selectedCitation.messageId)
    : [...messages].reverse().find((m) => m.role === 'assistant' && m.citations && m.citations.length > 0);

  const activeCitations = activeMessage?.citations || [];
  const activeRetrieved = activeMessage?.retrieved || [];

  // Filter sources & notes
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
      {isSidebarOpenMobile && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpenMobile(false)}
          aria-hidden="true"
        />
      )}

      {/* 1. LEFT WORKSPACE SIDEBAR */}
      <aside
        ref={sidebarRef}
        id="workspace-sidebar"
        {...(drawerActive ? { role: 'dialog', 'aria-modal': true, tabIndex: -1 } : {})}
        className={`workspace-sidebar ${isSidebarOpenMobile ? 'sidebar-open' : ''} ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}
        aria-label="Notebook sources, chats and notes"
      >
        {/* Subject Navigation Header */}
        <div className="workspace-sidebar-header">
          <button
            type="button"
            className="back-btn"
            onClick={onBackToDashboard}
            title="Back to notebooks dashboard"
            aria-label="Back to notebooks dashboard"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Notebooks</span>
          </button>
          <button
            type="button"
            className="mobile-close-btn"
            onClick={() => setIsSidebarOpenMobile(false)}
            aria-label="Close menu"
          >
            &times;
          </button>
        </div>

        <div className="workspace-subject-banner">
          <h2 className="workspace-subject-name">{subject.name}</h2>
          {subject.course_code && (
            <span className="workspace-subject-code">{subject.course_code}</span>
          )}
        </div>

        {/* Sidebar Nav Tabs */}
        <div className="workspace-nav-tabs">
          <button
            type="button"
            className={`nav-tab-btn ${sidebarTab === 'sources' ? 'active' : ''}`}
            onClick={() => setSidebarTab('sources')}
          >
            Sources ({sources.length})
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${sidebarTab === 'conversations' ? 'active' : ''}`}
            onClick={() => setSidebarTab('conversations')}
          >
            Chats ({conversations.length})
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${sidebarTab === 'notes' ? 'active' : ''}`}
            onClick={() => setSidebarTab('notes')}
          >
            Notes ({notes.length})
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${sidebarTab === 'settings' ? 'active' : ''}`}
            onClick={() => setSidebarTab('settings')}
            title="Settings"
            aria-label="Settings"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>

        {/* TAB 1: SOURCES */}
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

            {sources.length > 3 && (
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
                        <label className="source-checkbox-col">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!isReady}
                            onChange={() => handleToggleSource(s.id)}
                            aria-label={`Select ${s.title}`}
                            data-testid={`source-checkbox-${s.id}`}
                          />
                        </label>

                        <div
                          className="source-info-col"
                          onClick={() => isReady && handleToggleSource(s.id)}
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
                          </div>
                        </div>

                        <div className="source-actions-col">
                          <button
                            type="button"
                            className="source-item-btn"
                            title="View content"
                            onClick={() => handleOpenSourceViewer(s)}
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
                            onClick={() => {
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
                              onClick={() => onRetrySource(s.id)}
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
                              onClick={() => handleTriggerReplace(s.id)}
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
                            onClick={() => {
                              if (window.confirm(`Remove source "${s.title}" from this subject?`)) {
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
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: CONVERSATIONS */}
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
                  >
                    <button
                      type="button"
                      className="conv-title-col conv-open-btn"
                      title={c.title}
                      aria-current={isActive ? 'true' : undefined}
                      onClick={() => onSelectConversation(c.id)}
                    >
                      <span className="conv-title-text">{c.title}</span>
                      <span className="conv-meta-text">
                        {c.message_count ? `${c.message_count} messages` : 'Empty chat'}
                      </span>
                    </button>
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

        {/* TAB 3: NOTES */}
        {sidebarTab === 'notes' && (
          <div className="sidebar-tab-content">
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
              <span>Create personal note</span>
            </button>

            {notes.length > 0 && (
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
                    Create personal notes or click &quot;Save to Note&quot; on helpful answers.
                  </p>
                </div>
              ) : filteredNotes.length === 0 ? (
                <p className="sidebar-empty-box">No notes matching search.</p>
              ) : (
                <ul className="workspace-notes-ul">
                  {filteredNotes.map((n) => (
                    <li key={n.id} className="workspace-note-item">
                      <button
                        type="button"
                        className="note-open-btn"
                        onClick={() => {
                          setEditingNote(n);
                          setNoteFormTitle(n.title);
                          setNoteFormContent(n.content);
                          setIsCreateNoteOpen(true);
                        }}
                      >
                        <span className="note-card-top">
                          <span className="note-title-text">{n.title}</span>
                          {n.is_saved_answer ? (
                            <span className="saved-answer-tag">Saved Answer</span>
                          ) : (
                            <span className="personal-note-tag">Note</span>
                          )}
                        </span>
                        <span className="note-snippet-text">{n.content}</span>
                      </button>
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

        {/* TAB 4: SUBJECT SETTINGS */}
        {sidebarTab === 'settings' && (
          <div className="sidebar-tab-content settings-tab-content">
            <h3 className="settings-section-title">Notebook Settings</h3>

            <div className="form-group">
              <label htmlFor="settings-resp-length">Response Length</label>
              <select
                id="settings-resp-length"
                className="sort-select"
                value={subject.settings?.response_length || 'default'}
                onChange={(e) =>
                  onUpdateSettings({
                    ...subject.settings,
                    response_length: e.target.value as any,
                  })
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
                className="sort-select"
                value={subject.settings?.response_style || 'general'}
                onChange={(e) =>
                  onUpdateSettings({
                    ...subject.settings,
                    response_style: e.target.value as any,
                  })
                }
              >
                <option value="general">General (objective academic assistant)</option>
                <option value="learning-guide">Learning Guide (interactive tutor, step-by-step)</option>
              </select>
            </div>

            <div className="settings-note">
              Settings are persisted per subject notebook.
            </div>
          </div>
        )}
      </aside>

      {/* 2. MAIN CONVERSATION AREA */}
      <div className="workspace-main-area" tabIndex={-1} data-focus-fallback>
        {/* Workspace Top Header */}
        <header className="workspace-header">
          <div className="workspace-header-left">
            <button
              type="button"
              className="btn-icon panel-toggle-btn"
              onClick={() => setIsSidebarCollapsed((v) => !v)}
              aria-expanded={!isSidebarCollapsed}
              aria-controls="workspace-sidebar"
              aria-label={isSidebarCollapsed ? 'Show sources panel' : 'Hide sources panel'}
              title={isSidebarCollapsed ? 'Show sources panel' : 'Hide sources panel'}
              data-testid="sidebar-collapse-btn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="3" />
                <line x1="9" y1="4" x2="9" y2="20" />
              </svg>
            </button>
            <button
              type="button"
              className="btn-icon mobile-menu-btn"
              onClick={() => setIsSidebarOpenMobile(true)}
              aria-label="Open sidebar menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span className="workspace-conv-title">
              {activeConversation ? activeConversation.title : 'Chat'}
            </span>
            <span className="selected-sources-pill" data-testid="selected-sources-pill">
              {selectedSourceIds.length} {selectedSourceIds.length === 1 ? 'source' : 'sources'} selected
            </span>
          </div>

          <div className="workspace-header-right">
            {isDemoMode && <span className="demo-pill">Public demo</span>}
            <button
              type="button"
              className={`btn-icon panel-toggle-btn evidence-toggle-btn ${isSourcePanelOpen ? 'is-on' : ''}`}
              onClick={() => {
                if (isSourcePanelOpen) {
                  closeEvidence();
                } else {
                  setIsSourcePanelOpen(true);
                }
              }}
              aria-expanded={isSourcePanelOpen}
              aria-controls="evidence-panel"
              aria-label={isSourcePanelOpen ? 'Hide evidence panel' : 'Show evidence panel'}
              title={isSourcePanelOpen ? 'Hide evidence panel' : 'Show evidence panel'}
              data-testid="evidence-toggle-btn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="3" />
                <line x1="15" y1="4" x2="15" y2="20" />
              </svg>
            </button>
            <button
              type="button"
              className="btn-icon"
              title="New Conversation"
              onClick={onCreateConversation}
              aria-label="New conversation"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </header>

        {/* Conversation Thread */}
        {messages.length === 0 ? (
          <main className="empty-state-scroll-container">
            <div className="empty-state-centered-box">
              <div className="empty-state-brand-mark" aria-hidden="true">
                <BrandMark size={44} />
              </div>
              <h1 className="empty-state-heading">What would you like to understand?</h1>
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

              {/* Composer */}
              <Composer
                question={question}
                setQuestion={setQuestion}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (question.trim()) {
                    const q = question.trim();
                    setQuestion('');
                    onSendMessage(q);
                  }
                }}
                loading={chatLoading}
                onStop={onStopGeneration}
              />
            </div>
          </main>
        ) : (
          <>
            <main className="thread-scroll-container">
              <div className="thread-content-max">
                <div className="thread-messages-list" role="log" aria-label="Conversation">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`thread-turn turn-${msg.role}`}>
                      {msg.role === 'user' ? (
                        <div className="user-message-bubble">{msg.content}</div>
                      ) : (
                        <div className="assistant-message">
                          {/* 1. Abstention / Not Found view */}
                          {msg.abstained ? (
                            <div className="card-not-found" data-testid="abstained-view">
                              <div className="not-found-badge">NOT FOUND IN YOUR DOCUMENTS</div>
                              <div className="abstain-reason">{msg.content}</div>
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
                              {/* 2. Conflicts view */}
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
                                            role="button"
                                            tabIndex={0}
                                            aria-label={`Claim: ${claim.value} in ${claim.file} page ${claim.page}`}
                                            onClick={() => handleSelectCitation({ file: claim.file, page: claim.page }, msg.id)}
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

                              {/* 3. Grounded Answer Body */}
                              <div className="answer-text">
                                <MarkdownRenderer
                                  content={msg.content}
                                  citations={msg.citations || []}
                                  isThisMessageSelected={selectedCitation?.messageId === msg.id}
                                  selectedCitation={selectedCitation}
                                  onSelectCitation={(cit) => handleSelectCitation(cit, msg.id)}
                                />
                              </div>

                              {/* 4. Citation Chips */}
                              {msg.citations && msg.citations.length > 0 && (
                                <div className="citations-section">
                                  <div className="chips-row" role="group" aria-label="Sources cited in this answer">
                                    {msg.citations.map((cit, cIdx) => {
                                      const isActive =
                                        selectedCitation?.messageId === msg.id &&
                                        selectedCitation.file.toLowerCase() === cit.file.toLowerCase() &&
                                        selectedCitation.page === cit.page;

                                      return (
                                        <button
                                          key={cIdx}
                                          type="button"
                                          className={`chip ${isActive ? 'active' : ''}`}
                                          onClick={() => handleSelectCitation(cit, msg.id)}
                                          aria-pressed={isActive}
                                          aria-controls="evidence-panel"
                                          data-testid={`citation-chip-${cIdx}`}
                                        >
                                          <span className="chip-badge">[{cIdx + 1}]</span>
                                          <span>{cit.file} p.{cit.page}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* 5. Answer Actions Bar (Copy & Save to Note) */}
                              <div className="answer-action-toolbar" role="group" aria-label="Answer actions">
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
                                    const prevUser = [...messages.slice(0, msgIdx)].reverse().find((m) => m.role === 'user');
                                    if (prevUser) {
                                      onSendMessage(prevUser.content);
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

                          {/* 6. Status Strip */}
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
            </main>

            {/* Pinned Composer */}
            <Composer
              question={question}
              setQuestion={setQuestion}
              onSubmit={(e) => {
                e.preventDefault();
                if (question.trim() && !chatLoading) {
                  const q = question.trim();
                  setQuestion('');
                  onSendMessage(q);
                }
              }}
              loading={chatLoading}
              onStop={onStopGeneration}
            />
          </>
        )}
      </div>

      {/* 3. RIGHT CITATION / SOURCE PANEL */}
      <SourcePanel
        selectedCitation={selectedCitation}
        citations={activeCitations}
        passages={passages}
        passageLoading={passageLoading}
        retrieved={activeRetrieved as any}
        sources={sources}
        onSelectCitation={(cit) => {
          if (selectedCitation?.messageId) {
            handleSelectCitation(cit, selectedCitation.messageId);
          }
        }}
        onClose={closeEvidence}
        isOpen={isSourcePanelOpen}
        focusRequest={evidenceFocusTick}
      />

      {/* Modals */}
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
        <ModalShell onClose={() => setRenamingSource(null)} size="modal-content-sm" label="Rename source">
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
        </ModalShell>
      )}

      {/* Create / Edit Note Modal */}
      {isCreateNoteOpen && (
        <ModalShell onClose={() => setIsCreateNoteOpen(false)} size="modal-content-md" label={editingNote ? 'Edit note' : 'Create personal note'}>
            <div className="modal-header">
              <h2>{editingNote ? 'Edit Note' : 'Create Personal Note'}</h2>
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
        </ModalShell>
      )}
    </div>
  );
};
