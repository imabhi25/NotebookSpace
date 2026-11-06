import React, { useState, useEffect, useRef } from 'react';
import { api } from './api';
import {
  Subject,
  Source,
  Conversation,
  MessageItem,
  Note,
  User,
  SubjectSettings,
  Citation,
  ActiveCitation,
  DocumentItem,
  PassageItem,
  AskResponse,
  normalizeFileName,
} from './types';
import { DashboardView } from './components/DashboardView';
import { WorkspaceSkeleton } from './components/WorkspaceSkeleton';
import { lazyView, preloadWhenIdle } from './lazyView';
import { Sidebar } from './components/Sidebar';
import { Composer } from './components/Composer';
import { AssistantMessage } from './components/AssistantMessage';
import { SourcePanel } from './components/SourcePanel';

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
).replace(/\/+$/, '');

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
  defaultView?: 'notebooks' | 'demo';
}

const isDemoFromQuery =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('demo') === 'true';

// The workspace (chat, sources, inspector, math rendering) is the largest view; load it on demand.
const SubjectWorkspaceView = lazyView(
  () => import('./components/SubjectWorkspaceView').then((m) => m.SubjectWorkspaceView),
  <WorkspaceSkeleton />
);

export function App({
  isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true' || isDemoFromQuery,
  defaultView,
}: AppProps = {}) {
  // Fetch the workspace code in the background so opening a notebook does not wait on it.
  useEffect(() => {
    preloadWhenIdle(SubjectWorkspaceView);
  }, []);

  // --------------------------------------------------------------------------
  // NAVIGATION ROUTING STATE
  // --------------------------------------------------------------------------
  const getInitialRoute = (): { view: 'notebooks' | 'workspace' | 'demo'; subjectId?: string } => {
    if (defaultView) return { view: defaultView };
    if (typeof window === 'undefined') return { view: 'notebooks' };

    const path = window.location.pathname;
    const queryDemo = new URLSearchParams(window.location.search).get('demo') === 'true';
    if (queryDemo || path === '/demo') {
      return { view: 'demo' };
    }
    const match = path.match(/^\/subject\/([^\/]+)/);
    if (match) {
      return { view: 'workspace', subjectId: match[1] };
    }
    if (path === '/dashboard') {
      return { view: 'notebooks' };
    }

    return { view: 'notebooks' };
  };

  const [route, setRoute] = useState<{ view: 'notebooks' | 'workspace' | 'demo'; subjectId?: string }>(getInitialRoute);

  // Sync URL changes via browser back / forward
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const queryDemo = new URLSearchParams(window.location.search).get('demo') === 'true';
      if (queryDemo || path === '/demo') {
        setRoute({ view: 'demo' });
        return;
      }
      const match = path.match(/^\/subject\/([^\/]+)/);
      if (match) {
        setRoute({ view: 'workspace', subjectId: match[1] });
      } else {
        setRoute({ view: 'notebooks' });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (newView: 'notebooks' | 'workspace' | 'demo', subjectId?: string) => {
    let url = '/';
    if (newView === 'demo') {
      url = '/demo';
    } else if (newView === 'workspace' && subjectId) {
      url = `/subject/${subjectId}`;
    }
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', url);
    }
    setRoute({ view: newView, subjectId });
  };

  // --------------------------------------------------------------------------
  // USER / AUTH STATE
  // --------------------------------------------------------------------------
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    api.ensureSession()
      .then((user) => {
        if (user) {
          setCurrentUser(user);
        }
      })
      .catch(() => {});
  }, []);

  const ensureAuthenticated = async (): Promise<boolean> => {
    if (currentUser) return true;
    try {
      const user = await api.ensureSession();
      setCurrentUser(user);
      return true;
    } catch {
      return false;
    }
  };

  // --------------------------------------------------------------------------
  // NOTEBOOKS / SUBJECTS STATE
  // --------------------------------------------------------------------------
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  // Active Subject Notebook state
  const [activeSubject, setActiveSubject] = useState<Subject | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [starterQuestions, setStarterQuestions] = useState<string[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isMobileNotebooksOpen, setIsMobileNotebooksOpen] = useState(false);
  const chatAbortRef = useRef<AbortController | null>(null);

  // Fetch subjects whenever not in demo mode
  useEffect(() => {
    if (route.view !== 'demo') {
      fetchSubjects();
    }
  }, [route.view, currentUser]);

  const fetchSubjects = async () => {
    setSubjectsLoading(true);
    try {
      const authed = await ensureAuthenticated();
      if (!authed) return;
      const data = await api.getSubjects(true);
      setSubjects(data);
    } catch {
      // ignore
    } finally {
      setSubjectsLoading(false);
    }
  };

  // Load active subject when route is workspace
  useEffect(() => {
    if (route.view === 'workspace' && route.subjectId) {
      loadSubjectData(route.subjectId);
    }
  }, [route.view, route.subjectId, currentUser]);

  const loadSubjectData = async (subjectId: string) => {
    try {
      const authed = await ensureAuthenticated();
      if (!authed) return;

      const [subj, srcs, convs, nts, sqs] = await Promise.all([
        api.getSubject(subjectId),
        api.getSources(subjectId),
        api.getConversations(subjectId),
        api.getNotes(subjectId),
        api.getStarterQuestions(subjectId),
      ]);

      setActiveSubject(subj);
      setSources(srcs);
      setConversations(convs);
      setNotes(nts);
      setStarterQuestions(sqs);

      // Default: select all ready sources
      const readyIds = srcs.filter((s) => s.status === 'ready').map((s) => s.id);
      setSelectedSourceIds(readyIds);

      // Set active conversation
      if (convs.length > 0) {
        const firstConvId = convs[0].id;
        setActiveConversationId(firstConvId);
        setHistoryLoading(true);
        try {
          const msgs = await api.getMessages(subjectId, firstConvId);
          setMessages(applyStoppedFilter(firstConvId, msgs));
        } finally {
          setHistoryLoading(false);
        }
      } else {
        // Auto-create initial conversation
        const newConv = await api.createConversation(subjectId, 'New Conversation');
        setConversations([newConv]);
        setActiveConversationId(newConv.id);
        setMessages([]);
        setHistoryLoading(false);
      }
    } catch {
      // If subject not found or unauthorized, return to dashboard
      navigateTo('notebooks');
    }
  };

  const applyStoppedFilter = (convId: string, msgs: MessageItem[]): MessageItem[] => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stoppedKey = `notebookspace_stopped_${convId}`;
        const stoppedVal = window.localStorage.getItem(stoppedKey);
        if (stoppedVal && msgs.length > 0) {
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.abstained && lastMsg.abstain_reason !== 'generation_failed') {
            return msgs.map((m, idx) => {
              if (idx === msgs.length - 1) {
                return {
                  ...m,
                  content: 'Generation stopped by user.',
                  abstained: true,
                  abstain_reason: 'stopped',
                };
              }
              return m;
            });
          }
        }
      }
    } catch {}
    return msgs;
  };

  // Switch conversation
  const handleSelectConversation = async (convId: string) => {
    if (!activeSubject) return;
    setActiveConversationId(convId);
    setHistoryLoading(true);
    try {
      const msgs = await api.getMessages(activeSubject.id, convId);
      setMessages(applyStoppedFilter(convId, msgs));
    } catch {
      setMessages([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Create new conversation
  const handleCreateConversation = async () => {
    if (!activeSubject) return;
    try {
      const conv = await api.createConversation(activeSubject.id, 'New Conversation');
      setConversations((prev) => [conv, ...prev]);
      setActiveConversationId(conv.id);
      setMessages([]);
    } catch (err: any) {
      alert(err.message || 'Failed to create conversation');
    }
  };

  // Rename conversation
  const handleRenameConversation = async (convId: string, title: string) => {
    if (!activeSubject) return;
    try {
      const updated = await api.renameConversation(activeSubject.id, convId, title);
      setConversations((prev) => prev.map((c) => (c.id === convId ? updated : c)));
    } catch (err: any) {
      alert(err.message || 'Failed to rename conversation');
    }
  };

  // Delete conversation
  const handleDeleteConversation = async (convId: string) => {
    if (!activeSubject) return;
    try {
      await api.deleteConversation(activeSubject.id, convId);
      const remaining = conversations.filter((c) => c.id !== convId);
      setConversations(remaining);
      if (activeConversationId === convId) {
        if (remaining.length > 0) {
          handleSelectConversation(remaining[0].id);
        } else {
          handleCreateConversation();
        }
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete conversation');
    }
  };

  // Source upload / add handlers
  const handleUploadFiles = async (files: File[]) => {
    if (!activeSubject) return;
    for (const f of files) {
      try {
        const newSrc = await api.uploadSource(activeSubject.id, f);
        setSources((prev) => [newSrc, ...prev.filter((s) => s.id !== newSrc.id)]);
        if (newSrc.status === 'ready') {
          setSelectedSourceIds((prev) => [...prev, newSrc.id]);
        } else if (newSrc.status === 'failed') {
          throw new Error(newSrc.error_message || 'Processing failed');
        }
      } catch (err: any) {
        throw err;
      }
    }
    const sqs = await api.getStarterQuestions(activeSubject.id).catch(() => []);
    setStarterQuestions(sqs);
  };

  const handlePasteText = async (title: string, text: string) => {
    if (!activeSubject) return;
    const newSrc = await api.pasteSource(activeSubject.id, title, text);
    setSources((prev) => [newSrc, ...prev.filter((s) => s.id !== newSrc.id)]);
    if (newSrc.status === 'ready') {
      setSelectedSourceIds((prev) => [...prev, newSrc.id]);
    }
    const sqs = await api.getStarterQuestions(activeSubject.id);
    setStarterQuestions(sqs);
  };

  const handleAddUrl = async (url: string, title?: string) => {
    if (!activeSubject) return;
    const newSrc = await api.urlSource(activeSubject.id, url, title);
    setSources((prev) => [newSrc, ...prev.filter((s) => s.id !== newSrc.id)]);
    if (newSrc.status === 'ready') {
      setSelectedSourceIds((prev) => [...prev, newSrc.id]);
    }
    const sqs = await api.getStarterQuestions(activeSubject.id);
    setStarterQuestions(sqs);
    if (newSrc.status === 'failed') {
      throw new Error(newSrc.error_message || 'Failed to fetch webpage.');
    }
  };

  const handleRenameSource = async (sourceId: string, title: string) => {
    if (!activeSubject) return;
    const updated = await api.renameSource(activeSubject.id, sourceId, title);
    setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, title: updated.title } : s)));
  };

  const handleDeleteSource = async (sourceId: string) => {
    if (!activeSubject) return;
    await api.deleteSource(activeSubject.id, sourceId);
    setSources((prev) => prev.filter((s) => s.id !== sourceId));
    setSelectedSourceIds((prev) => prev.filter((id) => id !== sourceId));
    const sqs = await api.getStarterQuestions(activeSubject.id);
    setStarterQuestions(sqs);
  };

  const handleRetrySource = async (sourceId: string) => {
    if (!activeSubject) return;
    const retried = await api.retrySource(activeSubject.id, sourceId);
    setSources((prev) => prev.map((s) => (s.id === sourceId ? retried : s)));
    if (retried.status === 'ready') {
      setSelectedSourceIds((prev) => [...prev, retried.id]);
    }
  };

  const handleReplaceSource = async (sourceId: string, file: File) => {
    if (!activeSubject) return;
    const replaced = await api.replaceSource(activeSubject.id, sourceId, file);
    setSources((prev) => prev.map((s) => (s.id === sourceId ? replaced : s)));
    if (replaced.status === 'ready' && !selectedSourceIds.includes(replaced.id)) {
      setSelectedSourceIds((prev) => [...prev, replaced.id]);
    }
  };

  // Send grounded chat message
  const handleSendMessage = async (
    queryText: string,
    options?: { is_retry?: boolean; retry_message_id?: string }
  ) => {
    if (!activeSubject || !activeConversationId || chatLoading) return;
    const trimmed = queryText.trim();
    if (!trimmed) return;

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(`notebookspace_stopped_${activeConversationId}`);
      } catch {}
    }

    if (options?.is_retry && options?.retry_message_id) {
      setMessages((prev) => prev.filter((m) => m.id !== options.retry_message_id));
    } else if (!options?.is_retry) {
      // Optimistic user turn only if not retrying
      const tempUserMsg: MessageItem = {
        id: `temp-${Date.now()}`,
        conversation_id: activeConversationId,
        user_id: currentUser?.id || '',
        role: 'user',
        content: trimmed,
        citations: [],
        conflicts: [],
        conflict_detected: false,
        abstained: false,
        retrieved: [],
        selected_source_ids: selectedSourceIds,
        source_versions: {},
        tokens: { input: 0, output: 0, total: 0 },
        latency: 0,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);
    }
    setChatLoading(true);

    const controller = new AbortController();
    chatAbortRef.current = controller;

    try {
      await api.sendMessage(
        activeSubject.id,
        activeConversationId,
        trimmed,
        selectedSourceIds,
        controller.signal,
        options
      );
      // Reload actual persisted messages AND conversations so auto-renamed title updates immediately
      const [msgs, convs] = await Promise.all([
        api.getMessages(activeSubject.id, activeConversationId),
        api.getConversations(activeSubject.id),
      ]);
      setMessages(applyStoppedFilter(activeConversationId, msgs));
      setConversations(convs);
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        return;
      }
      // Inline error on failed question with Retry button
      const errorMsg: MessageItem = {
        id: `error-${Date.now()}`,
        conversation_id: activeConversationId,
        user_id: currentUser?.id || '',
        role: 'assistant',
        content: err.message || 'Unable to generate response. Service temporarily unavailable.',
        abstained: false,
        abstain_reason: 'generation_failed',
        citations: [],
        conflicts: [],
        conflict_detected: false,
        retrieved: [],
        selected_source_ids: selectedSourceIds,
        source_versions: {},
        tokens: { input: 0, output: 0, total: 0 },
        latency: 0,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      // Re-throw so composer in SubjectWorkspaceView preserves question text
      throw err;
    } finally {
      setChatLoading(false);
      chatAbortRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
    }
    setChatLoading(false);
    if (activeSubject && activeConversationId) {
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(`notebookspace_stopped_${activeConversationId}`, 'true');
        } catch {}
      }
      const stoppedMsg: MessageItem = {
        id: `stopped-${Date.now()}`,
        conversation_id: activeConversationId,
        user_id: currentUser?.id || '',
        role: 'assistant',
        content: 'Generation stopped by user.',
        abstained: true,
        abstain_reason: 'stopped',
        citations: [],
        conflicts: [],
        conflict_detected: false,
        retrieved: [],
        selected_source_ids: selectedSourceIds,
        source_versions: {},
        tokens: { input: 0, output: 0, total: 0 },
        latency: 0,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant') {
          return [...prev.slice(0, -1), stoppedMsg];
        }
        return [...prev, stoppedMsg];
      });
    }
  };

  // Settings
  const handleUpdateSettings = async (settings: SubjectSettings) => {
    if (!activeSubject) return;
    const updated = await api.updateSubject(activeSubject.id, { settings });
    setActiveSubject(updated);
  };

  // Notes
  const handleCreateNote = async (title: string, content: string) => {
    if (!activeSubject) return;
    const note = await api.createNote(activeSubject.id, { title, content });
    setNotes((prev) => [note, ...prev]);
  };

  const handleSaveAnswerAsNote = async (msg: MessageItem) => {
    if (!activeSubject) return;
    const msgIdx = messages.findIndex((m) => m.id === msg.id);
    const prevUser = [...messages.slice(0, msgIdx)].reverse().find((m) => m.role === 'user');
    const questionTitle = prevUser?.content?.trim() || (msg.citations?.[0]?.file
      ? `Answer from ${msg.citations[0].file}`
      : `Answer: ${msg.content.slice(0, 30)}...`);

    // Idempotent: prevent duplicate note creation on double-save
    const alreadySaved = notes.find(
      (n) => n.is_saved_answer && (n.content === msg.content || n.title === questionTitle)
    );
    if (alreadySaved) {
      return;
    }

    const note = await api.createNote(activeSubject.id, {
      title: questionTitle,
      content: msg.content,
      is_saved_answer: true,
      citations: msg.citations,
    });
    setNotes((prev) => [note, ...prev]);
  };

  const handleUpdateNote = async (noteId: string, title: string, content: string) => {
    if (!activeSubject) return;
    const updated = await api.updateNote(activeSubject.id, noteId, { title, content });
    setNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)));
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!activeSubject) return;
    await api.deleteNote(activeSubject.id, noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  };

  // Subject CRUD for Dashboard
  const handleCreateSubject = async (data: { name: string; course_code?: string; description?: string; settings?: Record<string, any> }) => {
    const subj = await api.createSubject(data);
    setSubjects((prev) => [subj, ...prev]);
    navigateTo('workspace', subj.id);
  };

  const handleCreateSampleSubject = async () => {
    try {
      setSubjectsLoading(true);
      const subj = await api.createSampleSubject();
      setSubjects((prev) => [subj, ...prev]);
      navigateTo('workspace', subj.id);
    } catch (err: any) {
      console.error('Failed to create sample notebook:', err);
    } finally {
      setSubjectsLoading(false);
    }
  };

  const handleUpdateSubject = async (
    subjId: string,
    data: { name?: string; course_code?: string; description?: string }
  ) => {
    const updated = await api.updateSubject(subjId, data);
    setSubjects((prev) =>
      prev.map((s) =>
        s.id === subjId
          ? { ...s, ...updated, source_count: updated.source_count ?? s.source_count ?? 0 }
          : s
      )
    );
    if (activeSubject?.id === subjId) {
      setActiveSubject((prev) =>
        prev
          ? { ...prev, ...updated, source_count: updated.source_count ?? prev.source_count ?? 0 }
          : null
      );
    }
  };

  const handleArchiveSubject = async (subjId: string) => {
    const updated = await api.archiveSubject(subjId);
    setSubjects((prev) =>
      prev.map((s) =>
        s.id === subjId
          ? { ...s, ...updated, source_count: updated.source_count ?? s.source_count ?? 0 }
          : s
      )
    );
    if (activeSubject?.id === subjId) {
      setActiveSubject((prev) =>
        prev
          ? { ...prev, ...updated, source_count: updated.source_count ?? prev.source_count ?? 0 }
          : null
      );
    }
  };

  const handleRestoreSubject = async (subjId: string) => {
    const updated = await api.restoreSubject(subjId);
    setSubjects((prev) =>
      prev.map((s) =>
        s.id === subjId
          ? { ...s, ...updated, source_count: updated.source_count ?? s.source_count ?? 0 }
          : s
      )
    );
    if (activeSubject?.id === subjId) {
      setActiveSubject((prev) =>
        prev
          ? { ...prev, ...updated, source_count: updated.source_count ?? prev.source_count ?? 0 }
          : null
      );
    }
  };

  const handleDeleteSubject = async (subjId: string) => {
    await api.deleteSubject(subjId);
    setSubjects((prev) => {
      const next = prev.filter((s) => s.id !== subjId);
      if (activeSubject?.id === subjId) {
        if (next.length > 0) {
          const first = next.find((s) => !s.is_archived) || next[0];
          navigateTo('workspace', first.id);
          loadSubjectData(first.id);
        } else {
          setActiveSubject(null);
          setSources([]);
          setConversations([]);
          setMessages([]);
          navigateTo('notebooks');
        }
      }
      return next;
    });
  };

  const handleResetWorkspace = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    const res = await api.createGuestSession();
    setCurrentUser(res.user);
    setActiveSubject(null);
    setSources([]);
    setConversations([]);
    setMessages([]);
    navigateTo('notebooks');
    fetchSubjects();
  };

  // --------------------------------------------------------------------------
  // STANDALONE PUBLIC DEMO ASSISTANT (Preserved & Verified)
  // --------------------------------------------------------------------------
  const [demoMessages, setDemoMessages] = useState<ChatMessage[]>([]);
  const [demoQuestion, setDemoQuestion] = useState('');
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoSelectedCitation, setDemoSelectedCitation] = useState<ActiveCitation | null>(null);
  const [demoPassages, setDemoPassages] = useState<PassageItem[]>([]);
  const [demoPassageLoading, setDemoPassageLoading] = useState(false);
  const [isDemoSourceOpen, setIsDemoSourceOpen] = useState(false);
  const [demoDocuments, setDemoDocuments] = useState<DocumentItem[]>([]);
  const [demoUploadFile, setDemoUploadFile] = useState<File | null>(null);
  const [demoUploading, setDemoUploading] = useState(false);
  const [demoUploadMsg, setDemoUploadMsg] = useState<string | null>(null);
  const [isDemoSidebarOpenMobile, setIsDemoSidebarOpenMobile] = useState(false);

  const demoPassageReqId = useRef(0);
  const demoThreadBottomRef = useRef<HTMLDivElement>(null);
  const demoLatestTurnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (route.view === 'demo') {
      fetchDemoDocuments();
    }
  }, [route.view]);

  useEffect(() => {
    if (demoLatestTurnRef.current && typeof demoLatestTurnRef.current.scrollIntoView === 'function') {
      demoLatestTurnRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [demoMessages, demoLoading]);

  const fetchDemoDocuments = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDemoDocuments(data);
      }
    } catch {
      // ignore
    }
  };

  const handleDemoNewChat = () => {
    setDemoMessages([]);
    setDemoQuestion('');
    setDemoSelectedCitation(null);
    setDemoPassages([]);
    setIsDemoSourceOpen(false);
    setIsDemoSidebarOpenMobile(false);
  };

  const loadDemoPassage = async (messageId: string, citation: Citation) => {
    const reqId = ++demoPassageReqId.current;
    setDemoSelectedCitation({ messageId, file: citation.file, page: citation.page });
    setDemoPassageLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/passages?file=${encodeURIComponent(citation.file)}&page=${citation.page}`
      );
      const data = res.ok ? await res.json() : [];
      if (reqId !== demoPassageReqId.current) return;
      setDemoPassages(data);
    } catch {
      if (reqId !== demoPassageReqId.current) return;
      setDemoPassages([]);
    } finally {
      if (reqId === demoPassageReqId.current) setDemoPassageLoading(false);
    }
  };

  const handleDemoSelectCitation = (cit: Citation, messageId?: string) => {
    const targetMsgId =
      messageId || demoSelectedCitation?.messageId || demoActiveMessage?.id || '';
    setIsDemoSourceOpen(true);
    loadDemoPassage(targetMsgId, cit);
  };

  const executeDemoAsk = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed || demoLoading) return;

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `asst-${Date.now()}`;

    setDemoMessages((prev) => [
      ...prev,
      { id: userMessageId, role: 'user', content: trimmed },
      { id: assistantMessageId, role: 'assistant', loading: true, questionText: trimmed },
    ]);
    setDemoQuestion('');
    setDemoLoading(true);

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
      setDemoMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, loading: false, result: data, error: null }
            : msg
        )
      );

      if (data.citations && data.citations.length > 0 && !data.abstained) {
        if (typeof window !== 'undefined' && window.innerWidth > 768) {
          setIsDemoSourceOpen(true);
        }
        loadDemoPassage(assistantMessageId, data.citations[0]);
      } else if (
        !data.abstained &&
        data.conflict_detected &&
        data.conflicts &&
        data.conflicts.length > 0
      ) {
        const firstClaim = data.conflicts[0]?.claims?.[0];
        if (firstClaim) {
          if (typeof window !== 'undefined' && window.innerWidth > 768) {
            setIsDemoSourceOpen(true);
          }
          loadDemoPassage(assistantMessageId, { file: firstClaim.file, page: firstClaim.page });
        }
      }
    } catch (err: any) {
      setDemoMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, loading: false, error: err.message || 'Error', result: null }
            : msg
        )
      );
    } finally {
      setDemoLoading(false);
    }
  };

  const handleDemoUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoMode) {
      setDemoUploadMsg('Error: Upload is disabled in demo mode.');
      return;
    }
    if (!demoUploadFile) return;

    setDemoUploading(true);
    setDemoUploadMsg(null);
    const formData = new FormData();
    formData.append('file', demoUploadFile);

    try {
      const res = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.detail || 'Upload failed');
      }
      const data = await res.json();
      setDemoUploadMsg(`Successfully uploaded ${data.file_name}: stored ${data.chunks_stored} chunk(s).`);
      setDemoUploadFile(null);
      fetchDemoDocuments();
    } catch (err: any) {
      setDemoUploadMsg(`Error: ${err.message}`);
    } finally {
      setDemoUploading(false);
    }
  };

  const demoActiveMessage = demoSelectedCitation
    ? demoMessages.find((m) => m.id === demoSelectedCitation.messageId)
    : [...demoMessages]
        .reverse()
        .find((m) => m.result && (m.result.citations?.length || m.result.conflicts?.length));

  const demoActiveCitations = React.useMemo(() => {
    if (!demoActiveMessage?.result) return [];
    const list: Citation[] = [];
    const seen = new Set<string>();

    for (const c of demoActiveMessage.result.citations || []) {
      const key = `${normalizeFileName(c.file)}:${c.page}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push({ file: c.file, page: c.page });
      }
    }
    for (const conf of demoActiveMessage.result.conflicts || []) {
      for (const claim of conf.claims || []) {
        const key = `${normalizeFileName(claim.file)}:${claim.page}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({ file: claim.file, page: claim.page });
        }
      }
    }
    return list;
  }, [demoActiveMessage]);

  const demoActiveRetrieved = demoActiveMessage?.result?.retrieved || [];

  return (
    <div className="app-shell">
      {/* RENDER ACTIVE ROUTE VIEW */}
      {route.view === 'demo' ? (
        /* Standalone Public Demo View */
        <div className="chat-app-root">
          {isDemoSidebarOpenMobile && (
            <div
              className="sidebar-overlay"
              onClick={() => setIsDemoSidebarOpenMobile(false)}
              aria-hidden="true"
            />
          )}

          <Sidebar
            documents={demoDocuments}
            isDemoMode={true}
            onNewChat={handleDemoNewChat}
            onUpload={handleDemoUpload}
            uploadFile={demoUploadFile}
            setUploadFile={setDemoUploadFile}
            uploading={demoUploading}
            uploadMsg={demoUploadMsg}
            isOpenMobile={isDemoSidebarOpenMobile}
            onCloseMobile={() => setIsDemoSidebarOpenMobile(false)}
          />

          <div className="chat-main-area">
            <header className="chat-header">
              <div className="chat-header-left">
                <button
                  type="button"
                  className="btn-icon mobile-menu-btn"
                  onClick={() => setIsDemoSidebarOpenMobile(true)}
                  aria-label="Open sidebar menu"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                </button>
                <span className="chat-header-title">NotebookSpace</span>
              </div>
              <div className="chat-header-right">
                <span className="demo-pill" data-testid="demo-pill">
                  Public demo
                </span>
                <button
                  type="button"
                  className="btn-icon mobile-new-btn"
                  onClick={handleDemoNewChat}
                  aria-label="New conversation"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
            </header>

            {demoMessages.length === 0 ? (
              <main className="empty-state-scroll-container">
                <div className="empty-state-centered-box">
                  <div className="empty-state-brand-mark" aria-hidden="true">
                    <span className="brand-logo-letter empty-state-logo-letter">N</span>
                  </div>
                  <h1 className="empty-state-heading">What would you like to understand?</h1>
                  <p className="empty-state-subtext">
                    Ask about your course. Every answer starts with your sources.
                  </p>
                  <div className="starter-chips-container" role="group" aria-label="Starter questions">
                    <button
                      type="button"
                      className="starter-chip-btn"
                      onClick={() => {
                        setDemoQuestion('What is the grade breakdown for this course?');
                        executeDemoAsk('What is the grade breakdown for this course?');
                      }}
                    >
                      Grade breakdown
                    </button>
                    <button
                      type="button"
                      className="starter-chip-btn"
                      onClick={() => {
                        setDemoQuestion('Where is the lecture room and when does class meet?');
                        executeDemoAsk('Where is the lecture room and when does class meet?');
                      }}
                    >
                      Lecture room
                    </button>
                    <button
                      type="button"
                      className="starter-chip-btn"
                      onClick={() => {
                        setDemoQuestion('Do the syllabi disagree on any policies or dates?');
                        executeDemoAsk('Do the syllabi disagree on any policies or dates?');
                      }}
                    >
                      Do the syllabi disagree?
                    </button>
                  </div>
                  <Composer
                    question={demoQuestion}
                    setQuestion={setDemoQuestion}
                    onSubmit={(e) => {
                      e.preventDefault();
                      executeDemoAsk(demoQuestion);
                    }}
                    loading={demoLoading}
                  />
                </div>
              </main>
            ) : (
              <>
                <main className="thread-scroll-container">
                  <div className="thread-content-max">
                    <div className="thread-messages-list">
                      {demoMessages.map((msg, idx) => (
                        <div
                          key={msg.id}
                          ref={idx === demoMessages.length - 1 ? demoLatestTurnRef : undefined}
                          className={`thread-turn turn-${msg.role}`}
                        >
                          {msg.role === 'user' ? (
                            <div className="user-message-bubble">{msg.content}</div>
                          ) : (
                            <AssistantMessage
                              messageId={msg.id}
                              loading={msg.loading}
                              error={msg.error}
                              result={msg.result}
                              searchedQuery={msg.questionText}
                              selectedCitation={demoSelectedCitation}
                              onSelectCitation={(cit, mId) =>
                                handleDemoSelectCitation(cit, mId || msg.id)
                              }
                            />
                          )}
                        </div>
                      ))}
                      <div ref={demoThreadBottomRef} />
                    </div>
                  </div>
                </main>
                <Composer
                  question={demoQuestion}
                  setQuestion={setDemoQuestion}
                  onSubmit={(e) => {
                    e.preventDefault();
                    executeDemoAsk(demoQuestion);
                  }}
                  loading={demoLoading}
                />
              </>
            )}
          </div>

          <SourcePanel
            selectedCitation={demoSelectedCitation}
            citations={demoActiveCitations}
            passages={demoPassages}
            passageLoading={demoPassageLoading}
            retrieved={demoActiveRetrieved as any}
            onSelectCitation={(cit) => {
              const targetMsgId = demoSelectedCitation?.messageId || demoActiveMessage?.id;
              if (targetMsgId) {
                handleDemoSelectCitation(cit, targetMsgId);
              }
            }}
            onClose={() => {
              setIsDemoSourceOpen(false);
              setDemoSelectedCitation(null);
            }}
            isOpen={isDemoSourceOpen}
          />
        </div>
      ) : (
        /* NotebookLM-Style Unified Shell */
        <DashboardView
          subjects={subjects}
          workspaceMode={route.view === 'workspace'}
          loading={subjectsLoading}
          activeSubjectId={activeSubject?.id}
          currentUser={currentUser}
          onOpenSubject={(id) => navigateTo('workspace', id)}
          onCreateSubject={handleCreateSubject}
          onCreateSampleSubject={handleCreateSampleSubject}
          onUpdateSubject={handleUpdateSubject}
          onArchiveSubject={handleArchiveSubject}
          onRestoreSubject={handleRestoreSubject}
          onDeleteSubject={handleDeleteSubject}
          onResetWorkspace={handleResetWorkspace}
          isMobileSidebarOpen={isMobileNotebooksOpen}
          onSetMobileSidebarOpen={setIsMobileNotebooksOpen}
        >
          {route.view === 'workspace' && activeSubject ? (
            /* Selected Notebook Workspace View */
            <SubjectWorkspaceView
              subject={activeSubject}
              sources={sources}
              conversations={conversations}
              notes={notes}
              activeConversationId={activeConversationId}
              selectedSourceIds={selectedSourceIds}
              starterQuestions={starterQuestions}
              isDemoMode={isDemoMode}
              currentUser={currentUser}
              onBackToDashboard={() => navigateTo('notebooks')}
              onSelectSources={setSelectedSourceIds}
              onSelectConversation={handleSelectConversation}
              onCreateConversation={handleCreateConversation}
              onRenameConversation={handleRenameConversation}
              onDeleteConversation={handleDeleteConversation}
              onUploadFiles={handleUploadFiles}
              onPasteText={handlePasteText}
              onAddUrl={handleAddUrl}
              onRenameSource={handleRenameSource}
              onDeleteSource={handleDeleteSource}
              onRetrySource={handleRetrySource}
              onReplaceSource={handleReplaceSource}
              onSendMessage={handleSendMessage}
              onUpdateSettings={handleUpdateSettings}
              onCreateNote={handleCreateNote}
              onSaveAnswerAsNote={handleSaveAnswerAsNote}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
              messages={messages}
              chatLoading={chatLoading}
              historyLoading={historyLoading}
              onStopGeneration={handleStopGeneration}
              onResetWorkspace={handleResetWorkspace}
            />
          ) : route.view === 'workspace' && subjectsLoading ? (
            <WorkspaceSkeleton />
          ) : null}
        </DashboardView>
      )}
    </div>
  );
}

export default App;
