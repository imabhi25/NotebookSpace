import React from 'react';
import { DocumentItem } from '../types';

interface SidebarProps {
  documents: DocumentItem[];
  isDemoMode: boolean;
  onNewChat: () => void;
  onUpload: (e: React.FormEvent) => void;
  uploadFile: File | null;
  setUploadFile: (file: File | null) => void;
  uploading: boolean;
  uploadMsg: string | null;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  documents,
  isDemoMode,
  onNewChat,
  onUpload,
  uploadFile,
  setUploadFile,
  uploading,
  uploadMsg,
  isOpenMobile,
  onCloseMobile,
}) => {
  return (
    <aside className={`sidebar ${isOpenMobile ? 'sidebar-open' : ''}`} aria-label="Sidebar">
      <div className="sidebar-header">
        <div className="app-brand">
          <span className="brand-mark-wrapper" aria-hidden="true">
            <svg
              className="brand-mark-svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </span>
          <div className="brand-text">
            <h1 className="brand-title">Course-Document Assistant</h1>
            <span className="brand-subtitle">Verified Citations and Conflicts</span>
          </div>
        </div>
        <button
          type="button"
          className="mobile-close-btn"
          onClick={onCloseMobile}
          aria-label="Close sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="sidebar-action">
        <button
          type="button"
          className="btn btn-new-chat"
          onClick={onNewChat}
          aria-label="New chat"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>New chat</span>
        </button>
      </div>

      {isDemoMode && (
        <div className="demo-sidebar-note" data-testid="demo-banner">
          <svg className="demo-note-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <p className="demo-note-text">
            Public demo: sample documents, questions are rate-limited.
          </p>
        </div>
      )}

      {/* Upload PDF Section */}
      <div className="sidebar-section upload-section">
        <h2 className="sidebar-section-title">Upload Documents</h2>
        {isDemoMode ? (
          <div>
            <label htmlFor="pdf-upload" style={{ display: 'none' }}>
              Upload PDF Document
            </label>
            <input
              id="pdf-upload"
              type="file"
              accept=".pdf"
              disabled
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-full disabled-upload-btn"
              disabled
              aria-label="Upload disabled in the public demo"
            >
              Upload disabled in the public demo
            </button>
            <p className="sidebar-demo-upload-note">
              Uploads are disabled in the public demo.
            </p>
          </div>
        ) : (
          <form onSubmit={onUpload} className="upload-form">
            <label htmlFor="pdf-upload" className="file-input-label">
              Upload PDF Document:
            </label>
            <input
              id="pdf-upload"
              type="file"
              accept=".pdf"
              disabled={uploading}
              onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
              className="file-input"
            />
            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={!uploadFile || uploading}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
            <span className="file-limit-note">Max file size: 10 MB limit</span>
          </form>
        )}

        {uploadMsg && (
          <p
            className={`upload-msg ${uploadMsg.startsWith('Error') ? 'upload-error' : 'upload-success'}`}
            role="status"
          >
            {uploadMsg}
          </p>
        )}
      </div>

      {/* Documents List */}
      <div className="sidebar-section documents-section">
        <div className="sidebar-section-header">
          <h2 className="sidebar-section-title">Documents</h2>
          <span className="doc-count-badge">{documents.length}</span>
        </div>
        <div className="documents-list">
          {documents.length === 0 ? (
            <p className="empty-docs-msg">No documents stored yet.</p>
          ) : (
            <ul className="docs-ul">
              {documents.map((doc, idx) => {
                const hasPageCount =
                  typeof doc.page_count === 'number' && doc.page_count > 0;
                return (
                  <li key={idx} className="doc-item-row" title={doc.file_name}>
                    <div className="doc-item-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <div className="doc-item-text">
                      <span className="doc-name">{doc.file_name}</span>
                      <span className="doc-meta">
                        {hasPageCount
                          ? `${doc.page_count} ${doc.page_count === 1 ? 'page' : 'pages'} \u00B7 Ready`
                          : 'Ready'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
};
