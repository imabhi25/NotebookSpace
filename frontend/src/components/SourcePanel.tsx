import React, { useEffect, useRef, useState } from 'react';
import { Citation, PassageItem, Source, normalizeFileName } from '../types';

/** Viewport width at which the evidence panel docks beside the conversation. */
export const EVIDENCE_DOCK_QUERY = '(min-width: 1100px)';

/** True when there is room to dock. Without matchMedia (tests/SSR) we assume docked. */
export function useCanDockEvidence(): boolean {
  const get = () =>
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? true
      : window.matchMedia(EVIDENCE_DOCK_QUERY).matches;
  const [canDock, setCanDock] = useState<boolean>(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(EVIDENCE_DOCK_QUERY);
    const onChange = () => setCanDock(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return canDock;
}

interface RetrievedLike {
  file_name?: string;
  file?: string;
  page_number?: number;
  page?: number;
  text?: string;
  chunk_text?: string;
  score?: number;
  chunk_index?: number;
}

interface SourcePanelProps {
  selectedCitation: {
    file: string;
    page: number;
    messageId?: string;
    source_id?: string | null;
    source_version?: number;
    title?: string | null;
    excerpt?: string | null;
  } | null;
  citations: Citation[];
  passages: PassageItem[];
  passageLoading: boolean;
  retrieved?: RetrievedLike[];
  sources?: Source[];
  onSelectCitation: (cit: Citation) => void;
  onClose: () => void;
  isOpen: boolean;
  /** Increment to move focus to the panel heading (used when opened from the keyboard). */
  focusRequest?: number;
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

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
  focusRequest = 0,
}) => {
  const canDock = useCanDockEvidence();
  const panelRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const visible = isOpen || Boolean(selectedCitation);
  const asDrawer = !canDock;

  // Drawer: move focus into the dialog when it opens.
  useEffect(() => {
    if (visible && asDrawer) closeBtnRef.current?.focus();
  }, [visible, asDrawer]);

  // Keyboard-opened (docked): move focus to the heading so the evidence is reachable immediately.
  useEffect(() => {
    if (focusRequest > 0 && !asDrawer) headingRef.current?.focus();
  }, [focusRequest, asDrawer]);

  // Drawer: Escape closes, Tab stays inside.
  useEffect(() => {
    if (!visible || !asDrawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!panelRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, asDrawer, onClose]);

  // Bring the first retrieved passage into view after content loads.
  const selKey = selectedCitation ? `${selectedCitation.file}:${selectedCitation.page}` : '';
  useEffect(() => {
    const el = bodyRef.current?.querySelector('.passage-chunk-highlighted') as HTMLElement | null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [selKey, passages, passageLoading]);

  if (!visible) return null;

  const currentIndex = selectedCitation
    ? citations.findIndex(
        (c) =>
          normalizeFileName(c.file) === normalizeFileName(selectedCitation.file) &&
          c.page === selectedCitation.page
      )
    : -1;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < citations.length - 1;

  // Chunks that were actually retrieved for this answer, for the cited file + page.
  const retrievedMatchingChunks = selectedCitation
    ? retrieved.filter((r) => {
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
      })
    : [];
  const hasRetrievedChunkText = retrievedMatchingChunks.length > 0;

  const isRetrievedChunk = (chunkText: string, chunkIndex?: number): boolean => {
    if (!hasRetrievedChunkText) return false;
    const c = squash(chunkText);
    return retrievedMatchingChunks.some((r) => {
      const t = squash(r.text || r.chunk_text || '');
      if (!t || !c) return false;
      return (
        c === t ||
        c.includes(t) ||
        t.includes(c) ||
        (typeof chunkIndex === 'number' && typeof r.chunk_index === 'number' && chunkIndex === r.chunk_index)
      );
    });
  };

  const matchedSource =
    selectedCitation?.source_id && sources ? sources.find((s) => s.id === selectedCitation.source_id) : undefined;
  const isSourceDeleted = Boolean(selectedCitation?.source_id && sources && !matchedSource);
  const isSourceReplaced = Boolean(
    selectedCitation?.source_id &&
      matchedSource &&
      typeof selectedCitation.source_version === 'number' &&
      matchedSource.version !== selectedCitation.source_version
  );
  const isHistoricalOnly = isSourceDeleted || isSourceReplaced;

  const displayName =
    (selectedCitation?.title && selectedCitation.title.trim()) || selectedCitation?.file || '';
  const showFileSeparately = Boolean(selectedCitation && displayName !== selectedCitation.file);

  const headingId = 'evidence-panel-heading';

  return (
    <>
      {asDrawer && <div className="evidence-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside
        ref={panelRef}
        id="evidence-panel"
        className={`source-panel ${asDrawer ? 'evidence-drawer' : 'evidence-docked'} ${isOpen ? 'source-panel-open' : ''}`}
        data-testid="passage-pane"
        {...(asDrawer
          ? { role: 'dialog', 'aria-modal': true, 'aria-labelledby': headingId }
          : { 'aria-labelledby': headingId })}
        onKeyDown={(e) => {
          if (!asDrawer && e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="source-panel-header">
          <div className="source-panel-title-area">
            <span className="evidence-eyebrow">Evidence</span>
            <h2 className="source-panel-heading" id={headingId} ref={headingRef} tabIndex={-1}>
              {selectedCitation ? displayName : 'Cited passage'}
            </h2>
            {selectedCitation && (
              <span className="source-panel-subheading">
                {showFileSeparately ? `${selectedCitation.file} • ` : ''}
                {showFileSeparately ? `Page ${selectedCitation.page}` : `${selectedCitation.file} • Page ${selectedCitation.page}`}
              </span>
            )}
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="source-panel-close-btn"
            onClick={onClose}
            aria-label="Close source panel"
            title="Close (Esc)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {citations.length > 0 && (
          <div className="citation-step-controls" role="group" aria-label="Step through citations">
            <button
              type="button"
              className="btn-step"
              onClick={() => hasPrevious && onSelectCitation(citations[currentIndex - 1])}
              disabled={!hasPrevious}
              aria-label="Previous citation"
              title="Previous citation"
            >
              Prev
            </button>
            {currentIndex !== -1 && (
              <span
                className="citation-step-counter"
                role="status"
                aria-label={`Citation ${currentIndex + 1} of ${citations.length}`}
              >
                {currentIndex + 1}/{citations.length}
              </span>
            )}
            <button
              type="button"
              className="btn-step"
              onClick={() => hasNext && onSelectCitation(citations[currentIndex + 1])}
              disabled={!hasNext}
              aria-label="Next citation"
              title="Next citation"
            >
              Next
            </button>
          </div>
        )}

        <div className="source-panel-body" ref={bodyRef}>
          {isHistoricalOnly && (
            <div className="historical-citation-alert" role="alert" data-testid="historical-citation-alert">
              <div className="alert-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
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
            <div className="passage-loading-state" role="status">
              <div className="step-spinner" aria-hidden="true" />
              <p className="empty-state">Loading passage text...</p>
            </div>
          ) : selectedCitation ? (
            <div className="passage-content" data-testid="passage-content">
              <p className="passage-content-banner">
                Page {selectedCitation.page} of <strong>{selectedCitation.file}</strong>
              </p>

              {passages.length > 0 ? (
                <ol className="passage-chunks-list">
                  {passages.map((p, idx) => {
                    const text = p.text || p.chunk_text || '';
                    const retrievedHere = isRetrievedChunk(text, p.chunk_index);
                    return (
                      <li
                        key={idx}
                        className={`passage-chunk ${retrievedHere ? 'passage-chunk-highlighted' : ''}`}
                      >
                        {retrievedHere && (
                          <div className="chunk-highlight-badge">
                            <span>Retrieved for this answer</span>
                          </div>
                        )}
                        <p className="passage-chunk-text">{text}</p>
                      </li>
                    );
                  })}
                </ol>
              ) : hasRetrievedChunkText ? (
                <ol className="passage-chunks-list">
                  {retrievedMatchingChunks.map((r, idx) => (
                    <li key={idx} className="passage-chunk passage-chunk-highlighted">
                      <div className="chunk-highlight-badge">
                        <span>Retrieved for this answer</span>
                      </div>
                      <p className="passage-chunk-text">{r.text || r.chunk_text}</p>
                    </li>
                  ))}
                </ol>
              ) : selectedCitation.excerpt ? (
                <ol className="passage-chunks-list">
                  <li className="passage-chunk passage-chunk-highlighted">
                    <div className="chunk-highlight-badge">
                      <span>Historical Verified Excerpt</span>
                    </div>
                    <p className="passage-chunk-text">{selectedCitation.excerpt}</p>
                  </li>
                </ol>
              ) : (
                <p className="empty-state">No text chunks found for this page.</p>
              )}

              <p className="evidence-note">
                Citations point to a page, not a sentence, so no single sentence is marked.
                {hasRetrievedChunkText ? ' Highlighted passages are the ones retrieved for this answer.' : ''}
              </p>
            </div>
          ) : (
            <p className="empty-state">
              Select a citation in the conversation to inspect the source passage here.
            </p>
          )}

          {retrieved.length > 0 && (
            <details className="retrieval-details">
              <summary>
                All retrieved passages ({retrieved.length})
              </summary>
              <ul className="retrieval-list">
                {retrieved.map((r, i) => (
                  <li key={i}>
                    <span className="retrieval-file">
                      {r.file || r.file_name || 'Document'} &bull; p.{r.page ?? r.page_number ?? '?'}
                    </span>
                    {typeof r.score === 'number' && (
                      <span className="retrieval-score">score {r.score.toFixed(2)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </aside>
    </>
  );
};
