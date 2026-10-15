import React, { useState, useRef, useEffect } from 'react';
import { ACCEPT_ATTRIBUTE, MAX_DOCUMENT_MB } from '../uploads';

interface SourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadFiles: (files: File[]) => void | Promise<void>;
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
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Paste tab state
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');

  // URL tab state
  const [urlInput, setUrlInput] = useState('');
  const [urlTitle, setUrlTitle] = useState('');

  // Submission state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Focus trap and Escape key handling
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      // A link is never a draft worth keeping: stale values once saved a page under another page's title.
      setUrlInput('');
      setUrlTitle('');
      return;
    }

    // Auto-focus dialog container on open
    const focusTimer = setTimeout(() => {
      modalRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  // Picking or dropping files starts the upload right away; progress shows in the Sources list.
  const startUpload = (files: File[]) => {
    if (files.length === 0) return;
    void onUploadFiles(files);
    onClose();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      startUpload(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      startUpload(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (tab === 'paste') {
        if (!pasteTitle.trim()) throw new Error('Please enter a title for the pasted content.');
        if (!pasteText.trim()) throw new Error('Please enter or paste the text content.');
        await onPasteText(pasteTitle.trim(), pasteText.trim());
        setPasteTitle('');
        setPasteText('');
        onClose();
      } else if (tab === 'url') {
        if (!urlInput.trim()) throw new Error('Please enter a webpage URL.');
        await onAddUrl(urlInput.trim(), urlTitle.trim() || undefined);
        setUrlInput('');
        setUrlTitle('');
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add source.');
    } finally {
      setLoading(false);
    }
  };

  const handleDismissDialog = () => {
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleDismissDialog}>
      <div
        ref={modalRef}
        tabIndex={-1}
        className="modal-content modal-content-md"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <h2 id="modal-title">Add sources to notebook</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={handleDismissDialog}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Tab Selection */}
        <div className="modal-tab-bar">
          <button
            type="button"
            className={`modal-tab-btn ${tab === 'upload' ? 'active' : ''}`}
            onClick={() => {
              setTab('upload');
              setError(null);
            }}
          >
            Upload files
          </button>
          <button
            type="button"
            className={`modal-tab-btn ${tab === 'paste' ? 'active' : ''}`}
            onClick={() => {
              setTab('paste');
              setError(null);
            }}
          >
            Paste text
          </button>
          <button
            type="button"
            className={`modal-tab-btn ${tab === 'url' ? 'active' : ''}`}
            onClick={() => {
              setTab('url');
              setError(null);
            }}
          >
            Webpage URL
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="form-error-banner" role="alert">{error}</div>}

          {/* 1. UPLOAD TAB */}
          {tab === 'upload' && (
            <div
              className={`drop-zone ${isDragging ? 'drop-zone-active' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="Choose files to upload"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPT_ATTRIBUTE}
                style={{ display: 'none' }}
                onChange={handleFileChange}
                data-testid="source-file-input"
              />
              <div className="drop-zone-icon" aria-hidden="true">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <p className="drop-zone-text">
                Drop files here or <span className="drop-zone-link">choose files</span>
              </p>
              <p className="drop-zone-hint">
                PDF, PowerPoint, Word, Excel, CSV, text, Markdown, HTML and code · up to {MAX_DOCUMENT_MB} MB each
              </p>
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

          {tab !== 'upload' && (
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleDismissDialog}
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
                {loading ? 'Adding…' : 'Add Source'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
