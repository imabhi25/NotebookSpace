import React, { useState, useRef, useEffect } from 'react';

export interface FileUploadResult {
  filename: string;
  status: 'added' | 'failed' | 'skipped';
  reason?: string;
}

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
};

interface SourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadFiles: (files: File[]) => Promise<void>;
  onPasteText: (title: string, text: string) => Promise<void>;
  onAddUrl: (url: string, title?: string) => Promise<void>;
  /** Files dropped on the sources panel; queued on the upload tab when the dialog opens. */
  initialFiles?: File[];
  /** A link typed into the sources panel; opens the dialog on the link tab with it filled in. */
  initialUrl?: string;
}

export const SourceModal: React.FC<SourceModalProps> = ({
  isOpen,
  onClose,
  onUploadFiles,
  onPasteText,
  onAddUrl,
  initialFiles,
  initialUrl,
}) => {
  const [tab, setTab] = useState<'upload' | 'paste' | 'url'>('upload');

  // Upload tab state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadResults, setUploadResults] = useState<FileUploadResult[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Paste tab state
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');

  // URL tab state
  const [urlInput, setUrlInput] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  // The panel's link is applied once per opening; the effect below re-runs on every parent render.
  const appliedUrl = useRef('');

  // Submission state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Focus trap and Escape key handling
  useEffect(() => {
    if (!isOpen) {
      setUploadResults(null);
      setSelectedFiles([]);
      setError(null);
      // A link is never a draft worth keeping: stale values once saved a page under another page's title.
      setUrlInput('');
      setUrlTitle('');
      appliedUrl.current = '';
      return;
    }

    if (initialFiles && initialFiles.length > 0) {
      setTab('upload');
      setSelectedFiles(initialFiles);
    } else if (initialUrl && appliedUrl.current !== initialUrl) {
      appliedUrl.current = initialUrl;
      setTab('url');
      setUrlInput(initialUrl);
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFiles(Array.from(e.dataTransfer.files));
      setUploadResults(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(Array.from(e.target.files));
      setUploadResults(null);
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
        const results: FileUploadResult[] = [];

        for (const file of selectedFiles) {
          if (file.size > MAX_UPLOAD_SIZE) {
            results.push({
              filename: file.name,
              status: 'failed',
              reason: `File exceeds 50 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
            });
            continue;
          }

          try {
            await onUploadFiles([file]);
            results.push({
              filename: file.name,
              status: 'added',
            });
          } catch (err: any) {
            const errMsg = err.message || 'Upload failed.';
            if (errMsg.toLowerCase().includes('already exists')) {
              results.push({
                filename: file.name,
                status: 'skipped',
                reason: errMsg,
              });
            } else {
              results.push({
                filename: file.name,
                status: 'failed',
                reason: errMsg,
              });
            }
          }
        }

        setUploadResults(results);
        return; // Keep dialog open so user sees per-file result rows
      } else if (tab === 'paste') {
        if (!pasteTitle.trim()) throw new Error('Please enter a title for the pasted content.');
        if (!pasteText.trim()) throw new Error('Please enter or paste the text content.');
        await onPasteText(pasteTitle.trim(), pasteText.trim());
        setPasteTitle('');
        setPasteText('');
        handleDismissDialog();
      } else if (tab === 'url') {
        if (!urlInput.trim()) throw new Error('Please enter a webpage URL.');
        await onAddUrl(urlInput.trim(), urlTitle.trim() || undefined);
        setUrlInput('');
        setUrlTitle('');
        handleDismissDialog();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add source.');
    } finally {
      setLoading(false);
    }
  };

  const handleDismissDialog = () => {
    setUploadResults(null);
    setSelectedFiles([]);
    onClose();
  };

  const handleDone = async () => {
    if (tab === 'paste') {
      const hasTitle = Boolean(pasteTitle.trim());
      const hasText = Boolean(pasteText.trim());
      if (hasTitle && hasText) {
        setLoading(true);
        setError(null);
        try {
          await onPasteText(pasteTitle.trim(), pasteText.trim());
          setPasteTitle('');
          setPasteText('');
          handleDismissDialog();
        } catch (err: any) {
          setError(err.message || 'Failed to add pasted text.');
        } finally {
          setLoading(false);
        }
        return;
      } else if (hasTitle && !hasText) {
        setError('Please enter or paste the text content.');
        return;
      } else if (!hasTitle && hasText) {
        setError('Please enter a title for the pasted content.');
        return;
      }
    } else if (tab === 'url') {
      if (urlInput.trim()) {
        setLoading(true);
        setError(null);
        try {
          await onAddUrl(urlInput.trim(), urlTitle.trim() || undefined);
          setUrlInput('');
          setUrlTitle('');
          handleDismissDialog();
        } catch (err: any) {
          setError(err.message || 'Failed to add webpage.');
        } finally {
          setLoading(false);
        }
        return;
      }
    }
    handleDismissDialog();
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
            File Uploads
          </button>
          <button
            type="button"
            className={`modal-tab-btn ${tab === 'paste' ? 'active' : ''}`}
            onClick={() => {
              setTab('paste');
              setError(null);
            }}
          >
            Paste Text
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
            <div>
              {uploadResults ? (
                /* Per-file results view after batch upload */
                <div className="upload-results-panel" data-testid="upload-results-panel">
                  <div className="upload-results-header">
                    <h4>Upload Results</h4>
                    <span className="upload-results-summary">
                      {uploadResults.filter((r) => r.status === 'added').length} of {uploadResults.length} files added
                    </span>
                  </div>
                  <div className="upload-results-list" data-testid="upload-results-list">
                    {uploadResults.map((res, rIdx) => (
                      <div
                        key={rIdx}
                        className={`upload-result-item status-${res.status}`}
                        data-testid={`upload-result-${rIdx}`}
                      >
                        <div className="upload-result-info">
                          <span className="upload-result-name">{res.filename}</span>
                          {res.reason && (
                            <span className="upload-result-reason" title={res.reason}>
                              {res.reason}
                            </span>
                          )}
                        </div>
                        <span className={`upload-status-badge badge-${res.status}`}>
                          {res.status === 'added'
                            ? '✓ Added'
                            : res.status === 'skipped'
                            ? '⊘ Skipped'
                            : '✕ Failed'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
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
                            <span className="file-size">{formatFileSize(file.size)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
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

          <div className="modal-actions">
            {uploadResults ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleDone}
                disabled={loading}
                data-testid="upload-results-done-btn"
              >
                {loading ? 'Processing & Ingesting...' : 'Done'}
              </button>
            ) : (
              <>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || (tab === 'upload' && selectedFiles.length === 0)}
                  data-testid="submit-add-source-btn"
                >
                  {loading ? 'Processing & Ingesting...' : 'Add Source'}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
