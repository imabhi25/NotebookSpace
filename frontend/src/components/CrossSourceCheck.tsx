import React from 'react';
import { CrossSourceCheck as Check, CrossSourceEntry } from '../answerTelemetry';

interface CrossSourceCheckProps {
  check: Check;
  /** Open the evidence for a source/page. */
  onOpen: (entry: CrossSourceEntry['open']) => void;
}

const heading = (check: Check): string => {
  const topics = check.topics.join(', ');
  if (check.status === 'conflict') return topics ? `Policy update detected: ${topics}` : 'These documents disagree';
  if (check.status === 'update') return 'Possible update across sources';
  return 'Draws on more than one source';
};

/**
 * A quiet diff note under the answer: what each cited document says, side by side, with a pill
 * that opens the exact page. Shown when several sources back an answer or one contradicts another.
 */
export const CrossSourceCheck: React.FC<CrossSourceCheckProps> = ({ check, onOpen }) => (
  <section
    className={`cross-source cross-source-${check.status}`}
    aria-label="Cross-Source Evidence Check"
    data-testid={check.status === 'conflict' ? 'conflict-view' : 'cross-source-check'}
    data-status={check.status}
  >
    <header className="cross-source-header">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <h3 className="cross-source-title">{heading(check)}</h3>
    </header>
    <ul className="cross-source-rows">
      {check.sources.map((src) => {
        const rows = src.claims.length > 0
          ? src.claims.map((c) => ({ text: c.value, page: c.page, claim: true }))
          : [{ text: src.excerpt, page: src.open.page, claim: false }];
        return rows.map((row, i) => (
          <li key={`${src.key}-${i}`} className="cross-source-row" data-testid="cross-source-card">
            <span className="cross-source-line">
              <span className="cross-source-file" title={src.file}>{src.title}</span>
              {typeof src.version === 'number' && <span className="cross-source-ver">v{src.version}</span>}
              <span className="cross-source-page"> (p.{row.page}):</span>{' '}
              <span className="cross-source-value">{row.text}</span>
            </span>
            <button
              type="button"
              className="cross-source-pill"
              aria-label={row.claim ? `Claim: ${row.text} in ${src.file} page ${row.page}` : `View page ${row.page} of ${src.file}`}
              onClick={() => onOpen({ ...src.open, page: row.page })}
            >
              View p.{row.page} <span aria-hidden="true">&rarr;</span>
            </button>
          </li>
        ));
      })}
    </ul>
  </section>
);
