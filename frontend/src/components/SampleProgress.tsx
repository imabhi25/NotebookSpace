import React, { useEffect, useState } from 'react';
import { useModalFocus } from '../useModalFocus';

export type SampleStepStatus = 'pending' | 'active' | 'done' | 'error';

export interface SampleProgressState {
  /** 1-based step now running; 0 before the first starts. */
  step: number;
  error: string | null;
  startedAt: number;
  /** When each step finished, in order (ms since epoch). */
  doneAt: number[];
}

export const SAMPLE_STEPS = [
  'Waking up FastAPI & ONNX runtime',
  'Querying pgvector embeddings',
  'Projecting 2D PCA vector space',
];

interface SampleProgressProps {
  state: SampleProgressState;
  onDismiss: () => void;
  onRetry: () => void;
}

/** What the sample notebook is really doing, step by step, instead of a generic spinner. */
export const SampleProgress: React.FC<SampleProgressProps> = ({ state, onDismiss, onRetry }) => {
  const [now, setNow] = useState(() => Date.now());
  const ref = useModalFocus<HTMLDivElement>(true, state.error ? onDismiss : undefined);
  useEffect(() => {
    if (state.error) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [state.error]);

  const status = (index: number): SampleStepStatus => {
    const step = index + 1;
    if (state.error && step === state.step) return 'error';
    if (step < state.step || state.doneAt[index] !== undefined) return 'done';
    return step === state.step ? 'active' : 'pending';
  };
  const seconds = (index: number): string | null => {
    const begin = index === 0 ? state.startedAt : state.doneAt[index - 1];
    const end = state.doneAt[index];
    if (begin === undefined) return null;
    return `${(((end ?? now) - begin) / 1000).toFixed(1)}s`;
  };

  return (
    <div className="modal-backdrop sample-progress-backdrop">
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="sample-progress-title" className="sample-progress" data-testid="sample-progress">
        <h2 id="sample-progress-title" className="sample-progress-title">Setting up the sample notebook</h2>
        <p className="sample-progress-sub">A free-tier backend sleeps when idle, so the first request can take about 30 seconds.</p>
        <ol className="sample-progress-steps">
          {SAMPLE_STEPS.map((label, i) => {
            const s = status(i);
            return (
              <li key={label} className={`sample-step sample-step-${s}`} data-status={s} aria-current={s === 'active' ? 'step' : undefined}>
                <span className="sample-step-mark" aria-hidden="true">{s === 'done' ? '✓' : s === 'error' ? '!' : i + 1}</span>
                <span className="sample-step-label">{i + 1}. {label}{s === 'active' ? '…' : ''}</span>
                <span className="sample-step-time">{s === 'pending' ? '' : seconds(i)}</span>
              </li>
            );
          })}
        </ol>
        <div className="sr-only" role="status" aria-live="polite">
          {state.error ? `Failed: ${state.error}` : state.step > 0 && state.step <= SAMPLE_STEPS.length ? `Step ${state.step} of ${SAMPLE_STEPS.length}: ${SAMPLE_STEPS[state.step - 1]}` : ''}
        </div>
        {state.error && (
          <div className="sample-progress-error" role="alert">
            <p>{state.error}</p>
            <div className="sample-progress-actions">
              <button type="button" className="btn btn-primary" onClick={onRetry}>Try again</button>
              <button type="button" className="btn btn-secondary" onClick={onDismiss}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
