import React from 'react';
import { CrossSourceCheck as Check, CrossSourceEntry } from '../answerTelemetry';

interface CrossSourceCheckProps {
  check: Check;
  /** Open the evidence for a source/page. */
  onOpen: (entry: CrossSourceEntry['open']) => void;
}

const STATUS_TEXT: Record<Check['status'], string> = {
  conflict: 'These documents disagree',
  update: 'Several sources cited, and the answer mentions an update or a contradiction. Compare them.',
  multi: 'This answer draws on more than one source. No contradiction was flagged.',
};
const BADGE: Record<Check['status'], string> = { conflict: 'Conflict', update: 'Check for updates', multi: 'Multi-source' };

/**
 * Puts the sources an answer rests on side by side, so a student can see at a glance when more than
 * one document is involved, and what each one says when they disagree.
 */
export const CrossSourceCheck: React.FC<CrossSourceCheckProps> = ({ check, onOpen }) => (
  <section
    className={`cross-source cross-source-${check.status}`}
    aria-label="Cross-Source Evidence Check"
    data-testid={check.status === 'conflict' ? 'conflict-view' : 'cross-source-check'}
    data-status={check.status}
  >
    <header className="cross-source-header">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {check.status === 'conflict'
          ? <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>
          : <><path d="M16 3h5v5" /><path d="M8 3H3v5" /><path d="M21 3l-7 7" /><path d="M3 3l7 7" /><path d="M16 21h5v-5" /><path d="M8 21H3v-5" /><path d="M21 21l-7-7" /><path d="M3 21l7-7" /></>}
      </svg>
      <h3 className="cross-source-title">Cross-Source Evidence Check</h3>
      <span className="cross-source-badge">{BADGE[check.status]}</span>
    </header>
    <p className="cross-source-status">{STATUS_TEXT[check.status]}</p>
    {check.topics.length > 0 && (
      <ul className="cross-source-topics">
        {check.topics.map((t) => <li key={t} className="conflict-topic">Conflict Topic: {t}</li>)}
      </ul>
    )}
    <div className="cross-source-grid" style={{ ['--cross-source-count' as string]: Math.min(check.sources.length, 3) }}>
      {check.sources.map((src) => (
        <article key={src.key} className="cross-source-card" data-testid="cross-source-card">
          <div className="cross-source-file" title={src.file}>{src.title}</div>
          <div className="cross-source-meta">
            {src.pages.length > 0 && <span>p. {src.pages.join(', ')}</span>}
            {typeof src.version === 'number' && <span>v{src.version}</span>}
          </div>
          {src.claims.length > 0 && (
            <div className="cross-source-claims">
              {src.claims.map((claim, i) => (
                <button
                  key={i} type="button" className="cross-source-claim conflict-source-card"
                  aria-label={`Claim: ${claim.value} in ${src.file} page ${claim.page}`}
                  onClick={() => onOpen({ ...src.open, page: claim.page })}
                >
                  <span className="source-value">&ldquo;{claim.value}&rdquo;</span>
                  <span className="source-meta">{src.file} (Page {claim.page})</span>
                </button>
              ))}
            </div>
          )}
          {src.excerpt && <p className="cross-source-excerpt">&ldquo;{src.excerpt}&rdquo;</p>}
          <button type="button" className="cross-source-open" onClick={() => onOpen(src.open)}>
            View evidence <span aria-hidden="true">&rarr;</span><span className="sr-only"> from {src.file}</span>
          </button>
        </article>
      ))}
    </div>
  </section>
);
