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

export type ConflictResolutionBasis =
  | 'newer_source_explicit_override'
  | 'date_in_text_newer'
  | 'syllabus_schedule_update'
  | 'explicit_supersede'
  | 'newer_dated_document'
  | string;

export interface ConflictResolution {
  current_file: string;
  current_page: number;
  basis: ConflictResolutionBasis;
  evidence: string;
}

export interface ConflictItem {
  topic: string;
  claims: ConflictClaim[];
  resolution?: ConflictResolution | null;
}

export type ConventionTopic =
  | 'array_indexing'
  | 'log_base'
  | 'range_bounds'
  | 'pseudocode_style'
  | 'other';

export interface ConventionItem {
  topic: ConventionTopic;
  value: string;
  file: string;
  page: number;
  adopted?: boolean;
  source_id?: string | null;
  source_version?: number;
}

export interface ConventionMismatchItem {
  topic: ConventionTopic;
  conventions: ConventionItem[];
  adopted_file?: string | null;
  adopted_value?: string | null;
}

export const formatConventionTopic = (topic: string): string => {
  switch (topic) {
    case 'array_indexing':
      return 'array indexing';
    case 'log_base':
      return 'logarithm base';
    case 'range_bounds':
      return 'range bounds';
    case 'pseudocode_style':
      return 'pseudocode style';
    default:
      return 'convention';
  }
};

export const formatSourceTitle = (fileName?: string | null, sources?: Source[]): string => {
  if (!fileName) return 'Document';
  if (sources && sources.length > 0) {
    const found = sources.find(
      (s) =>
        normalizeFileName(s.file_name) === normalizeFileName(fileName) ||
        normalizeFileName(s.title) === normalizeFileName(fileName)
    );
    if (found && found.title) return found.title;
  }
  const clean = fileName.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

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

export type ProofPart = 'initialization' | 'maintenance' | 'termination' | 'general';
export type ProofVerdict = 'correct' | 'partially_correct' | 'incorrect' | 'missing';

export interface ProofSection {
  part: ProofPart;
  verdict: ProofVerdict;
  feedback: string;
  hint: string;
  citations: Citation[];
}

export interface ProofSubmission {
  statement: string;
  format: 'loop_invariant' | 'free_form';
  initialization?: string;
  maintenance?: string;
  termination?: string;
  body?: string;
}

export interface ProofCheckData {
  type?: 'submission';
  statement?: string;
  format?: 'loop_invariant' | 'free_form';
  initialization?: string;
  maintenance?: string;
  termination?: string;
  body?: string;
  supported?: boolean;
  overall?: string;
  sections?: ProofSection[];
}

/**
 * Escape LaTeX special characters (&, %, #, _) in text, preserving $...$ math blocks untouched.
 */
export function escapeLatex(text: string): string {
  if (!text) return '';
  const segments = text.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g);
  return segments
    .map((seg, idx) => {
      if (idx % 2 === 1) {
        return seg;
      }
      return seg
        .replace(/(?<!\\)&/g, '\\&')
        .replace(/(?<!\\)%/g, '\\%')
        .replace(/(?<!\\)#/g, '\\#')
        .replace(/(?<!\\)_/g, '\\_');
    })
    .join('');
}

/**
 * Format a student proof submission as LaTeX.
 */
export function formatProofAsLatex(sub: ProofSubmission | ProofCheckData): string {
  if (sub.format === 'free_form') {
    const body = escapeLatex(sub.body || '').trim();
    return `\\begin{proof} ${body} \\end{proof}`;
  }
  const init = escapeLatex(sub.initialization || '').trim();
  const maint = escapeLatex(sub.maintenance || '').trim();
  const term = escapeLatex(sub.termination || '').trim();
  return `\\begin{proof} \\textbf{Initialization.} ${init} \\textbf{Maintenance.} ${maint} \\textbf{Termination.} ${term} \\end{proof}`;
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
  conventions?: ConventionItem[];
  convention_mismatches?: ConventionMismatchItem[];
  proof_check?: ProofCheckData | null;
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
  conventions?: ConventionItem[];
  convention_mismatches?: ConventionMismatchItem[];
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

export interface ChunkPosition {
  x: number;
  y: number;
  z: number;
}

export interface RetrievalMapChunk {
  id: number;
  source_id: string;
  file_name: string;
  title: string;
  page_number: number;
  chunk_index: number;
  text: string;
  position: ChunkPosition;
  raw_cosine?: number | null;
  score?: number | null;
  matched_terms: string[];
  is_retrieved: boolean;
}

export interface RetrievalMapResponse {
  subject_id: string;
  question?: string | null;
  query_position?: ChunkPosition | null;
  abstained: boolean;
  abstain_reason?: string | null;
  support_min_score: number;
  chunks: RetrievalMapChunk[];
  retrieved_chunk_ids: number[];
}
