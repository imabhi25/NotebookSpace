import React, { useState, useRef, useEffect } from 'react';
import { useModalFocus } from '../useModalFocus';
import { SourceTypeIcon } from './SourceRow';

const fileKind = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return { type: 'pdf', badge: 'PDF' };
  if (ext === 'md' || ext === 'markdown') return { type: 'markdown', badge: 'MD' };
  return { type: 'txt', badge: 'TXT' };
};

const Spinner: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg className={`sm-spinner ${className ?? ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
);

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
  initialTab?: 'upload' | 'paste' | 'url';
}

export const SourceModal: React.FC<SourceModalProps> = ({
  isOpen,
  onClose,
  onUploadFiles,
  onPasteText,
  onAddUrl,
  initialFiles,
  initialUrl,
  initialTab,
}) => {
  const [tab, setTab] = useState<'upload' | 'paste' | 'url'>('upload');

  // Upload tab state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadResults, setUploadResults] = useState<FileUploadResult[] | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
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

  // Reset the form whenever the dialog closes; apply files or a link passed in on open.
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

    if (initialTab) setTab(initialTab);
    if (initialFiles && initialFiles.length > 0) {
      setTab('upload');
      setSelectedFiles(initialFiles);
    } else if (initialUrl && appliedUrl.current !== initialUrl) {
      appliedUrl.current = initialUrl;
      setTab('url');
      setUrlInput(initialUrl);
    }

  }, [isOpen]);

  // Focus moves in on open, Tab stays inside, Escape closes, and focus returns to the opener.
  useModalFocus<HTMLDivElement>(isOpen, onClose, modalRef);

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
        setDoneCount(0);

        for (const file of selectedFiles) {
          if (file.size > MAX_UPLOAD_SIZE) {
            results.push({
              filename: file.name,
              status: 'failed',
              reason: `File exceeds 50 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
            });
            setDoneCount(results.length);
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
          setDoneCount(results.length);
        }

        setUploadResults(results);
        if (results.length > 0 && results.every((r) => r.status === 'added')) {
          closeTimer.current = setTimeout(() => {
            closeTimer.current = null;
            handleDismissDialog();
          }, 650);
        }
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
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setError(null);
    setUploadResults(null);
    setSelectedFiles([]);
    setPasteTitle('');
    setPasteText('');
    setUrlInput('');
    setUrlTitle('');
    onCloseRef.current();
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
            <svg className="modal-tab-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><polyline points="14 3 14 8 19 8" /></svg>
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
            <svg className="modal-tab-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" /></svg>
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
            <svg className="modal-tab-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" /></svg>
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
                  <h4 className="file-queue-title">Upload Results</h4>
                  <div className="file-queue" data-testid="upload-results-list">
                    {uploadResults.map((res, rIdx) => {
                      const k = fileKind(res.filename);
                      return (
                        <div key={rIdx} className={`file-row upload-result-item status-${res.status}`} data-testid={`upload-result-${rIdx}`}>
                          <SourceTypeIcon type={k.type} badge={k.badge} />
                          <div className="file-row-main">
                            <span className="file-name upload-result-name">{res.filename}</span>
                            {res.reason && <span className="upload-result-reason" title={res.reason}>{res.reason}</span>}
                          </div>
                          <span className={`upload-status-badge badge-${res.status}`}>
                            {res.status === 'added' ? '✓ Added' : res.status === 'skipped' ? '⊘ Skipped' : '✕ Failed'}
                          </span>
                        </div>
                      );
                    })}
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
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <p className="drop-zone-text">
                      Drop files here, or <span className="drop-zone-link">browse</span>
                    </p>
                    <p className="drop-zone-hint">PDF, TXT, or Markdown · up to 50 MB</p>
                  </div>

                  {selectedFiles.length > 0 && (
                    <div className="selected-files-list">
                      <h4 className="file-queue-title">Selected files ({selectedFiles.length})</h4>
                      <ul className="file-queue">
                        {selectedFiles.map((file, idx) => {
                          const k = fileKind(file.name);
                          return (
                            <li key={`${file.name}-${idx}`} className="file-row selected-file-row">
                              <SourceTypeIcon type={k.type} badge={k.badge} />
                              <span className="file-name" title={file.name}>{file.name}</span>
                              <span className="file-size">{formatFileSize(file.size)}</span>
                              {loading ? (
                                idx < doneCount ? <span className="file-done" aria-hidden="true">✓</span> : <Spinner size={15} className="file-spinner" />
                              ) : (
                                <button type="button" className="file-remove-btn" aria-label="Remove file" onClick={() => setSelectedFiles((f) => f.filter((_, i) => i !== idx))}>&times;</button>
                              )}
                            </li>
                          );
                        })}
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
              <>
                <button
                  type="button"
                  className="btn btn-ghost modal-cancel-btn"
                  onClick={() => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } setUploadResults(null); setSelectedFiles([]); }}
                >
                  Add more
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleDone}
                  disabled={loading}
                  data-testid="upload-results-done-btn"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-ghost modal-cancel-btn"
                  onClick={handleDismissDialog}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn btn-primary ${loading ? 'is-loading' : ''}`}
                  disabled={loading || (tab === 'upload' && selectedFiles.length === 0)}
                  data-testid="submit-add-source-btn"
                >
                  {loading ? (
                    <>
                      <Spinner size={14} />
                      {tab === 'upload' && selectedFiles.length > 1 ? `Adding ${selectedFiles.length} sources...` : 'Adding sources...'}
                    </>
                  ) : tab === 'upload' && selectedFiles.length > 1 ? `Add ${selectedFiles.length} Sources` : 'Add Source'}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
