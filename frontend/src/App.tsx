import React, { useState, useEffect, useRef } from 'react';
import { AskResponse, Citation, ActiveCitation, DocumentItem, PassageItem, normalizeFileName } from './types';
import { Sidebar } from './components/Sidebar';
import { Composer } from './components/Composer';
import { AssistantMessage } from './components/AssistantMessage';
import { SourcePanel } from './components/SourcePanel';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content?: string;
  result?: AskResponse | null;
  loading?: boolean;
  error?: string | null;
  questionText?: string;
}

interface AppProps {
  isDemoMode?: boolean;
}

const isDemoFromQuery =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('demo') === 'true';

export function App({
  isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true' || isDemoFromQuery,
}: AppProps = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);

  // Cited page / Source panel state: tracked by owning assistant message ID plus file/page
  const [selectedCitation, setSelectedCitation] = useState<ActiveCitation | null>(null);
  const [passageLoading, setPassageLoading] = useState(false);
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [isSourceOpen, setIsSourceOpen] = useState(false);

  // Documents and upload state
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  // Responsive mobile drawer state
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);

  const passageRequestId = useRef(0);
  const threadBottomRef = useRef<HTMLDivElement>(null);

  // Fetch documents list on mount
  useEffect(() => {
    fetchDocuments();
  }, []);

  const latestTurnRef = useRef<HTMLDivElement>(null);

  // Scroll to latest message turn on message update
  useEffect(() => {
    if (latestTurnRef.current && typeof latestTurnRef.current.scrollIntoView === 'function') {
      latestTurnRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [messages, loading]);

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch {
      // Ignore initial doc fetch failure
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setQuestion('');
    setSelectedCitation(null);
    setPassages([]);
    setIsSourceOpen(false);
    setIsSidebarOpenMobile(false);
  };

  const handleSelectCitation = (citation: Citation, messageId?: string) => {
    const targetMsgId = messageId || selectedCitation?.messageId || activeMessage?.id || '';
    setIsSourceOpen(true);
    loadPassage(targetMsgId, citation);
  };

  const loadPassage = async (messageId: string, citation: Citation) => {
    const requestId = ++passageRequestId.current;
    setSelectedCitation({ messageId, file: citation.file, page: citation.page });
    setPassageLoading(true);
    try {
      const url = `${API_BASE_URL}/passages?file=${encodeURIComponent(citation.file)}&page=${citation.page}`;
      const res = await fetch(url);
      const data = res.ok ? await res.json() : [];
      if (requestId !== passageRequestId.current) return;
      setPassages(data);
    } catch {
      if (requestId !== passageRequestId.current) return;
      setPassages([]);
    } finally {
      if (requestId === passageRequestId.current) setPassageLoading(false);
    }
  };

  const executeAsk = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed || loading) return;

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `asst-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: 'user', content: trimmed },
      { id: assistantMessageId, role: 'assistant', loading: true, questionText: trimmed },
    ]);
    setQuestion('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, k: 5 }),
      });

      if (!res.ok) {
        const errData = typeof res.json === 'function' ? await res.json().catch(() => ({})) : {};
        throw new Error(errData?.detail || `Server returned status ${res.status}`);
      }

      const data: AskResponse = await res.json();

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                loading: false,
                result: data,
                error: null,
              }
            : msg
        )
      );

      if (data.citations && data.citations.length > 0 && !data.abstained) {
        if (typeof window !== 'undefined' && window.innerWidth > 768) {
          setIsSourceOpen(true);
        }
        loadPassage(assistantMessageId, data.citations[0]);
      } else if (!data.abstained && data.conflict_detected && data.conflicts && data.conflicts.length > 0) {
        const firstClaim = data.conflicts[0]?.claims?.[0];
        if (firstClaim) {
          if (typeof window !== 'undefined' && window.innerWidth > 768) {
            setIsSourceOpen(true);
          }
          loadPassage(assistantMessageId, { file: firstClaim.file, page: firstClaim.page });
        }
      }
    } catch (err: any) {
      const errMsg = err.message || 'An error occurred while answering.';
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                loading: false,
                error: errMsg,
                result: null,
              }
            : msg
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    executeAsk(question);
  };

  const handleStarterSubmit = (starterQuery: string) => {
    setQuestion(starterQuery);
    executeAsk(starterQuery);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoMode) {
      setUploadMsg('Error: Upload is disabled in demo mode.');
      return;
    }
    if (!uploadFile) return;

    setUploading(true);
    setUploadMsg(null);

    const formData = new FormData();
    formData.append('file', uploadFile);

    try {
      const res = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = typeof res.json === 'function' ? await res.json().catch(() => ({})) : {};
        throw new Error(errData?.detail || 'Upload failed');
      }

      const data = await res.json();
      setUploadMsg(`Successfully uploaded ${data.file_name}: stored ${data.chunks_stored} chunk(s).`);
      setUploadFile(null);
      fetchDocuments();
    } catch (err: any) {
      setUploadMsg(`Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Find owning assistant message directly by messageId; fallback only when no citation is selected
  const activeMessage = selectedCitation
    ? messages.find((m) => m.id === selectedCitation.messageId)
    : [...messages]
        .reverse()
        .find(
          (m) =>
            m.result &&
            ((m.result.citations && m.result.citations.length > 0) ||
              (m.result.conflicts && m.result.conflicts.length > 0))
        );

  // All citations from the selected message's response, including conflict claims
  const activeCitations = React.useMemo(() => {
    if (!activeMessage?.result) return [];
    const list: Citation[] = [];
    const seen = new Set<string>();

    // 1. Normal citations
    for (const c of activeMessage.result.citations || []) {
      const key = `${normalizeFileName(c.file)}:${c.page}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push({ file: c.file, page: c.page });
      }
    }

    // 2. Conflict claims
    for (const conf of activeMessage.result.conflicts || []) {
      for (const claim of conf.claims || []) {
        const key = `${normalizeFileName(claim.file)}:${claim.page}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({ file: claim.file, page: claim.page });
        }
      }
    }

    return list;
  }, [activeMessage]);

  const activeRetrieved = activeMessage?.result?.retrieved || [];

  return (
    <div className="chat-app-root">
      {/* Mobile Drawer Overlay */}
      {isSidebarOpenMobile && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpenMobile(false)}
          aria-hidden="true"
        />
      )}

      {/* 1. Left Sidebar */}
      <Sidebar
        documents={documents}
        isDemoMode={isDemoMode}
        onNewChat={handleNewChat}
        onUpload={handleUpload}
        uploadFile={uploadFile}
        setUploadFile={setUploadFile}
        uploading={uploading}
        uploadMsg={uploadMsg}
        isOpenMobile={isSidebarOpenMobile}
        onCloseMobile={() => setIsSidebarOpenMobile(false)}
      />

      {/* Main Center Area */}
      <div className="chat-main-area">
        {/* Top Header */}
        <header className="chat-header">
          <div className="chat-header-left">
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
            <span className="chat-header-title">Course-Document Assistant</span>
          </div>
          <div className="chat-header-right">
            {isDemoMode && (
              <span className="demo-pill" data-testid="demo-pill">
                Public demo
              </span>
            )}
            <button
              type="button"
              className="btn-icon mobile-new-btn"
              onClick={handleNewChat}
              aria-label="New conversation"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </header>

        {/* 2. Center Thread Area */}
        {messages.length === 0 ? (
          <main className="empty-state-scroll-container">
            <div className="empty-state-centered-box">
              {/* Brand mark */}
              <div className="empty-state-brand-mark" aria-hidden="true">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  <line x1="9" y1="7" x2="15" y2="7" />
                  <line x1="9" y1="11" x2="13" y2="11" />
                </svg>
              </div>

              {/* Heading */}
              <h1 className="empty-state-heading">What would you like to understand?</h1>

              {/* One line of subtext */}
              <p className="empty-state-subtext">
                Ask about your course. Every answer starts with your sources.
              </p>

              {/* Three starter chips */}
              <div className="starter-chips-container" role="group" aria-label="Starter questions">
                <button
                  type="button"
                  className="starter-chip-btn"
                  onClick={() => handleStarterSubmit('What is the grade breakdown for this course?')}
                >
                  Grade breakdown
                </button>
                <button
                  type="button"
                  className="starter-chip-btn"
                  onClick={() => handleStarterSubmit('Where is the lecture room and when does class meet?')}
                >
                  Lecture room
                </button>
                <button
                  type="button"
                  className="starter-chip-btn"
                  onClick={() => handleStarterSubmit('Do the syllabi disagree on any policies or dates?')}
                >
                  Do the syllabi disagree?
                </button>
              </div>

              {/* Composer */}
              <Composer
                question={question}
                setQuestion={setQuestion}
                onSubmit={handleAsk}
                loading={loading}
              />
            </div>
          </main>
        ) : (
          <>
            <main className="thread-scroll-container">
              <div className="thread-content-max">
                <div className="thread-messages-list">
                  {messages.map((msg, idx) => (
                    <div
                      key={msg.id}
                      ref={idx === messages.length - 1 ? latestTurnRef : undefined}
                      className={`thread-turn turn-${msg.role}`}
                    >
                      {msg.role === 'user' ? (
                        <div className="user-message-bubble">
                          {msg.content}
                        </div>
                      ) : (
                        <AssistantMessage
                          messageId={msg.id}
                          loading={msg.loading}
                          error={msg.error}
                          result={msg.result}
                          searchedQuery={msg.questionText}
                          selectedCitation={selectedCitation}
                          onSelectCitation={(cit, mId) => handleSelectCitation(cit, mId || msg.id)}
                        />
                      )}
                    </div>
                  ))}
                  <div ref={threadBottomRef} />
                </div>
              </div>
            </main>

            {/* Composer pinned at bottom when thread is active */}
            <Composer
              question={question}
              setQuestion={setQuestion}
              onSubmit={handleAsk}
              loading={loading}
            />
          </>
        )}
      </div>

      {/* 3. Right: Source Panel */}
      <SourcePanel
        selectedCitation={selectedCitation}
        citations={activeCitations}
        passages={passages}
        passageLoading={passageLoading}
        retrieved={activeRetrieved}
        onSelectCitation={(cit) => {
          const targetMsgId = selectedCitation?.messageId || activeMessage?.id;
          if (targetMsgId) {
            handleSelectCitation(cit, targetMsgId);
          }
        }}
        onClose={() => {
          setIsSourceOpen(false);
          setSelectedCitation(null);
        }}
        isOpen={isSourceOpen}
      />
    </div>
  );
}

export default App;
