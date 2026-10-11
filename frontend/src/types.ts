export interface User {
  id: string;
  email: string;
  token?: string;
}

export interface SubjectSettings {
  response_length: 'concise' | 'default' | 'detailed';
  response_style: 'general' | 'learning-guide';
}

export interface Subject {
  id: string;
  name: string;
  course_code?: string | null;
  description?: string | null;
  is_archived: boolean;
  settings: SubjectSettings;
  created_at: string;
  updated_at: string;
  source_count: number;
}

export type SourceType = 'pdf' | 'txt' | 'markdown' | 'pasted' | 'url';
export type SourceStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export interface Source {
  id: string;
  subject_id: string;
  user_id: string;
  title: string;
  file_name: string;
  source_type: SourceType;
  source_url?: string | null;
  file_hash?: string | null;
  status: SourceStatus;
  error_message?: string | null;
  page_count: number;
  word_count: number;
  version: number;
  raw_content?: string | null;
  passages?: PassageItem[];
  created_at: string;
  updated_at: string;
}

export interface Citation {
  file: string;
  page: number;
  source_id?: string | null;
  source_version?: number;
  title?: string | null;
  excerpt?: string | null;
}

export const normalizeFileName = (name?: string | null): string =>
  (name || '').trim().normalize().toLowerCase();

export interface ActiveCitation extends Citation {
  messageId: string;
}

export interface ConflictClaim {
  file: string;
  page: number;
  value: string;
  source_id?: string | null;
  source_version?: number;
  upload_date?: string | null;
}

export interface ConflictItem {
  topic: string;
  claims: ConflictClaim[];
}

export interface RetrievedPassage {
  id?: number | string;
  source_id?: string;
  file_name?: string;
  file?: string;
  title?: string;
  page_number?: number;
  page?: number;
  text?: string;
  chunk_text?: string;
  chunk_index?: number;
  score?: number;
  similarity_score?: number;
  source_version?: number;
  upload_date?: string | null;
}

export interface Conversation {
  id: string;
  subject_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface MessageItem {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string | null;
  citations: Citation[];
  conflicts: ConflictItem[];
  conflict_detected: boolean;
  abstained: boolean;
  abstain_reason?: string | null;
  retrieved: RetrievedPassage[];
  selected_source_ids: string[];
  source_versions: Record<string, number>;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  latency: number;
  created_at: string;
}

export interface Note {
  id: string;
  subject_id: string;
  user_id: string;
  title: string;
  content: string;
  is_saved_answer: boolean;
  citations: Citation[];
  created_at: string;
  updated_at: string;
}

export interface PassageItem {
  id?: number | string;
  file_name: string;
  page_number: number;
  chunk_index: number;
  text: string;
  chunk_text?: string | null;
  source_title?: string | null;
}

// Backward compatibility models
export interface AskResponse {
  answer: string;
  citations: Citation[];
  conflicts: ConflictItem[];
  conflict_detected: boolean;
  abstained: boolean;
  abstain_reason?: string | null;
  retrieved: RetrievedPassage[];
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  latency: number;
  model?: string | null;
}

export interface DocumentItem {
  file_name: string;
  upload_date?: string | null;
  chunk_count: number;
  page_count?: number | null;
}
