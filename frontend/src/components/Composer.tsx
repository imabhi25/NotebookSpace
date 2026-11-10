import React, { useEffect, useId, useRef, useState } from 'react';
import { Source } from '../types';

export interface ComposerScope {
  sources: Source[];
  selectedSourceIds: string[];
  onToggleSource: (id: string) => void;
  onSelectAllReady: () => void;
  onClearSources: () => void;
  onOpenMaterials?: () => void;
}

interface ComposerProps {
  question: string;
  setQuestion: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
  loading: boolean;
  onStop?: () => void;
  selectedSourceCount?: number;
  placeholder?: string;
  blockedReason?: string;
  /** When given, the composer shows which materials the next question will use, and lets you change them. */
  scope?: ComposerScope;
}

const isPending = (s: Source) => s.status === 'processing' || s.status === 'uploading';

function statusText(s: Source): string {
  if (s.status === 'ready') return `${s.page_count} ${s.page_count === 1 ? 'page' : 'pages'} · Ready`;
  if (isPending(s)) return 'Processing…';
  return s.error_message || 'Could not be read';
}

/** "Using N of M materials": N counts only ready materials that are selected, which is what a question can use. */
function ScopeChip({ scope }: { scope: ComposerScope }) {
  const [open, setOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const popId = useId();
  const { sources, selectedSourceIds } = scope;
  const ready = sources.filter((s) => s.status === 'ready');
  const used = ready.filter((s) => selectedSourceIds.includes(s.id)).length;
  const processing = sources.filter(isPending).length;
  const failed = sources.filter((s) => s.status === 'failed').length;
  const extra = [processing ? `${processing} processing` : '', failed ? `${failed} failed` : ''].filter(Boolean).join(' · ');
  const label = used === 0 ? 'No materials selected' : `Using ${used} of ${sources.length} ${sources.length === 1 ? 'material' : 'materials'}`;
  const tone = used === 0 ? 'error' : processing ? 'processing' : failed ? 'error' : 'ready';

  const close = (restore: boolean) => {
    setOpen(false);
    if (restore) chipRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !chipRef.current?.contains(t)) setOpen(false);
    };
    // Escape closes the popover wherever focus is inside the page, and nothing else reacts to that key press.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      chipRef.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className="scope-wrap">
      <button
        type="button"
        ref={chipRef}
        className="scope-chip"
        data-testid="scope-chip"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-label={`${used} of ${sources.length} materials selected${extra ? `, ${extra}` : ''}. Change selection`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`scope-dot ${tone}`} aria-hidden="true" />
        <span className="scope-text">
          {label}
          {extra && <span className="scope-extra"> · {extra}</span>}
        </span>
      </button>
      {open && (
        <div
          id={popId}
          ref={popRef}
          className="scope-popover"
          role="dialog"
          aria-label="Materials for the next question"
        >
          <h3 className="scope-popover-title">Materials used for the next question</h3>
          <ul className="scope-list">
            {sources.map((s) => {
              const usable = s.status === 'ready';
              return (
                <li key={s.id} className="scope-row">
                  <label className="scope-row-label">
                    <input
                      type="checkbox"
                      className="scope-check"
                      checked={usable && selectedSourceIds.includes(s.id)}
                      disabled={!usable}
                      onChange={() => scope.onToggleSource(s.id)}
                      aria-label={`Use ${s.title}${usable ? '' : ` (${isPending(s) ? 'processing' : 'failed'})`}`}
                    />
                    <span className="scope-row-text">
                      <span className="scope-row-name" title={s.file_name}>{s.title}</span>
                      <span className={`scope-row-status ${usable ? '' : isPending(s) ? 'processing' : 'failed'}`}>{statusText(s)}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="scope-actions">
            <button type="button" className="scope-link" onClick={scope.onSelectAllReady}>Select all ready</button>
            <button type="button" className="scope-link" onClick={scope.onClearSources}>Clear</button>
            {scope.onOpenMaterials && (
              <button type="button" className="scope-link" onClick={() => { close(false); scope.onOpenMaterials?.(); }}>Open materials</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const Composer: React.FC<ComposerProps> = ({
  question,
  setQuestion,
  onSubmit,
  loading,
  onStop,
  selectedSourceCount,
  placeholder = "",
  scope,
  blockedReason,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSendTimeRef = useRef<number>(0);
  // Guards: IME composition (Enter confirms a candidate, it does not send) and double submission.
  const composingRef = useRef(false);
  const compositionEndedAt = useRef(0);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (loading) {
      lastSendTimeRef.current = Date.now();
    }
  }, [loading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, parseFloat(getComputedStyle(textareaRef.current).getPropertyValue('--composer-max-height')) || 168)}px`;
    }
  }, [question]);

  const submit = (e: React.FormEvent) => {
    if (submittingRef.current || blockedReason) return;
    lastSendTimeRef.current = Date.now();
    submittingRef.current = true;
    const release = () => {
      submittingRef.current = false;
    };
    Promise.resolve(onSubmit(e)).then(release, release);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return; // Shift+Enter stays a newline
    const composing =
      e.nativeEvent.isComposing || e.keyCode === 229 || composingRef.current || Date.now() - compositionEndedAt.current < 60;
    if (composing) return; // confirming an IME candidate: neither send nor swallow the key
    e.preventDefault();
    if (!loading && question.trim()) submit(e);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(e);
  };

  const handleStopClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (Date.now() - lastSendTimeRef.current < 500) {
      return;
    }
    onStop?.();
  };

  const sendButton =
    loading && onStop ? (
      <button type="button" className="composer-stop-btn" onClick={handleStopClick} aria-label="Stop generation">
        <span className="stop-btn-icon" aria-hidden="true">■</span>
        <span className="send-btn-text">Stop generation</span>
      </button>
    ) : (
      <button type="submit" className="composer-send-btn" disabled={loading || Boolean(blockedReason) || !question.trim()} aria-label="Ask Question">
        <span className="send-btn-icon" aria-hidden="true">
          {loading ? (
            <span className="composer-spinner" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          )}
        </span>
        <span className="send-btn-text sr-only">{loading ? 'Searching & Answering...' : 'Ask Question'}</span>
      </button>
    );

  const textarea = (
    <textarea
      ref={textareaRef}
      id="question-input"
      className="composer-input"
      rows={1}
      placeholder={blockedReason || placeholder}
      value={question}
      onChange={(e) => setQuestion(e.target.value)}
      onKeyDown={handleKeyDown}
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={() => { composingRef.current = false; compositionEndedAt.current = Date.now(); }}
      disabled={loading || Boolean(blockedReason)}
      aria-label="Ask a question about your course materials"
    />
  );

  return (
    <div className="composer-container">
      <form onSubmit={handleFormSubmit} className="composer-form">
        <label htmlFor="question-input" className="sr-only">
          Ask a question about your course materials:
        </label>
        {scope ? (
          <div className="composer-box composer-box-stacked">
            {textarea}
            <div className="composer-foot">
              <ScopeChip scope={scope} />
              {sendButton}
            </div>
          </div>
        ) : (
          <div className="composer-box">
            {selectedSourceCount !== undefined && (
              <div className="composer-sources-badge" title={`${selectedSourceCount} sources referenced`}>
                <span className="badge-count-num">{selectedSourceCount}</span>
                <span className="badge-count-label">{selectedSourceCount === 1 ? 'source' : 'sources'}</span>
              </div>
            )}
            {textarea}
            {sendButton}
          </div>
        )}
      </form>
    </div>
  );
};
