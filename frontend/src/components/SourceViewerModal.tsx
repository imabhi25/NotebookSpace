import React from 'react';
import { Source } from '../types';

interface SourceViewerModalProps {
  source: Source | null;
  onClose: () => void;
}

export const SourceViewerModal: React.FC<SourceViewerModalProps> = ({ source, onClose }) => {
  if (!source) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content modal-content-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="source-viewer-header-info">
            <h2>{source.title}</h2>
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
          ) : (
            <div className="dashboard-loading-state" style={{ padding: '2rem 1rem' }}>
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
