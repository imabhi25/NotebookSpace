import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetrievalMapView } from './components/RetrievalMapView';
import { api } from './api';
import { RetrievalMapResponse } from './types';

vi.mock('./api', () => ({
  api: {
    getRetrievalMap: vi.fn(),
  },
}));

describe('RetrievalMapView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockResponse: RetrievalMapResponse = {
    subject_id: 'sub-1',
    question: 'What is gradient descent?',
    query_position: { x: 0.1, y: 0.2, z: 0.0 },
    abstained: false,
    abstain_reason: null,
    support_min_score: 0.2,
    retrieved_chunk_ids: [1],
    chunks: [
      {
        id: 1,
        source_id: 'src-1',
        file_name: 'lecture1.pdf',
        title: 'Lecture 1',
        page_number: 3,
        chunk_index: 0,
        text: 'Gradient descent minimizes the objective function iteratively.',
        position: { x: 0.15, y: 0.22, z: 0.01 },
        raw_cosine: 0.72,
        score: 1.02,
        matched_terms: ['gradient', 'descent'],
        is_retrieved: true,
      },
      {
        id: 2,
        source_id: 'src-1',
        file_name: 'lecture1.pdf',
        title: 'Lecture 1',
        page_number: 5,
        chunk_index: 1,
        text: 'Administrative announcement about midterm exam dates.',
        position: { x: -0.8, y: -0.5, z: 0.02 },
        raw_cosine: 0.05,
        score: 0.05,
        matched_terms: [],
        is_retrieved: false,
      },
    ],
  };

  it('renders loading state then loads and displays scatter plot, note, and scores', async () => {
    vi.mocked(api.getRetrievalMap).mockResolvedValueOnce(mockResponse);

    render(
      <RetrievalMapView
        subjectId="sub-1"
        sources={[{ id: 'src-1', file_name: 'lecture1.pdf', title: 'Lecture 1', version: 1 } as any]}
      />
    );

    // Loading state
    expect(screen.getByTestId('retrieval-map-loading')).toBeTruthy();
    expect(screen.getByText(/Computing 2D PCA/i)).toBeTruthy();

    // Data loaded
    await waitFor(() => {
      expect(screen.getByTestId('retrieval-map-view')).toBeTruthy();
    });

    // Required disclaimer note
    const note = screen.getByTestId('retrieval-note');
    expect(note.textContent).toBe(
      '2D projection is an approximation; ranking uses cosine similarity plus a keyword boost.'
    );

    // Inspector shows raw cosine and final score separately
    const rawVal = screen.getByTestId('raw-cosine-val');
    const finalVal = screen.getByTestId('final-score-val');
    expect(rawVal.textContent).toBe('0.720');
    expect(finalVal.textContent).toBe('1.020');
    expect(screen.getByText('+0.30 boost')).toBeTruthy();
  });

  it('displays low similarity label when raw cosine is below 0.35 upon selecting chunk', async () => {
    vi.mocked(api.getRetrievalMap).mockResolvedValueOnce(mockResponse);

    render(
      <RetrievalMapView
        subjectId="sub-1"
        sources={[{ id: 'src-1', file_name: 'lecture1.pdf', title: 'Lecture 1', version: 1 } as any]}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('retrieval-map-view')).toBeTruthy();
    });

    // Click on chunk 2 which has raw_cosine 0.05 < 0.35
    const chunk2Node = screen.getByLabelText(/chunk 1/i);
    fireEvent.click(chunk2Node);

    // Inspector should update to show chunk 2 and low similarity badge
    await waitFor(() => {
      const badge = screen.getByTestId('weak-match-badge');
      expect(badge).toBeTruthy();
      expect(screen.getByText('Low similarity')).toBeTruthy();
      expect(badge.getAttribute('title')).toBe(
        'Heuristic only; answers are still checked against the passages.'
      );
      expect(screen.getByTestId('raw-cosine-val').textContent).toBe('0.050');
      expect(screen.getByTestId('final-score-val').textContent).toBe('0.050');
    });
  });

  it('renders empty state when no chunks are returned', async () => {
    vi.mocked(api.getRetrievalMap).mockResolvedValueOnce({
      subject_id: 'sub-empty',
      chunks: [],
      retrieved_chunk_ids: [],
      abstained: false,
      support_min_score: 0.2,
    });

    render(<RetrievalMapView subjectId="sub-empty" />);

    await waitFor(() => {
      expect(screen.getByTestId('retrieval-map-empty')).toBeTruthy();
    });
    expect(screen.getByText(/No embedding chunks available/i)).toBeTruthy();
  });
});
