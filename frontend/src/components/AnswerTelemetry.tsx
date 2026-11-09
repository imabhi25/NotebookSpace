import React from 'react';
import { AnswerTelemetry as Telemetry, KEYWORD_BOOST } from '../answerTelemetry';

const Icon: React.FC<{ d: React.ReactNode }> = ({ d }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICONS = {
  model: <Icon d={<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />} />,
  chunks: <Icon d={<><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>} />,
  score: <Icon d={<><line x1="6" y1="20" x2="6" y2="12" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="9" /></>} />,
  llm: <Icon d={<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 9h6v6H9z" /></>} />,
  latency: <Icon d={<><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>} />,
  citations: <Icon d={<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />} />,
};

const scoreDetail = (t: NonNullable<Telemetry['top']>): string => {
  if (t.kind === 'exact') {
    return (t.boost ?? 0) > 1e-6 ? `raw ${(t.raw as number).toFixed(3)} + ${(t.boost as number).toFixed(3)} boost` : `raw ${(t.raw as number).toFixed(3)}, no boost`;
  }
  if (t.kind === 'vector') return `raw ${t.score.toFixed(3)}, no boost`;
  if (t.kind === 'estimated') return `raw ≈${(t.raw as number).toFixed(3)} + ${KEYWORD_BOOST.toFixed(2)} boost`;
  return 'keyword boost applied';
};

/** A compact technical line under a grounded answer: how it was retrieved, scored and cited. */
export const AnswerTelemetryStrip: React.FC<{ telemetry: Telemetry; generation?: { latency: number | null; model: string | null } }> = ({ telemetry, generation }) => {
  const { chunks, top, citations } = telemetry;
  return (
    <div className="answer-telemetry" role="group" aria-label="Answer telemetry" data-testid="answer-telemetry">
      {generation?.model && <span className="telemetry-item" data-testid="telemetry-llm">{ICONS.llm}{generation.model}</span>}
      {generation && generation.latency !== null && <span className="telemetry-item" data-testid="telemetry-latency">{ICONS.latency}{generation.latency.toFixed(2)}s</span>}
      <span className="telemetry-item" data-testid="telemetry-model">{ICONS.model}{telemetry.model}</span>
      {chunks !== null && (
        <span className="telemetry-item" data-testid="telemetry-chunks">{ICONS.chunks}{chunks} {chunks === 1 ? 'chunk' : 'chunks'} retrieved</span>
      )}
      {top && (
        <span
          className="telemetry-item" data-testid="telemetry-score"
          title={top.kind === 'exact'
            ? 'The raw cosine similarity and the final keyword-boosted score are both recorded with the retrieved passage.'
            : top.kind === 'estimated'
            ? 'The saved response keeps only the boosted score, so the raw cosine is estimated as the score minus the keyword boost. The Retrieval tab shows the exact value.'
            : top.kind === 'boosted'
              ? 'A keyword matched, but the score is at the boost floor or the cap, so the raw cosine cannot be recovered from the saved response.'
              : 'No keyword matched this chunk, so its score is the raw cosine similarity.'}
        >
          {ICONS.score}Top Score: <b>{top.score.toFixed(3)}</b> <span className="telemetry-detail">({scoreDetail(top)})</span>
        </span>
      )}
      <span className="telemetry-item" data-testid="telemetry-citations">{ICONS.citations}{citations} Verified {citations === 1 ? 'Citation' : 'Citations'}</span>
    </div>
  );
};
