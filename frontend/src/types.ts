export interface Citation {
  file: string;
  page: number;
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
  upload_date?: string | null;
}

export interface ConflictItem {
  topic: string;
  claims: ConflictClaim[];
}

export interface AskResponse {
  answer: string;
  citations: Citation[];
  conflicts: ConflictItem[];
  conflict_detected: boolean;
  abstained: boolean;
  abstain_reason?: string | null;
  retrieved: Array<{
    file_name?: string;
    file?: string;
    page_number?: number;
    page?: number;
    text?: string;
    score?: number;
    upload_date?: string | null;
  }>;
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

export interface PassageItem {
  file_name: string;
  page_number: number;
  chunk_index: number;
  text: string;
  chunk_text?: string | null;
}
