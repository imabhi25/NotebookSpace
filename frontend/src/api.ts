import {
  Subject,
  Source,
  Conversation,
  MessageItem,
  Note,
  PassageItem,
  User,
  AskResponse,
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

// Generic fetch wrapper with error parsing
async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = getAuthHeaders((options.headers as Record<string, string>) || {});
  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });
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
    signal?: AbortSignal
  ): Promise<MessageItem> {
    return apiFetch<MessageItem>(`/subjects/${subjectId}/conversations/${conversationId}/messages`, {
      method: 'POST',
      signal,
      body: JSON.stringify({
        question,
        selected_source_ids: selectedSourceIds,
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

  // Legacy Passages & Ask
  async getPassages(file: string, page: number): Promise<PassageItem[]> {
    const res = await fetch(`${API_BASE_URL}/passages?file=${encodeURIComponent(file)}&page=${page}`);
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
