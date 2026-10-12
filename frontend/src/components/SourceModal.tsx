import React, { useState, useRef } from 'react';

interface SourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadFiles: (files: File[]) => Promise<void>;
  onPasteText: (title: string, text: string) => Promise<void>;
  onAddUrl: (url: string, title?: string) => Promise<void>;
}

export const SourceModal: React.FC<SourceModalProps> = ({
  isOpen,
  onClose,
  onUploadFiles,
  onPasteText,
  onAddUrl,
}) => {
  const [tab, setTab] = useState<'upload' | 'paste' | 'url'>('upload');

  // Upload tab state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Paste tab state
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');

  // URL tab state
  const [urlInput, setUrlInput] = useState('');
  const [urlTitle, setUrlTitle] = useState('');

  // Submission state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (tab === 'upload') {
        if (selectedFiles.length === 0) {
          throw new Error('Please select at least one file to upload.');
        }
        const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
        for (const file of selectedFiles) {
          if (file.size > MAX_UPLOAD_SIZE) {
            throw new Error(`"${file.name}" exceeds the 50 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
          }
        }
        await onUploadFiles(selectedFiles);
      } else if (tab === 'paste') {
        if (!pasteTitle.trim()) throw new Error('Please enter a title for the pasted content.');
        if (!pasteText.trim()) throw new Error('Please enter or paste the text content.');
        await onPasteText(pasteTitle.trim(), pasteText.trim());
      } else if (tab === 'url') {
        if (!urlInput.trim()) throw new Error('Please enter a webpage URL.');
        await onAddUrl(urlInput.trim(), urlTitle.trim() || undefined);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add source.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content modal-content-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Sources to Subject</h2>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {/* Tab Selection */}
        <div className="modal-tab-bar">
          <button
            type="button"
            className={`modal-tab-btn ${tab === 'upload' ? 'active' : ''}`}
            onClick={() => setTab('upload')}
          >
            File Uploads
          </button>
          <button
            type="button"
            className={`modal-tab-btn ${tab === 'paste' ? 'active' : ''}`}
            onClick={() => setTab('paste')}
          >
            Paste Text
          </button>
          <button
            type="button"
            className={`modal-tab-btn ${tab === 'url' ? 'active' : ''}`}
            onClick={() => setTab('url')}
          >
            Webpage URL
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="form-error-banner" role="alert">{error}</div>}

          {/* 1. UPLOAD TAB */}
          {tab === 'upload' && (
            <div>
              <div
                className={`drop-zone ${isDragging ? 'drop-zone-active' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.txt,.md,.markdown"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <div className="drop-zone-icon" aria-hidden="true">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <p className="drop-zone-text">
                  Drag and drop files here, or <span className="drop-zone-link">browse</span>
                </p>
                <p className="drop-zone-hint">
                  Supports PDF, Plain Text (.txt), and Markdown (.md). Max 50 MB per file.
                </p>
              </div>

              {selectedFiles.length > 0 && (
                <div className="selected-files-list">
                  <h4 className="selected-files-title">Selected files ({selectedFiles.length}):</h4>
                  <ul>
                    {selectedFiles.map((file, idx) => (
                      <li key={idx} className="selected-file-row">
                        <span className="file-name">{file.name}</span>
                        <span className="file-size">{(file.size / 1024).toFixed(0)} KB</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* 2. PASTE TAB */}
          {tab === 'paste' && (
            <div>
              <div className="form-group">
                <label htmlFor="paste-source-title">Source Title *</label>
                <input
                  id="paste-source-title"
                  type="text"
                  required
                  placeholder="e.g. Lecture 3 Notes or Assignment Guidelines"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label htmlFor="paste-source-text">Text Content *</label>
                <textarea
                  id="paste-source-text"
                  rows={8}
                  required
                  placeholder="Paste lecture text, syllabus policies, or notes here..."
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          )}

          {/* 3. URL TAB */}
          {tab === 'url' && (
            <div>
              <div className="form-group">
                <label htmlFor="url-source-input">Public Webpage URL *</label>
                <input
                  id="url-source-input"
                  type="url"
                  required
                  placeholder="https://example.com/course-reading"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label htmlFor="url-source-title">Display Title (Optional)</label>
                <input
                  id="url-source-title"
                  type="text"
                  placeholder="e.g. Official Course Webpage"
                  value={urlTitle}
                  onChange={(e) => setUrlTitle(e.target.value)}
                  disabled={loading}
                />
              </div>
              <p className="url-security-note">
                Only public web pages are accepted. Internal or local network addresses are rejected for security.
              </p>
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              data-testid="submit-add-source-btn"
            >
              {loading ? 'Processing & Ingesting...' : 'Add Source'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
