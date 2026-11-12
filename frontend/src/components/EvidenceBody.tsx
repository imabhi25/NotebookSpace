import React, { forwardRef } from 'react';
import { ActiveCitation, PassageItem, RetrievedPassage } from '../types';

/**
 * PDF extraction often collapses numbered lists and section headings into one line.
 * Break them back onto their own lines for reading; the stored text is untouched.
 */
export function formatPassageText(text: string): string {
  let out = text.replace(/\r\n?/g, '\n');
  // Stray page numbers: a lone number on the first or last line of the page.
  out = out.replace(/^\s*\d{1,3}\s*\n+/, '').replace(/\n+\s*\d{1,3}\s*$/, '');
  // A leading page number glued to the title ("1 Practice Problems").
  out = out.replace(/^\s*\d{1,3}\s+(?=[A-Z][a-z])/, '');
  // Inline bullets each start a new line.
  out = out.replace(/\s*[•●▪◦]\s*/g, '\n• ');
  if (/(?:^|\s)1\.\s/.test(out) && /\s2\.\s/.test(out)) {
    out = out.replace(/\s+(?=\d{1,2}\.\s+\S)/g, '\n');
  }
  out = out.replace(/\s+(?=(?:Question|Section|Part|Problem|Exercise|Task)\s+\d+\s*[:.)])/g, '\n\n');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/** Renders formatted passage text as a heading, paragraphs and list items. */
function PassageText({ text }: { text: string }) {
  const lines = formatPassageText(text).split('\n');
  const blocks: React.ReactNode[] = [];
  let first = true;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const bullet = /^•\s*/.test(line);
    const numbered = /^\d{1,2}\.\s+/.test(line);
    const heading = first && !bullet && !numbered && line.length <= 80 && !/[.!?]$/.test(line);
    blocks.push(
      <p key={i} className={`passage-line${bullet ? ' passage-bullet' : ''}${numbered ? ' passage-numbered' : ''}${heading ? ' passage-heading' : ''}`}>{bullet ? line.replace(/^•\s*/, '') : line}</p>
    );
    first = false;
  });
  return <div className="passage-chunk-text">{blocks}</div>;
}

export interface EvidenceBodyProps {
  citation: ActiveCitation;
  /** Passages stored for the cited page, as returned by the passages endpoint. */
  passages: PassageItem[];
  loading: boolean;
  /** Chunks the retriever returned for this answer that sit on the cited page. */
  retrievedChunks: RetrievedPassage[];
  isHighlighted: (text: string, chunkIndex?: number) => boolean;
  sourceRemoved: boolean;
  sourceReplaced: boolean;
  currentVersion?: number;
}

/**
 * The cited evidence itself: file, page, and the real passage text. Nothing here is generated.
 * Citations name a page, not a sentence, so the only emphasis is on whole passages that the
 * retriever returned for this answer; no sentence is ever marked.
 */
export const EvidenceBody: React.FC<EvidenceBodyProps> = ({
  citation,
  passages,
  loading,
  retrievedChunks,
  isHighlighted,
  sourceRemoved,
  sourceReplaced,
  currentVersion,
}) => {
  const hasRetrievedText = retrievedChunks.length > 0;
  const historical = sourceRemoved || sourceReplaced;
  return (
    <div className="evidence-body">
      {historical && (
        <div className="historical-citation-alert" role="alert" data-testid="historical-citation-alert">
          <div className="alert-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{sourceRemoved ? 'Original Source Removed' : `Source Replaced (v${citation.source_version ?? 1})`}</span>
          </div>
          <p className="historical-notice-desc">
            {sourceRemoved
              ? `The source "${citation.file}" has been deleted from this notebook. Historical citation evidence is preserved below.`
              : `The source "${citation.file}" was replaced with a newer version (currently v${currentVersion}). Displaying verified historical excerpt captured at answer time:`}
          </p>
        </div>
      )}

      {loading ? (
        <div className="passage-loading-state" role="status">
          <p className="empty-state">Loading passage text...</p>
          <div className="skeleton-loader" aria-hidden="true">
            <span className="skeleton-line line-long" />
            <span className="skeleton-line line-long" />
            <span className="skeleton-line line-short" />
          </div>
        </div>
      ) : (
        <div className="passage-content" data-testid="passage-content" key={`${citation.file}:${citation.page}`}>
          {passages.length > 0 ? (
            <div className="passage-chunks-list">
              {passages.map((p, idx) => {
                const text = p.text || p.chunk_text || '';
                const highlighted = hasRetrievedText && isHighlighted(text, p.chunk_index);
                return (
                  <div key={idx} className={`passage-chunk ${highlighted ? 'passage-chunk-highlighted' : ''}`}>
                    <PassageText text={text} />
                  </div>
                );
              })}
            </div>
          ) : hasRetrievedText ? (
            <div className="passage-chunks-list">
              {retrievedChunks.map((r, idx) => (
                <div key={idx} className="passage-chunk passage-chunk-highlighted">
                  <PassageText text={r.text || r.chunk_text || ''} />
                </div>
              ))}
            </div>
          ) : citation.excerpt ? (
            <div className="passage-chunks-list">
              <div className="passage-chunk passage-chunk-highlighted">
                <PassageText text={citation.excerpt} />
              </div>
            </div>
          ) : (
            <p className="empty-state">No text chunks found for this page.</p>
          )}
        </div>
      )}
    </div>
  );
};

interface InlineEvidenceProps extends EvidenceBodyProps {
  /** Opens the source reader: "Open in reader", or "Open current version in reader (vN)". Absent for a removed source. */
  readerAction?: { label: string; onOpen: () => void } | null;
  /** Position of this citation among the answer's citations, when it is one of them. */
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
  /** Extra action pinned beside the reader button (e.g. Save to notes). */
  footerExtra?: React.ReactNode;
  /** Small icon action(s) shown in the header beside the citation stepper. */
  headerExtra?: React.ReactNode;
  /** Readable title for the cited source (e.g. an auto-cleaned name); defaults to the file name. */
  displayTitle?: string;
}

/** Evidence shown directly beneath the answer it supports. Escape or Close collapses it. */
export const InlineEvidence = forwardRef<HTMLElement, InlineEvidenceProps>(function InlineEvidence(
  { index, total, onPrevious, onNext, onClose, readerAction, footerExtra, headerExtra, displayTitle, ...body },
  ref
) {
  return (
    <section
      className="inline-evidence"
      id={`evidence-${body.citation.messageId ?? 'answer'}`}
      aria-label={`Evidence from ${body.citation.file}, page ${body.citation.page}`}
      data-testid="inline-evidence"
      ref={ref}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="inline-evidence-header">
        <div className="inline-evidence-header-left">
          <h3 className="inline-evidence-title"><span className="inline-evidence-file" title={body.citation.file}>{displayTitle || body.citation.file}</span></h3>
          <span className="inline-evidence-count evidence-page-pill">Page {body.citation.page}</span>
        </div>
        <div className="inline-evidence-actions">
          {total > 1 && index >= 0 && (
            <div className="citation-step-controls">
              <button type="button" className="btn-step" onClick={onPrevious} disabled={index <= 0}
                aria-label="Previous citation" title="Previous citation"><span aria-hidden="true">‹</span></button>
              <span className="citation-step-counter" aria-label={`Citation ${index + 1} of ${total}`}>{index + 1}/{total}</span>
              <button type="button" className="btn-step" onClick={onNext} disabled={index >= total - 1}
                aria-label="Next citation" title="Next citation"><span aria-hidden="true">›</span></button>
            </div>
          )}
          {readerAction && (
            <button type="button" className="evidence-reader-btn evidence-reader-link-btn" onClick={readerAction.onOpen} data-testid="open-reader-btn">
              {readerAction.label} <span aria-hidden="true">↗</span>
            </button>
          )}
          {headerExtra}
        </div>
      </div>
      <EvidenceBody {...body} />
      {footerExtra && (
        <div className="evidence-footer">
          {footerExtra}
        </div>
      )}
    </section>
  );
});
