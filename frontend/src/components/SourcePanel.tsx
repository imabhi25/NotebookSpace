import React from 'react';
import { Citation, PassageItem, Source, normalizeFileName, formatSourceTitle } from '../types';

interface SourcePanelProps {
  selectedCitation: {
    file: string;
    page: number;
    messageId?: string;
    source_id?: string | null;
    source_version?: number;
    excerpt?: string | null;
  } | null;
  citations: Citation[];
  passages: PassageItem[];
  passageLoading: boolean;
  retrieved?: Array<{
    file_name?: string;
    file?: string;
    page_number?: number;
    page?: number;
    text?: string;
    chunk_text?: string;
    score?: number;
    chunk_index?: number;
  }>;
  sources?: Source[];
  onSelectCitation: (cit: Citation) => void;
  onClose: () => void;
  isOpen: boolean;
  supersededMap?: Record<string, { supersededBy: string; topic: string }>;
}

export const SourcePanel: React.FC<SourcePanelProps> = ({
  selectedCitation,
  citations,
  passages,
  passageLoading,
  retrieved = [],
  sources,
  onSelectCitation,
  onClose,
  isOpen,
  supersededMap,
}) => {
  if (!isOpen && !selectedCitation) {
    return null;
  }

  const supersededInfo = supersededMap && selectedCitation
    ? supersededMap[normalizeFileName(selectedCitation.file)]
    : undefined;

  // Find index of current citation in the answer's citations list
  const currentIndex = selectedCitation
    ? citations.findIndex(
        (c) =>
          normalizeFileName(c.file) === normalizeFileName(selectedCitation.file) &&
          c.page === selectedCitation.page
      )
    : -1;

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < citations.length - 1;

  const handlePrevious = () => {
    if (hasPrevious) {
      onSelectCitation(citations[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      onSelectCitation(citations[currentIndex + 1]);
    }
  };

  // Find matching chunks in the retrieved array for this file and page
  const retrievedMatchingChunks = selectedCitation
    ? retrieved.filter(
        (r) => {
          const rFile = r.file || r.file_name;
          const rPage = r.page !== undefined ? r.page : r.page_number;
          const rText = r.text || r.chunk_text;
          return (
            rFile &&
            normalizeFileName(rFile) === normalizeFileName(selectedCitation.file) &&
            rPage === selectedCitation.page &&
            typeof rText === 'string' &&
            rText.trim().length > 0
          );
        }
      )
    : [];

  const hasRetrievedChunkText = retrievedMatchingChunks.length > 0;

  // Determine whether a given passage chunk text matches any retrieved chunk text
  const isChunkHighlighted = (chunkText: string, chunkIndex?: number): boolean => {
    if (!hasRetrievedChunkText) return false;
    return retrievedMatchingChunks.some((r) => {
      const rText = (r.text || r.chunk_text || '').trim();
      if (!rText) return false;
      const cText = chunkText.trim();
      return (
        cText.includes(rText) ||
        rText.includes(cText) ||
        (typeof chunkIndex === 'number' &&
          typeof (r as any).chunk_index === 'number' &&
          chunkIndex === (r as any).chunk_index)
      );
    });
  };

  // Detect historical citations for removed or replaced sources
  const matchedSource = selectedCitation?.source_id && sources
    ? sources.find((s) => s.id === selectedCitation.source_id)
    : undefined;
  const isSourceDeleted = Boolean(selectedCitation?.source_id && sources && !matchedSource);
  const isSourceReplaced = Boolean(
    selectedCitation?.source_id &&
    matchedSource &&
    typeof selectedCitation.source_version === 'number' &&
    matchedSource.version !== selectedCitation.source_version
  );
  const isHistoricalOnly = isSourceDeleted || isSourceReplaced;

  return (
    <aside
      className={`source-panel ${isOpen ? 'source-panel-open' : ''}`}
      data-testid="passage-pane"
      aria-label="Cited Document Passage"
    >
      <div className="source-panel-header">
        <div className="source-panel-title-area">
          <div className="source-panel-heading-row">
            <h2 className="source-panel-heading">Cited Document Passage</h2>
            {supersededInfo && (
              <span
                className="panel-superseded-tag"
                data-testid="panel-superseded-badge"
                title={`Superseded by ${formatSourceTitle(supersededInfo.supersededBy, sources)}`}
              >
                Superseded
              </span>
            )}
          </div>
          {selectedCitation && (
            <span className="source-panel-subheading">
              {selectedCitation.file} &bull; Page {selectedCitation.page}
            </span>
          )}
        </div>

        <div className="source-panel-actions">
          {/* Previous / Next buttons to step through citations */}
          <div className="citation-step-controls">
            <button
              type="button"
              className="btn-step"
              onClick={handlePrevious}
              disabled={!hasPrevious}
              aria-label="Previous citation"
              title="Previous citation"
            >
              Prev
            </button>
            {citations.length > 0 && currentIndex !== -1 && (
              <span className="citation-step-counter" aria-label={`Citation ${currentIndex + 1} of ${citations.length}`}>
                {currentIndex + 1}/{citations.length}
              </span>
            )}
            <button
              type="button"
              className="btn-step"
              onClick={handleNext}
              disabled={!hasNext}
              aria-label="Next citation"
              title="Next citation"
            >
              Next
            </button>
          </div>

          <button
            type="button"
            className="source-panel-close-btn"
            onClick={onClose}
            aria-label="Close source panel"
            title="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="source-panel-body">
        {isHistoricalOnly && (
          <div className="historical-citation-alert" role="alert" data-testid="historical-citation-alert">
            <div className="alert-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{isSourceDeleted ? 'Original Source Removed' : `Source Replaced (v${selectedCitation?.source_version ?? 1})`}</span>
            </div>
            <p className="historical-notice-desc">
              {isSourceDeleted
                ? `The source "${selectedCitation?.file}" has been deleted from this subject. Historical citation evidence is preserved below and is not attached to any active document.`
                : `The source "${selectedCitation?.file}" was replaced with a newer version (currently v${matchedSource?.version}). Displaying verified historical excerpt captured at answer time:`}
            </p>
          </div>
        )}

        {passageLoading ? (
          <div className="passage-loading-state">
            <div className="step-spinner" aria-hidden="true" />
            <p className="empty-state">Loading passage text...</p>
          </div>
        ) : selectedCitation ? (
          <div className="passage-content" data-testid="passage-content">
            <div className="passage-content-banner">
              Showing content from <strong>{selectedCitation.file}</strong> (Page {selectedCitation.page}):
            </div>

            {passages.length > 0 ? (
              <div className="passage-chunks-list">
                {passages.map((p, idx) => {
                  const text = p.text || p.chunk_text || '';
                  const highlighted = hasRetrievedChunkText && isChunkHighlighted(text, p.chunk_index);

                  return (
                    <div
                      key={idx}
                      className={`passage-chunk ${highlighted ? 'passage-chunk-highlighted' : ''}`}
                    >
                      {highlighted && (
                        <div className="chunk-highlight-badge">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                          <span>Cited Passage Match</span>
                        </div>
                      )}
                      <p className="passage-chunk-text">{text}</p>
                    </div>
                  );
                })}
              </div>
            ) : hasRetrievedChunkText ? (
              /* Fallback if /passages returned empty but retrieved carries the chunk text */
              <div className="passage-chunks-list">
                {retrievedMatchingChunks.map((r, idx) => (
                  <div key={idx} className="passage-chunk passage-chunk-highlighted">
                    <div className="chunk-highlight-badge">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                      <span>Cited Passage Match</span>
                    </div>
                    <p className="passage-chunk-text">{r.text || r.chunk_text}</p>
                  </div>
                ))}
              </div>
            ) : selectedCitation.excerpt ? (
              /* Verified historical excerpt captured at answer time */
              <div className="passage-chunks-list">
                <div className="passage-chunk passage-chunk-highlighted">
                  <div className="chunk-highlight-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <span>Historical Verified Excerpt</span>
                  </div>
                  <p className="passage-chunk-text">{selectedCitation.excerpt}</p>
                </div>
              </div>
            ) : (
              <p className="empty-state">No text chunks found for this page.</p>
            )}
          </div>
        ) : (
          <p className="empty-state">
            Click a citation chip or conflict card to inspect the cited page text here.
          </p>
        )}
      </div>
    </aside>
  );
};
