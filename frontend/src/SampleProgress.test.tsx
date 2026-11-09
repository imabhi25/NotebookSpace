import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { SAMPLE_STEPS, SampleProgress } from './components/SampleProgress';

const base = { startedAt: 1_000_000, doneAt: [] as number[], error: null as string | null };
const steps = () => within(screen.getByTestId('sample-progress')).getAllByRole('listitem');

describe('SampleProgress', () => {
  it('names the three real stages and marks the one that is running', () => {
    render(<SampleProgress state={{ ...base, step: 1 }} onDismiss={vi.fn()} onRetry={vi.fn()} />);
    expect(steps().map((s) => s.getAttribute('data-status'))).toEqual(['active', 'pending', 'pending']);
    expect(steps()[0]).toHaveTextContent('1. Waking up FastAPI & ONNX runtime');
    expect(steps()[1]).toHaveTextContent('2. Querying pgvector embeddings');
    expect(steps()[2]).toHaveTextContent('3. Projecting 2D PCA vector space');
    expect(steps()[0]).toHaveAttribute('aria-current', 'step');
  });

  it('shows finished stages with their durations', () => {
    render(<SampleProgress state={{ ...base, step: 3, doneAt: [1_012_300, 1_014_100] }} onDismiss={vi.fn()} onRetry={vi.fn()} />);
    expect(steps().map((s) => s.getAttribute('data-status'))).toEqual(['done', 'done', 'active']);
    expect(steps()[0]).toHaveTextContent('12.3s');
    expect(steps()[1]).toHaveTextContent('1.8s');
  });

  it('announces the current stage to screen readers', () => {
    render(<SampleProgress state={{ ...base, step: 2, doneAt: [1_001_000] }} onDismiss={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByTestId('sample-progress')).toHaveTextContent(`Step 2 of ${SAMPLE_STEPS.length}: ${SAMPLE_STEPS[1]}`);
  });

  it('shows what failed on the stage that failed, with Try again and Close', () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    render(<SampleProgress state={{ ...base, step: 2, doneAt: [1_001_000], error: 'Portfolio deployment limit reached' }} onDismiss={onDismiss} onRetry={onRetry} />);
    expect(steps().map((s) => s.getAttribute('data-status'))).toEqual(['done', 'error', 'pending']);
    expect(screen.getByRole('alert')).toHaveTextContent('Portfolio deployment limit reached');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
