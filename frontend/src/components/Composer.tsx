import React, { useRef, useEffect, useState } from 'react';
import '../proof.css';

export interface ProofDraft {
  statement: string;
  format: 'loop_invariant' | 'free_form';
  initialization: string;
  maintenance: string;
  termination: string;
  body: string;
}

export const initialProofDraft: ProofDraft = {
  statement: '',
  format: 'loop_invariant',
  initialization: '',
  maintenance: '',
  termination: '',
  body: '',
};

interface ComposerProps {
  question: string;
  setQuestion: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  onStop?: () => void;
  selectedSourceCount?: number;
  placeholder?: string;
  mode?: 'ask' | 'proof';
  onModeChange?: (mode: 'ask' | 'proof') => void;
  proofDraft?: ProofDraft;
  setProofDraft?: React.Dispatch<React.SetStateAction<ProofDraft>>;
  onSubmitProof?: (draft: ProofDraft) => void;
}

export const Composer: React.FC<ComposerProps> = ({
  question,
  setQuestion,
  onSubmit,
  loading,
  onStop,
  selectedSourceCount,
  placeholder = "",
  mode = 'ask',
  onModeChange,
  proofDraft: externalProofDraft,
  setProofDraft: externalSetProofDraft,
  onSubmitProof,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Internal draft state fallback if parent does not provide state
  const [internalDraft, setInternalDraft] = useState<ProofDraft>(initialProofDraft);
  const proofDraft = externalProofDraft || internalDraft;
  const setProofDraft = externalSetProofDraft || setInternalDraft;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = parseFloat(getComputedStyle(textareaRef.current).getPropertyValue('--composer-max-height')) || 160;
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [question]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!loading && question.trim()) {
        onSubmit(e);
      }
    }
  };

  const isProofEmpty = (() => {
    if (!proofDraft.statement.trim()) return true;
    if (proofDraft.format === 'loop_invariant') {
      const hasInit = Boolean(proofDraft.initialization.trim());
      const hasMaint = Boolean(proofDraft.maintenance.trim());
      const hasTerm = Boolean(proofDraft.termination.trim());
      return !(hasInit || hasMaint || hasTerm);
    }
    return !proofDraft.body.trim();
  })();

  const handleProofSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loading && !isProofEmpty && onSubmitProof) {
      onSubmitProof(proofDraft);
    }
  };

  return (
    <div className="composer-container">
      {/* Expanded Proof Check Card */}
      {mode === 'proof' && (
        <div className="proof-composer-card" data-testid="proof-composer-card">
          <div className="proof-card-header">
            <div className="proof-card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="9 11 12 14 22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <span>Check Proof Attempt</span>
            </div>
            {onModeChange && (
              <button
                type="button"
                className="proof-card-close-btn"
                onClick={() => onModeChange('ask')}
                aria-label="Close proof check mode"
                title="Return to Ask mode"
                data-testid="proof-close-btn"
              >
                ✕
              </button>
            )}
          </div>

          {/* Statement */}
          <div className="proof-field-group">
            <label htmlFor="proof-statement" className="proof-field-label">
              What are you proving?
            </label>
            <input
              id="proof-statement"
              type="text"
              className="proof-statement-input"
              placeholder="e.g., Insertion sort correctly sorts array A[0..n-1]"
              value={proofDraft.statement}
              onChange={(e) => setProofDraft((d) => ({ ...d, statement: e.target.value }))}
              disabled={loading}
              data-testid="proof-statement-input"
            />
          </div>

          {/* Format Toggle: Loop invariant | Free-form */}
          <div className="proof-format-toggle-row">
            <span className="proof-field-label">Format:</span>
            <div className="proof-toggle-pill" role="radiogroup" aria-label="Proof format">
              <button
                type="button"
                role="radio"
                aria-checked={proofDraft.format === 'loop_invariant'}
                className={`proof-toggle-btn ${proofDraft.format === 'loop_invariant' ? 'active' : ''}`}
                onClick={() => setProofDraft((d) => ({ ...d, format: 'loop_invariant' }))}
                data-testid="toggle-loop-invariant"
              >
                Loop invariant
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={proofDraft.format === 'free_form'}
                className={`proof-toggle-btn ${proofDraft.format === 'free_form' ? 'active' : ''}`}
                onClick={() => setProofDraft((d) => ({ ...d, format: 'free_form' }))}
                data-testid="toggle-free-form"
              >
                Free-form
              </button>
            </div>
          </div>

          {/* Textareas */}
          {proofDraft.format === 'loop_invariant' ? (
            <>
              <div className="proof-field-group">
                <label htmlFor="proof-init" className="proof-field-label">
                  Initialization
                </label>
                <textarea
                  id="proof-init"
                  className="proof-textarea"
                  placeholder="State why the invariant holds prior to the first iteration of the loop..."
                  value={proofDraft.initialization}
                  onChange={(e) => setProofDraft((d) => ({ ...d, initialization: e.target.value }))}
                  disabled={loading}
                  data-testid="proof-init-input"
                />
              </div>
              <div className="proof-field-group">
                <label htmlFor="proof-maint" className="proof-field-label">
                  Maintenance
                </label>
                <textarea
                  id="proof-maint"
                  className="proof-textarea"
                  placeholder="State why the invariant is maintained from iteration to iteration..."
                  value={proofDraft.maintenance}
                  onChange={(e) => setProofDraft((d) => ({ ...d, maintenance: e.target.value }))}
                  disabled={loading}
                  data-testid="proof-maint-input"
                />
              </div>
              <div className="proof-field-group">
                <label htmlFor="proof-term" className="proof-field-label">
                  Termination
                </label>
                <textarea
                  id="proof-term"
                  className="proof-textarea"
                  placeholder="State what the invariant gives when the loop terminates..."
                  value={proofDraft.termination}
                  onChange={(e) => setProofDraft((d) => ({ ...d, termination: e.target.value }))}
                  disabled={loading}
                  data-testid="proof-term-input"
                />
              </div>
            </>
          ) : (
            <div className="proof-field-group">
              <label htmlFor="proof-body" className="proof-field-label">
                Proof Body
              </label>
              <textarea
                id="proof-body"
                className="proof-textarea proof-textarea-freeform"
                placeholder="Write your mathematical proof attempt here..."
                value={proofDraft.body}
                onChange={(e) => setProofDraft((d) => ({ ...d, body: e.target.value }))}
                disabled={loading}
                data-testid="proof-body-input"
              />
            </div>
          )}

          {/* Action button */}
          <div className="proof-actions-row">
            <button
              type="button"
              className="proof-check-submit-btn"
              onClick={handleProofSubmit}
              disabled={loading || isProofEmpty}
              data-testid="check-my-proof-btn"
            >
              {loading ? (
                <>
                  <span className="composer-spinner" />
                  <span>Checking proof...</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <polyline points="9 11 12 14 22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                  <span>Check my proof</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Pill Composer Bar */}
      <form onSubmit={onSubmit} className="composer-form">
        <label htmlFor="question-input" className="sr-only">
          Ask a question about your course materials:
        </label>
        <div className="composer-box">
          {mode === 'proof' && (
            <div className="composer-mode-chip" data-testid="proof-mode-chip">
              <span>Proof check</span>
              {onModeChange && (
                <button
                  type="button"
                  className="composer-mode-chip-remove"
                  onClick={() => onModeChange('ask')}
                  aria-label="Return to Ask mode"
                  data-testid="proof-mode-remove"
                >
                  ✕
                </button>
              )}
            </div>
          )}
          {selectedSourceCount !== undefined && (
            <div className="composer-sources-badge" title={`${selectedSourceCount} sources referenced`}>
              <span className="badge-count-num">{selectedSourceCount}</span>
              <span className="badge-count-label">{selectedSourceCount === 1 ? 'source' : 'sources'}</span>
            </div>
          )}
          <textarea
            ref={textareaRef}
            id="question-input"
            className="composer-input"
            rows={1}
            placeholder={mode === 'proof' ? "Fill out your proof attempt above, or type here..." : placeholder}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            aria-label="Ask a question about your course materials"
          />
          {loading && onStop ? (
            <button
              type="button"
              className="composer-stop-btn"
              onClick={onStop}
              aria-label="Stop generation"
            >
              <span className="stop-btn-icon" aria-hidden="true">■</span>
              <span className="send-btn-text">Stop generation</span>
            </button>
          ) : (
            <button
              type="submit"
              className="composer-send-btn"
              disabled={loading || !question.trim()}
              aria-label="Ask Question"
            >
              <span className="send-btn-icon" aria-hidden="true">
                {loading ? (
                  <span className="composer-spinner" />
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                )}
              </span>
              <span className="send-btn-text sr-only">
                {loading ? 'Searching & Answering...' : 'Ask Question'}
              </span>
            </button>
          )}
        </div>
      </form>
      <div className="composer-footer-note">
        NotebookSpace answers questions with verified citations from uploaded materials.
      </div>
      <div className="composer-disclaimer-note">
        Independent student project, not affiliated with Google.
      </div>
    </div>
  );
};
