export interface Citation {
  file: string;
  page: number;
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
}

export interface DocumentItem {
  file_name: string;
  upload_date?: string | null;
  chunk_count: number;
}

export interface PassageItem {
  file_name: string;
  page_number: number;
  chunk_index: number;
  text: string;
  chunk_text?: string | null;
}
