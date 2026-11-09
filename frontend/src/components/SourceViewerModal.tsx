import React from 'react';
import { Source } from '../types';
import { useModalFocus } from '../useModalFocus';

interface SourceViewerModalProps {
  source: Source | null;
  onClose: () => void;
  /** Whether the full text is still being fetched, failed, or arrived. Defaults to arrived. */
  status?: 'loading' | 'error' | 'ready';
  onRetry?: () => void;
}

export const SourceViewerModal: React.FC<SourceViewerModalProps> = ({ source, onClose, status = 'ready', onRetry }) => {
  const modalRef = useModalFocus<HTMLDivElement>(Boolean(source), onClose);

  if (!source) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="source-viewer-title"
        className="modal-content modal-content-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="source-viewer-header-info">
            <h2 id="source-viewer-title">{source.title}</h2>
            <div className="source-viewer-meta-row">
              <span className="source-type-pill">{source.source_type.toUpperCase()}</span>
              <span>{source.page_count} {source.page_count === 1 ? 'page' : 'pages'}</span>
              <span>&bull;</span>
              <span>{source.word_count} words</span>
              <span>&bull;</span>
              <span>Version {source.version}</span>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="source-viewer-body">
          {source.raw_content ? (
            <pre className="source-raw-content">{source.raw_content}</pre>
          ) : source.passages && source.passages.length > 0 ? (
            <div className="source-passages-list">
              {source.passages.map((p, idx) => (
                <div key={idx} className="source-passage-card">
                  <div className="source-passage-header">
                    Page {p.page_number} &bull; Chunk #{p.chunk_index}
                  </div>
                  <p className="source-passage-text">{p.text}</p>
                </div>
              ))}
            </div>
          ) : status === 'error' ? (
            <div className="source-loading-state" role="alert">
              <p>The source text could not be loaded.</p>
              {onRetry && <button type="button" className="btn btn-secondary" onClick={onRetry}>Retry</button>}
            </div>
          ) : status === 'ready' ? (
            <p className="source-loading-state" role="status">No text was stored for this source.</p>
          ) : (
            <div className="dashboard-loading-state source-loading-state">
              <div className="step-spinner" />
              <p>Loading source content...</p>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
