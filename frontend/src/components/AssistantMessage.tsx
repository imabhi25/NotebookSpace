import React, { useMemo } from 'react';
import {
  AskResponse,
  Citation,
  normalizeFileName,
  formatConventionTopic,
  formatSourceTitle,
  Source,
} from '../types';

export const getPlainAbstainReason = (reason?: string | null): string => {
  switch (reason) {
    case 'not_found':
      return 'The requested information could not be found in the course documents.';
    case 'low_retrieval_score':
      return 'No sufficiently relevant course passages were found for this question.';
    case 'invalid_citation':
      return 'The generated answer could not be verified against the cited course documents.';
    case 'bad_output':
      return 'Unable to produce a valid response format from the course documents.';
    default:
      return reason ? `The assistant abstained (${reason}).` : 'The assistant abstained from answering.';
  }
};

/**
 * Render answer text with supported inline citation markers ([filename p.N])
 * transformed into accessible, interactive citation buttons. Supports filenames
 * with spaces and Unicode characters. Unmatched markers are preserved as plain text.
 * No raw HTML injection is used.
 */
export function renderFormattedAnswer(
  text: string,
  citations: Citation[],
  isThisMessageSelected: boolean,
  selectedCitation: { file: string; page: number; messageId?: string } | null | undefined,
  onSelect: (cit: Citation) => void
): React.ReactNode {
  if (!text) return null;

  const elements: React.ReactNode[] = [];
  const regex = /\[\s*([^\[\]\r\n]+?\.pdf)\s*,?\s*(?:p\.|page\.?|p)\s*(\d+)\s*\]/giu;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = regex.lastIndex;
    const rawMatchedText = match[0];
    const file = match[1].trim();
    const page = parseInt(match[2], 10);

    // Push preceding text segment
    if (matchStart > lastIndex) {
      elements.push(text.slice(lastIndex, matchStart));
    }

    // Resolve marker against response's validated citation metadata
    const matchedCitation = citations.find(
      (c) => normalizeFileName(c.file) === normalizeFileName(file) && c.page === page
    );

    if (matchedCitation) {
      const isActive =
        isThisMessageSelected &&
        normalizeFileName(selectedCitation?.file) === normalizeFileName(matchedCitation.file) &&
        selectedCitation?.page === matchedCitation.page;

      elements.push(
        <button
          key={`inline-cit-${matchStart}`}
          type="button"
          className={`inline-citation-btn ${isActive ? 'active' : ''}`}
          onClick={() => onSelect(matchedCitation)}
          data-testid="inline-citation"
          aria-label={`Citation: ${matchedCitation.file} page ${matchedCitation.page}`}
        >
          {rawMatchedText}
        </button>
      );
    } else {
      // Preserve unmatched marker as plain text
      elements.push(rawMatchedText);
    }

    lastIndex = matchEnd;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements;
}

interface AssistantMessageProps {
  loading?: boolean;
  error?: string | null;
  result?: AskResponse | null;
  searchedQuery?: string;
  messageId?: string;
  selectedCitation?: { file: string; page: number; messageId?: string } | null;
  onSelectCitation: (cit: Citation, messageId?: string) => void;
  sources?: Source[];
}

export const AssistantMessage: React.FC<AssistantMessageProps> = ({
  loading,
  error,
  result,
  searchedQuery,
  messageId = '',
  selectedCitation,
  onSelectCitation,
  sources,
}) => {
  // 1. LOADING STATE
  if (loading) {
    return (
      <div className="assistant-message message-loading" role="status" aria-live="polite">
        <div className="loading-steps-container">
          <div className="loading-step active">
            <span className="step-spinner" aria-hidden="true" />
            <span className="step-label">Searching documents</span>
          </div>
          <div className="loading-step">
            <span className="step-dot" aria-hidden="true" />
            <span className="step-label">Retrieving passages</span>
          </div>
          <div className="loading-step">
            <span className="step-dot" aria-hidden="true" />
            <span className="step-label">Writing the answer and checking citations</span>
          </div>
        </div>
        <div className="skeleton-loader" aria-hidden="true">
          <div className="skeleton-line line-long" />
          <div className="skeleton-line line-med" />
          <div className="skeleton-line line-short" />
        </div>
      </div>
    );
  }

  // 2. ERROR STATE
  if (error) {
    return (
      <div className="assistant-message message-error">
        <div className="status-box status-error" role="alert">
          <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }

  if (!result) {
    return null;
  }

  // Track if citation selection belongs specifically to this assistant message turn
  const isThisMessageSelected = Boolean(
    selectedCitation && (!selectedCitation.messageId || selectedCitation.messageId === messageId)
  );

  // Collect all unique validated citations for this message, including conflict claims and conventions
  const allValidCitations = useMemo(() => {
    const list: Citation[] = [];
    const seen = new Set<string>();

    for (const c of result.citations || []) {
      const key = `${normalizeFileName(c.file)}:${c.page}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push({ file: c.file, page: c.page });
      }
    }

    for (const conf of result.conflicts || []) {
      for (const claim of conf.claims || []) {
        const key = `${normalizeFileName(claim.file)}:${claim.page}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({ file: claim.file, page: claim.page });
        }
      }
    }

    for (const conv of result.conventions || []) {
      const key = `${normalizeFileName(conv.file)}:${conv.page}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push({ file: conv.file, page: conv.page });
      }
    }

    for (const mm of result.convention_mismatches || []) {
      for (const c of mm.conventions || []) {
        const key = `${normalizeFileName(c.file)}:${c.page}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({ file: c.file, page: c.page });
        }
      }
    }

    return list;
  }, [result]);

  const handleSelect = (cit: Citation) => {
    onSelectCitation(cit, messageId);
  };

  // Check retrieved items with valid numerical scores for abstain state
  const retrievedWithScores = (result.retrieved || []).filter(
    (item) => typeof item.score === 'number' && !isNaN(item.score)
  );

  // Status strip fields check: omit any item the API did not return
  const hasLatency = typeof result.latency === 'number' && !isNaN(result.latency);
  const hasModel = typeof result.model === 'string' && result.model.trim().length > 0;
  const hasRetrievedCount = Array.isArray(result.retrieved);
  const showStatusStrip = hasLatency || hasModel || hasRetrievedCount;

  // Filter resolved conflicts for the summary line above the answer
  const resolvedConflicts = (result.conflicts || []).filter((c) => Boolean(c.resolution));

  return (
    <div className="assistant-message">
      {/* 3. NOT FOUND (ABSTAINED) STATE */}
      {result.abstained ? (
        <div className={`card-not-found ${result.abstain_reason === 'generation_failed' ? 'card-generation-failed' : ''}`} data-testid="abstained-view">
          <div className={`not-found-badge ${result.abstain_reason === 'generation_failed' ? 'badge-failed' : ''}`}>
            {result.abstain_reason === 'generation_failed' ? 'GENERATION FAILED' : 'NOT FOUND IN YOUR DOCUMENTS'}
          </div>
          <div className="abstain-reason">{getPlainAbstainReason(result.abstain_reason)}</div>
          {searchedQuery && (
            <div className="abstain-query">Searched for: &ldquo;{searchedQuery}&rdquo;</div>
          )}

          {retrievedWithScores.length > 0 && (
            <div className="related-passages-section">
              <h4 className="related-passages-title">Related passages checked</h4>
              <ul className="related-passages-list">
                {retrievedWithScores.map((item, idx) => (
                  <li key={idx} className="related-passage-item">
                    <span className="related-file">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="inline-action-icon">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      {item.file || item.file_name || 'Document'} (Page {item.page || item.page_number || '?'})
                    </span>
                    <span className="related-score">
                      Score: {item.score?.toFixed(3)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}

      {/* 4. CONFLICT STATE */}
      {!result.abstained && result.conflict_detected && result.conflicts && result.conflicts.length > 0 && (
        <div className="conflict-container" data-testid="conflict-view">
          <div className="conflict-header">
            <svg
              className="conflict-icon-svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <h2 className="conflict-heading">These documents disagree</h2>
          </div>
          {result.conflicts.map((conf, cIdx) => (
            <div key={cIdx} className="conflict-topic-group">
              <div className="conflict-topic">Conflict Topic: {conf.topic}</div>
              <div className="conflict-cards-row">
                {conf.claims.map((claim, clIdx) => {
                  const isClaimActive =
                    isThisMessageSelected &&
                    normalizeFileName(selectedCitation?.file) === normalizeFileName(claim.file) &&
                    selectedCitation?.page === claim.page;

                  const isCurrent =
                    conf.resolution &&
                    normalizeFileName(claim.file) === normalizeFileName(conf.resolution.current_file);
                  const isSuperseded =
                    conf.resolution &&
                    normalizeFileName(claim.file) !== normalizeFileName(conf.resolution.current_file);

                  return (
                    <div
                      key={clIdx}
                      className={`conflict-source-card ${isCurrent ? 'claim-current' : ''} ${isSuperseded ? 'claim-superseded' : ''} ${isClaimActive ? 'active' : ''}`}
                      onClick={() => handleSelect({ file: claim.file, page: claim.page })}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelect({ file: claim.file, page: claim.page });
                        }
                      }}
                      aria-label={`Claim: ${claim.value} in ${claim.file} page ${claim.page}`}
                    >
                      <div className="conflict-card-badges">
                        {isCurrent && (
                          <span className="conflict-badge conflict-badge-current" data-testid="badge-current">
                            <span className="badge-dot" aria-hidden="true" />
                            Current
                          </span>
                        )}
                        {isSuperseded && (
                          <span className="conflict-badge conflict-badge-superseded" data-testid="badge-superseded">
                            Superseded
                          </span>
                        )}
                      </div>
                      <div className="source-value">&ldquo;{claim.value}&rdquo;</div>
                      {isCurrent && conf.resolution?.evidence && (
                        <div className="conflict-evidence" data-testid="conflict-evidence">
                          <span className="evidence-label">Evidence:</span> {conf.resolution.evidence}
                        </div>
                      )}
                      <div className="source-meta">
                        <div><strong>File:</strong> {formatSourceTitle(claim.file, sources)} (Page {claim.page})</div>
                        {claim.upload_date && <div><strong>Uploaded:</strong> {claim.upload_date}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {!conf.resolution && (
                <div className="conflict-unresolved-note" data-testid="conflict-unresolved-note">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>The sources don&rsquo;t say which is newer. Check with your instructor.</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 4b. CONVENTION MISMATCH STATE */}
      {!result.abstained && result.convention_mismatches && result.convention_mismatches.length > 0 && (
        <div className="convention-mismatch-container" data-testid="convention-mismatch-view">
          <div className="convention-mismatch-header">
            <svg
              className="convention-icon-svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <h2 className="convention-mismatch-heading">Convention Mismatch Noted</h2>
          </div>
          {result.convention_mismatches.map((mismatch, mIdx) => {
            const summaryParts = mismatch.conventions.map(
              (c) => `${formatSourceTitle(c.file, sources)} uses ${c.value}`
            );
            const summaryText =
              summaryParts.join('; ') +
              (mismatch.adopted_file
                ? `. This answer follows ${formatSourceTitle(mismatch.adopted_file, sources)}.`
                : '.');

            return (
              <div key={mIdx} className="convention-mismatch-group">
                <div className="convention-mismatch-topic">
                  Topic: {formatConventionTopic(mismatch.topic)}
                </div>
                <p className="convention-mismatch-summary" data-testid="convention-mismatch-summary">
                  {summaryText}
                </p>
                <div className="convention-cards-row">
                  {mismatch.conventions.map((conv, cIdx) => {
                    const isConvActive =
                      isThisMessageSelected &&
                      normalizeFileName(selectedCitation?.file) === normalizeFileName(conv.file) &&
                      selectedCitation?.page === conv.page;

                    return (
                      <div
                        key={cIdx}
                        className={`convention-card ${conv.adopted ? 'adopted' : ''} ${isConvActive ? 'active' : ''}`}
                        onClick={() => handleSelect({ file: conv.file, page: conv.page })}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelect({ file: conv.file, page: conv.page });
                          }
                        }}
                        aria-label={`Convention: ${conv.value} in ${formatSourceTitle(conv.file, sources)} page ${conv.page}`}
                      >
                        <div className="convention-badge-row">
                          {conv.adopted ? (
                            <span className="badge-adopted" data-testid="badge-adopted">
                              ✓ Followed in answer
                            </span>
                          ) : (
                            <span className="badge-alternative">Alternative</span>
                          )}
                        </div>
                        <div className="convention-value">&ldquo;{conv.value}&rdquo;</div>
                        <div className="convention-meta">
                          <strong>Source:</strong> {formatSourceTitle(conv.file, sources)} (Page {conv.page})
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. ANSWERED STATE */}
      {!result.abstained && (
        <div className="answer-view-container" data-testid="answer-view">
          {/* Resolved conflict summary banner above answer */}
          {resolvedConflicts.length > 0 && (
            <div className="conflict-summary-banner" data-testid="conflict-summary-banner" role="status">
              <span className="summary-banner-icon" aria-hidden="true">💡</span>
              <span className="summary-banner-text">
                <strong>Heads up:</strong>{' '}
                {resolvedConflicts.map((c, i) => (
                  <span key={i}>
                    {formatSourceTitle(c.resolution!.current_file, sources)} updates the {c.topic}.{' '}
                  </span>
                ))}
              </span>
            </div>
          )}

          {/* Convention Pills at top of answer */}
          {result.conventions && result.conventions.length > 0 && (
            <div className="conventions-pills-row" data-testid="conventions-pills">
              {result.conventions.map((conv, idx) => {
                const isConvActive =
                  isThisMessageSelected &&
                  normalizeFileName(selectedCitation?.file) === normalizeFileName(conv.file) &&
                  selectedCitation?.page === conv.page;

                return (
                  <button
                    key={idx}
                    type="button"
                    className={`convention-pill ${conv.adopted ? 'adopted' : ''} ${isConvActive ? 'active' : ''}`}
                    onClick={() => handleSelect({ file: conv.file, page: conv.page })}
                    data-testid={`convention-pill-${idx}`}
                    aria-label={`Convention: ${conv.value} ${formatConventionTopic(conv.topic)} in ${formatSourceTitle(conv.file, sources)}`}
                  >
                    <span className="convention-pill-icon" aria-hidden="true">✦</span>
                    <span>{conv.value} {formatConventionTopic(conv.topic)} &bull; {formatSourceTitle(conv.file, sources)}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="answer-text">
            {renderFormattedAnswer(
              result.answer,
              allValidCitations,
              isThisMessageSelected,
              selectedCitation,
              handleSelect
            )}
          </div>

          {/* Citation chips */}
          {result.citations && result.citations.length > 0 && (
            <div className="citations-section">
              <div className="chips-row">
                {result.citations.map((cit, idx) => {
                  const isActive =
                    isThisMessageSelected &&
                    normalizeFileName(selectedCitation?.file) === normalizeFileName(cit.file) &&
                    selectedCitation?.page === cit.page;

                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`chip ${isActive ? 'active' : ''}`}
                      onClick={() => handleSelect(cit)}
                      data-testid={`citation-chip-${idx}`}
                      aria-label={`Citation ${idx + 1}: ${cit.file} page ${cit.page}`}
                    >
                      <span className="chip-badge">[{idx + 1}]</span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="inline-action-icon">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span>{cit.file} p.{cit.page}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sources list cards */}
          {result.citations && result.citations.length > 0 && (
            <div className="sources-list-container">
              <h3 className="sources-list-heading">Sources</h3>
              <div className="sources-grid">
                {result.citations.map((cit, idx) => {
                  const isActive =
                    isThisMessageSelected &&
                    normalizeFileName(selectedCitation?.file) === normalizeFileName(cit.file) &&
                    selectedCitation?.page === cit.page;

                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`source-card-btn ${isActive ? 'active' : ''}`}
                      onClick={() => handleSelect(cit)}
                      aria-label={`Source ${idx + 1}: ${cit.file} page ${cit.page}`}
                    >
                      <span className="source-card-num">[{idx + 1}]</span>
                      <div className="source-card-details">
                        <span className="source-card-file">{cit.file}</span>
                        <span className="source-card-page">Page {cit.page}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. STATUS STRIP under every completed answer */}
      {showStatusStrip && (
        <div className="status-strip" data-testid="status-strip" aria-label="Answer metadata">
          {hasLatency && (
            <div className="status-strip-item" data-testid="status-latency">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>{result.latency.toFixed(2)}s</span>
            </div>
          )}
          {hasModel && (
            <div className="status-strip-item" data-testid="status-model">
              <span className="status-strip-label">Model:</span>
              <span>{result.model}</span>
            </div>
          )}
          {hasRetrievedCount && (
            <div className="status-strip-item" data-testid="status-retrieved">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
              <span>{result.retrieved.length} passage{result.retrieved.length === 1 ? '' : 's'} retrieved</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
