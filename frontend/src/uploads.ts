// What the Add sources flow accepts. Mirrors ingestion/file_types.py on the server.

export const DOCUMENT_EXTENSIONS = ['.pdf', '.pptx', '.docx', '.xlsx'];
export const TEXT_EXTENSIONS = [
  '.txt', '.md', '.markdown', '.csv', '.html', '.htm', '.tex', '.rtf',
  '.json', '.yaml', '.yml', '.xml', '.sql', '.ipynb',
  '.py', '.c', '.h', '.cpp', '.hpp', '.cc', '.java', '.js', '.jsx', '.ts', '.tsx',
  '.go', '.rs', '.rb', '.kt', '.swift', '.scala', '.r', '.m', '.sh', '.asm', '.s',
];
export const ACCEPTED_EXTENSIONS = [...DOCUMENT_EXTENSIONS, ...TEXT_EXTENSIONS];
export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(',');

export const MAX_DOCUMENT_MB = 100;
export const MAX_TEXT_MB = 20;

const LEGACY_HINTS: Record<string, string> = {
  '.ppt': 'Save it as .pptx or PDF first.',
  '.doc': 'Save it as .docx or PDF first.',
  '.xls': 'Save it as .xlsx or CSV first.',
};

const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
};

/** Returns a short reason the file can't be uploaded, or null when it's fine. */
export const uploadProblem = (file: File): string | null => {
  const ext = extensionOf(file.name);
  if (LEGACY_HINTS[ext]) return `Old ${ext} format. ${LEGACY_HINTS[ext]}`;
  if (!ACCEPTED_EXTENSIONS.includes(ext)) return 'This file type isn’t supported.';
  const limit = DOCUMENT_EXTENSIONS.includes(ext) ? MAX_DOCUMENT_MB : MAX_TEXT_MB;
  if (file.size > limit * 1024 * 1024) {
    return `Larger than ${limit} MB (${(file.size / (1024 * 1024)).toFixed(0)} MB).`;
  }
  return null;
};

export interface PendingUpload {
  id: string;
  name: string;
  size: number;
  progress: number; // 0–100 while the bytes are sent
  error: string | null;
  /** Refused before sending (wrong type or too big): retrying can't help. */
  rejected: boolean;
  file: File;
}
