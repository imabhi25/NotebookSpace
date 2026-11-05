import {
  Subject,
  Source,
  Conversation,
  MessageItem,
  Note,
  PassageItem,
  User,
  AskResponse,
  RetrievalMapResponse,
} from './types';

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
).replace(/\/+$/, '');

const TOKEN_KEY = 'notebook_auth_token';

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string | null): void => {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore localStorage errors
  }
};

export const getAuthHeaders = (extraHeaders: Record<string, string> = {}): Record<string, string> => {
  const token = getToken();
  const headers: Record<string, string> = { ...extraHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

let sessionInitPromise: Promise<string | null> | null = null;

async function getOrInitToken(): Promise<string | null> {
  const current = getToken();
  if (current) return current;
  if (!sessionInitPromise) {
    sessionInitPromise = fetch(`${API_BASE_URL}/auth/guest-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Guest session initialization failed');
        const data = await res.json();
        setToken(data.token);
        return data.token;
      })
      .catch(() => null)
      .finally(() => {
        sessionInitPromise = null;
      });
  }
  return sessionInitPromise;
}

// True when the session a request was sent with is missing, expired or unknown to the server.
async function isSessionLost(tokenUsed: string | null): Promise<boolean> {
  if (!tokenUsed) return true;
  // Another request already replaced the session: retry with the current one, no probe needed.
  if (getToken() !== tokenUsed) return true;
  try {
    const me = await fetch(`${API_BASE_URL}/auth/me`, { headers: { Authorization: `Bearer ${tokenUsed}` } });
    return me.status === 401;
  } catch {
    return false;
  }
}

// Generic fetch wrapper with error parsing and automatic guest session init
async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  if (!endpoint.startsWith('/auth/') && !getToken()) {
    try {
      await getOrInitToken();
    } catch {
      // ignore
    }
  }

  let headers = getAuthHeaders((options.headers as Record<string, string>) || {});
  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const tokenUsed = getToken();
  let res = await fetch(url, { ...options, headers });

  // User-data routes answer 404 for a missing or expired session, exactly as they do for a
  // resource that does not exist. The session probe (/auth/me) still answers 401, so it is
  // asked which of the two happened before a fresh guest session replaces the old one.
  const sessionLost =
    !endpoint.startsWith('/auth/') &&
    (res.status === 401 || (res.status === 404 && (await isSessionLost(tokenUsed))));

  if (sessionLost) {
    // Parallel requests can all notice the lost session. Only the first clears it, so the
    // rest reuse the replacement instead of each creating another guest account.
    if (getToken() === tokenUsed) setToken(null);
    try {
      await getOrInitToken();
      headers = getAuthHeaders((options.headers as Record<string, string>) || {});
      if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
      }
      res = await fetch(url, { ...options, headers });
    } catch {
      // ignore
    }
  }

  if (!res.ok) {
    let errorDetail = `Request failed (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }
  return res.json();
}

export const api = {
  // Auth
  async register(email: string, password: string): Promise<{ token: string; user: User }> {
    const data = await apiFetch<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    return data;
  },

  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const data = await apiFetch<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    return data;
  },

  async demoLogin(): Promise<{ token: string; user: User }> {
    const data = await apiFetch<{ token: string; user: User }>('/auth/demo-login', {
      method: 'POST',
    });
    setToken(data.token);
    return data;
  },

  async getMe(): Promise<User | null> {
    if (!getToken()) return null;
    try {
      return await apiFetch<User>('/auth/me');
    } catch {
      setToken(null);
      return null;
    }
  },

  async createGuestSession(): Promise<{ token: string; user: User }> {
    const data = await apiFetch<{ token: string; user: User }>('/auth/guest-session', {
      method: 'POST',
    });
    setToken(data.token);
    return data;
  },

  async ensureSession(): Promise<User> {
    if (getToken()) {
      try {
        const u = await apiFetch<User>('/auth/me');
        if (u) return u;
      } catch {
        setToken(null);
      }
    }
    const res = await this.createGuestSession();
    return res.user;
  },

  async getAuthConfig(): Promise<{ allow_demo_login: boolean; demo_mode: boolean }> {
    try {
      return await apiFetch<{ allow_demo_login: boolean; demo_mode: boolean }>('/auth/config');
    } catch {
      return { allow_demo_login: false, demo_mode: false };
    }
  },

  async logout(): Promise<void> {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    } finally {
      setToken(null);
    }
  },

  // Subjects
  async getSubjects(includeArchived = false, search?: string, sortBy = 'updated_at'): Promise<Subject[]> {
    const params = new URLSearchParams();
    if (includeArchived) params.append('include_archived', 'true');
    if (search) params.append('search', search);
    params.append('sort_by', sortBy);
    return apiFetch<Subject[]>(`/subjects?${params.toString()}`);
  },

  async createSubject(data: {
    name: string;
    course_code?: string;
    description?: string;
    settings?: Record<string, any>;
  }): Promise<Subject> {
    return apiFetch<Subject>('/subjects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async createSampleSubject(): Promise<Subject> {
    await getOrInitToken();
    return apiFetch<Subject>('/subjects/sample', {
      method: 'POST',
    });
  },

  async getSubject(id: string): Promise<Subject> {
    return apiFetch<Subject>(`/subjects/${id}`);
  },

  async updateSubject(
    id: string,
    data: {
      name?: string;
      course_code?: string;
      description?: string;
      is_archived?: boolean;
      settings?: Record<string, any>;
    }
  ): Promise<Subject> {
    return apiFetch<Subject>(`/subjects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteSubject(id: string): Promise<void> {
    await apiFetch(`/subjects/${id}`, { method: 'DELETE' });
  },

  async archiveSubject(id: string): Promise<Subject> {
    return apiFetch<Subject>(`/subjects/${id}/archive`, { method: 'POST' });
  },

  async restoreSubject(id: string): Promise<Subject> {
    return apiFetch<Subject>(`/subjects/${id}/restore`, { method: 'POST' });
  },

  async getStarterQuestions(subjectId: string): Promise<string[]> {
    return apiFetch<string[]>(`/subjects/${subjectId}/starter-questions`);
  },

  // Sources
  async getSources(subjectId: string, search?: string): Promise<Source[]> {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiFetch<Source[]>(`/subjects/${subjectId}/sources${params}`);
  },

  async uploadSource(subjectId: string, file: File): Promise<Source> {
    const formData = new FormData();
    formData.append('file', file);
    return apiFetch<Source>(`/subjects/${subjectId}/sources/upload`, {
      method: 'POST',
      body: formData,
    });
  },

  async pasteSource(subjectId: string, title: string, text: string): Promise<Source> {
    return apiFetch<Source>(`/subjects/${subjectId}/sources/paste`, {
      method: 'POST',
      body: JSON.stringify({ title, text }),
    });
  },

  async urlSource(subjectId: string, url: string, title?: string): Promise<Source> {
    return apiFetch<Source>(`/subjects/${subjectId}/sources/url`, {
      method: 'POST',
      body: JSON.stringify({ url, title }),
    });
  },

  async getSourceDetail(subjectId: string, sourceId: string): Promise<Source> {
    return apiFetch<Source>(`/subjects/${subjectId}/sources/${sourceId}`);
  },

  async renameSource(subjectId: string, sourceId: string, title: string): Promise<Source> {
    return apiFetch<Source>(`/subjects/${subjectId}/sources/${sourceId}`, {
      method: 'PUT',
      body: JSON.stringify({ title }),
    });
  },

  async deleteSource(subjectId: string, sourceId: string): Promise<void> {
    await apiFetch(`/subjects/${subjectId}/sources/${sourceId}`, { method: 'DELETE' });
  },

  async retrySource(subjectId: string, sourceId: string): Promise<Source> {
    return apiFetch<Source>(`/subjects/${subjectId}/sources/${sourceId}/retry`, {
      method: 'POST',
    });
  },

  async replaceSource(subjectId: string, sourceId: string, file: File): Promise<Source> {
    const formData = new FormData();
    formData.append('file', file);
    return apiFetch<Source>(`/subjects/${subjectId}/sources/${sourceId}/replace`, {
      method: 'POST',
      body: formData,
    });
  },

  // Conversations
  async getConversations(subjectId: string): Promise<Conversation[]> {
    return apiFetch<Conversation[]>(`/subjects/${subjectId}/conversations`);
  },

  async createConversation(subjectId: string, title?: string): Promise<Conversation> {
    return apiFetch<Conversation>(`/subjects/${subjectId}/conversations`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  },

  async renameConversation(subjectId: string, conversationId: string, title: string): Promise<Conversation> {
    return apiFetch<Conversation>(`/subjects/${subjectId}/conversations/${conversationId}`, {
      method: 'PUT',
      body: JSON.stringify({ title }),
    });
  },

  async deleteConversation(subjectId: string, conversationId: string): Promise<void> {
    await apiFetch(`/subjects/${subjectId}/conversations/${conversationId}`, {
      method: 'DELETE',
    });
  },

  async getMessages(subjectId: string, conversationId: string): Promise<MessageItem[]> {
    return apiFetch<MessageItem[]>(`/subjects/${subjectId}/conversations/${conversationId}/messages`);
  },

  async sendMessage(
    subjectId: string,
    conversationId: string,
    question: string,
    selectedSourceIds: string[],
    signal?: AbortSignal,
    options?: { is_retry?: boolean; retry_message_id?: string }
  ): Promise<MessageItem> {
    return apiFetch<MessageItem>(`/subjects/${subjectId}/conversations/${conversationId}/messages`, {
      method: 'POST',
      signal,
      body: JSON.stringify({
        question,
        selected_source_ids: selectedSourceIds,
        is_retry: options?.is_retry || false,
        retry_message_id: options?.retry_message_id || null,
      }),
    });
  },

  // Notes
  async getNotes(subjectId: string, search?: string): Promise<Note[]> {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiFetch<Note[]>(`/subjects/${subjectId}/notes${params}`);
  },

  async createNote(
    subjectId: string,
    data: {
      title: string;
      content: string;
      is_saved_answer?: boolean;
      citations?: any[];
    }
  ): Promise<Note> {
    return apiFetch<Note>(`/subjects/${subjectId}/notes`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateNote(
    subjectId: string,
    noteId: string,
    data: { title?: string; content?: string }
  ): Promise<Note> {
    return apiFetch<Note>(`/subjects/${subjectId}/notes/${noteId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteNote(subjectId: string, noteId: string): Promise<void> {
    await apiFetch(`/subjects/${subjectId}/notes/${noteId}`, { method: 'DELETE' });
  },

  // Passages & Ask
  async getRetrievalMap(
    subjectId: string,
    options?: {
      conversationId?: string;
      messageId?: string;
      question?: string;
      selectedSourceIds?: string[];
    }
  ): Promise<RetrievalMapResponse> {
    const params = new URLSearchParams();
    if (options?.conversationId) params.append('conversation_id', options.conversationId);
    if (options?.messageId) params.append('message_id', options.messageId);
    if (options?.question) params.append('question', options.question);
    if (options?.selectedSourceIds && options.selectedSourceIds.length > 0) {
      for (const sid of options.selectedSourceIds) {
        params.append('selected_source_ids', sid);
      }
    }
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return await apiFetch<RetrievalMapResponse>(`/subjects/${subjectId}/retrieval-map${queryStr}`);
  },

  async getPassages(file: string, page: number, subjectId?: string, sourceId?: string): Promise<PassageItem[]> {
    // Passages are served only to a signed-in session. A refusal reads as "nothing to show".
    await getOrInitToken();
    let url = `${API_BASE_URL}/passages?file=${encodeURIComponent(file)}&page=${page}`;
    if (subjectId) url += `&subject_id=${encodeURIComponent(subjectId)}`;
    if (sourceId) url += `&source_id=${encodeURIComponent(sourceId)}`;
    const res = await fetch(url, {
      headers: getAuthHeaders(),
    });
    return res.ok ? await res.json() : [];
  },

  async legacyAsk(question: string, k = 5): Promise<AskResponse> {
    const res = await fetch(`${API_BASE_URL}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, k }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server returned ${res.status}`);
    }
    return res.json();
  },
};
