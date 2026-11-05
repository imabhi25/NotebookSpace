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

  it('selects nothing and displays "No passages were retrieved for this answer." when retrieved_chunk_ids is empty', async () => {
    vi.mocked(api.getRetrievalMap).mockResolvedValueOnce({
      ...mockResponse,
      retrieved_chunk_ids: [],
      abstained: true,
      abstain_reason: 'not_found',
    });

    render(
      <RetrievalMapView
        subjectId="sub-1"
        sources={[{ id: 'src-1', file_name: 'lecture1.pdf', title: 'Lecture 1', version: 1 } as any]}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('retrieval-map-view')).toBeTruthy();
    });

    // Inspector card should NOT be rendered initially
    expect(screen.queryByTestId('retrieval-inspector')).toBeNull();

    // The note should be displayed
    const noRetrievedNote = screen.getByTestId('no-retrieved-passages-note');
    expect(noRetrievedNote).toBeTruthy();
    expect(noRetrievedNote.textContent).toContain('No passages were retrieved for this answer.');

    // Clicking a chunk should still inspect that chunk
    const chunk1Node = screen.getByLabelText(/chunk 0/i);
    fireEvent.click(chunk1Node);

    await waitFor(() => {
      expect(screen.getByTestId('retrieval-inspector')).toBeTruthy();
      expect(screen.getByTestId('raw-cosine-val').textContent).toBe('0.720');
    });
  });

  it('selects the highest-scoring chunk by default when document order differs from score order and renders ranked list', async () => {
    const unorderedChunksResponse: RetrievalMapResponse = {
      subject_id: 'sub-1',
      question: 'Explain attention mechanisms',
      query_position: { x: 0.0, y: 0.0, z: 0.0 },
      abstained: false,
      abstain_reason: null,
      support_min_score: 0.2,
      // Document order: id 10, then 11, then 12
      retrieved_chunk_ids: [10, 11, 12],
      chunks: [
        {
          id: 10,
          source_id: 'src-1',
          file_name: 'paper.pdf',
          title: 'Paper',
          page_number: 1,
          chunk_index: 0,
          text: 'Introduction to attention mechanisms.',
          position: { x: 0.1, y: 0.1, z: 0.0 },
          raw_cosine: 0.4,
          score: 0.5,
          matched_terms: ['attention'],
          is_retrieved: true,
        },
        {
          id: 11,
          source_id: 'src-1',
          file_name: 'paper.pdf',
          title: 'Paper',
          page_number: 4,
          chunk_index: 1,
          text: 'Scaled dot-product attention formula and definition.',
          position: { x: 0.5, y: 0.5, z: 0.0 },
          raw_cosine: 0.65,
          score: 0.95, // Highest score
          matched_terms: ['attention', 'mechanisms'],
          is_retrieved: true,
        },
        {
          id: 12,
          source_id: 'src-1',
          file_name: 'paper.pdf',
          title: 'Paper',
          page_number: 7,
          chunk_index: 2,
          text: 'Multi-head attention architectural layer discussion.',
          position: { x: 0.3, y: 0.3, z: 0.0 },
          raw_cosine: 0.7,
          score: 0.7, // Second highest score
          matched_terms: [],
          is_retrieved: true,
        },
      ],
    };

    vi.mocked(api.getRetrievalMap).mockResolvedValueOnce(unorderedChunksResponse);

    render(
      <RetrievalMapView
        subjectId="sub-1"
        sources={[{ id: 'src-1', file_name: 'paper.pdf', title: 'Paper', version: 1 } as any]}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('retrieval-map-view')).toBeTruthy();
    });

    // Default selected chunk should be chunk 11 (highest score 0.95), NOT chunk 10 (first in document order)
    expect(screen.getByTestId('retrieval-inspector')).toBeTruthy();
    expect(screen.getByTestId('final-score-val').textContent).toBe('0.950');
    expect(screen.getByTestId('raw-cosine-val').textContent).toBe('0.650');
    expect(screen.getByText('Scaled dot-product attention formula and definition.')).toBeTruthy();

    // Verify ranked retrieved passages list is displayed
    const list = screen.getByTestId('retrieved-passages-list');
    expect(list).toBeTruthy();

    // Check rows: Rank 1 is id 11, Rank 2 is id 12, Rank 3 is id 10
    const row1 = screen.getByTestId('retrieved-passage-row-11');
    const row2 = screen.getByTestId('retrieved-passage-row-12');
    const row3 = screen.getByTestId('retrieved-passage-row-10');

    expect(row1).toBeTruthy();
    expect(row2).toBeTruthy();
    expect(row3).toBeTruthy();

    expect(row1.textContent).toContain('0.950');
    expect(row2.textContent).toContain('0.700');
    expect(row3.textContent).toContain('0.500');

    // Clicking row 3 (id 10) selects chunk 10 in the inspector
    fireEvent.click(row3);

    await waitFor(() => {
      expect(screen.getByTestId('final-score-val').textContent).toBe('0.500');
      expect(screen.getByTestId('raw-cosine-val').textContent).toBe('0.400');
      expect(screen.getByText('Introduction to attention mechanisms.')).toBeTruthy();
    });
  });
});
