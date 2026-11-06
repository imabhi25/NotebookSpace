import React, { useRef, useEffect } from 'react';

interface ComposerProps {
  question: string;
  setQuestion: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  onStop?: () => void;
  selectedSourceCount?: number;
  placeholder?: string;
}

export const Composer: React.FC<ComposerProps> = ({
  question,
  setQuestion,
  onSubmit,
  loading,
  onStop,
  selectedSourceCount,
  placeholder = "",
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSendTimeRef = useRef<number>(0);

  useEffect(() => {
    if (loading) {
      lastSendTimeRef.current = Date.now();
    }
  }, [loading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, parseFloat(getComputedStyle(textareaRef.current).getPropertyValue('--composer-max-height')))}px`;
    }
  }, [question]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!loading && question.trim()) {
        lastSendTimeRef.current = Date.now();
        onSubmit(e);
      }
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    lastSendTimeRef.current = Date.now();
    onSubmit(e);
  };

  const handleStopClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (Date.now() - lastSendTimeRef.current < 500) {
      return;
    }
    onStop?.();
  };

  return (
    <div className="composer-container">
      <form onSubmit={handleFormSubmit} className="composer-form">
        <label htmlFor="question-input" className="sr-only">
          Ask a question about your course materials:
        </label>
        <div className="composer-box">
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
            placeholder={placeholder}
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
              onClick={handleStopClick}
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
