import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RetrievalMapView } from './components/RetrievalMapView';
import { api } from './api';
import { RetrievalMapResponse } from './types';

vi.mock('./api', () => ({ api: { getRetrievalMap: vi.fn() } }));

const chunk = (id: number, raw: number, score: number, terms: string[], retrieved = true) => ({
  id, source_id: 's', file_name: `doc${id}.pdf`, title: `Doc ${id}`, page_number: id, chunk_index: 0, text: `Text ${id}`,
  position: { x: id * 0.2, y: id * -0.1, z: 0 }, raw_cosine: raw, score, matched_terms: terms, is_retrieved: retrieved,
});
const response: RetrievalMapResponse = {
  subject_id: 'sub', question: 'when is the exam', query_position: { x: 0, y: 0, z: 0 }, abstained: false, abstain_reason: null,
  support_min_score: 0.25, retrieved_chunk_ids: [1, 2],
  // 1: strong vector match, no keywords. 2: weaker vector match, boosted by the keyword "exam".
  chunks: [chunk(1, 0.62, 0.62, []), chunk(2, 0.4, 0.7, ['exam']), chunk(3, 0.1, 0.1, [], false)],
};

const order = () => screen.getAllByRole('button', { name: /^Rank \d/ }).map((b) => b.getAttribute('aria-label'));
const load = async () => {
  vi.mocked(api.getRetrievalMap).mockResolvedValueOnce(response);
  render(<RetrievalMapView subjectId="sub" question="when is the exam" />);
  await screen.findByTestId('retrieval-map-view');
};
beforeEach(() => vi.clearAllMocks());

describe('Hybrid boost weight', () => {
  it('shows the control at the top with its 0, 1 and 2 landmarks, at the default weight', async () => {
    await load();
    const control = screen.getByTestId('hybrid-weight');
    expect(control).toHaveTextContent('Hybrid Boost Weight: 1.00x');
    expect(control).toHaveTextContent('Pure Vector');
    expect(control).toHaveTextContent('Default');
    expect(control).toHaveTextContent('Heavy Lexical');
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '1.00x, default');
    expect(screen.getByRole('slider')).toHaveAttribute('min', '0');
    expect(screen.getByRole('slider')).toHaveAttribute('max', '2');
    // The control comes before the chart.
    const root = screen.getByTestId('retrieval-map-view');
    expect(root.firstElementChild).toBe(control);
  });

  it('re-ranks the passage cards live and shows how far each moved', async () => {
    await load();
    expect(order()).toEqual(['Rank 1: Doc 2 page 2', 'Rank 2: Doc 1 page 1']);
    expect(screen.queryByTestId('rank-move-1')).toBeNull();

    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } });
    expect(screen.getByTestId('hybrid-weight-value')).toHaveTextContent('0.00x');
    expect(order()).toEqual(['Rank 1: Doc 1 page 1', 'Rank 2: Doc 2 page 2']);
    expect(screen.getByTestId('rank-move-1')).toHaveTextContent('1');
    expect(screen.getByTestId('rank-move-1')).toHaveAttribute('aria-label', expect.stringContaining('Moved up'));
    expect(screen.getByTestId('rank-move-2')).toHaveAttribute('aria-label', expect.stringContaining('Moved down'));
    // Pure vector: the boosted chunk is back to its raw cosine.
    expect(screen.getByTestId('passage-score-2')).toHaveTextContent('0.400');
  });

  it('recomputes the score as raw + alpha * (final - raw)', async () => {
    await load();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0.5' } });
    expect(screen.getByTestId('passage-score-2')).toHaveTextContent('0.550'); // 0.4 + 0.5 * 0.3
    fireEvent.change(screen.getByRole('slider'), { target: { value: '2' } });
    expect(screen.getByTestId('passage-score-2')).toHaveTextContent('1.000'); // 0.4 + 2 * 0.3
    expect(screen.getByTestId('passage-score-1')).toHaveTextContent('0.620'); // no keyword match: unchanged
  });

  it('resets to the default weight', async () => {
    await load();
    const reset = screen.getByRole('button', { name: 'Reset' });
    expect(reset).toBeDisabled();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } });
    fireEvent.click(reset);
    expect(screen.getByTestId('hybrid-weight-value')).toHaveTextContent('1.00x');
    expect(order()[0]).toBe('Rank 1: Doc 2 page 2');
  });

  it('is disabled, with a hint, when nothing has been scored against a question', async () => {
    vi.mocked(api.getRetrievalMap).mockResolvedValueOnce({ ...response, question: null, retrieved_chunk_ids: [], chunks: response.chunks.map((c) => ({ ...c, raw_cosine: null, score: null, is_retrieved: false })) });
    render(<RetrievalMapView subjectId="sub" />);
    await screen.findByTestId('retrieval-map-view');
    expect(screen.getByRole('slider')).toBeDisabled();
    expect(screen.getByTestId('hybrid-weight')).toHaveTextContent('Ask a question');
  });
});

describe('Stacked score bars', () => {
  it('stacks the keyword boost on the raw cosine, with an accessible description and keyword pills', async () => {
    await load();
    const card = screen.getByTestId('retrieved-passage-row-2');
    const bar = within(card).getByRole('img', { name: /Raw cosine 0\.400 plus keyword boost 0\.300 equals 0\.700/ });
    expect(bar).toBeInTheDocument();
    const raw = card.querySelector('.score-bar-raw') as HTMLElement;
    const boost = card.querySelector('.score-bar-boost') as HTMLElement;
    expect(raw.style.width).toBe('40%');
    expect(boost.style.left).toBe('40%');
    expect(parseFloat(boost.style.width)).toBeCloseTo(30);
    expect(within(card).getByText('exam')).toHaveClass('term-chip');
    expect(card.querySelector('.score-bar-threshold')).toHaveAttribute('title', 'Support threshold 0.25');
  });

  it('shows no boost segment for a chunk without keyword matches, and shrinks the boost as the weight falls', async () => {
    await load();
    const noBoost = screen.getByTestId('retrieved-passage-row-1');
    expect(parseFloat((noBoost.querySelector('.score-bar-boost') as HTMLElement).style.width)).toBeCloseTo(0);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } });
    const card = screen.getByTestId('retrieved-passage-row-2');
    expect(parseFloat((card.querySelector('.score-bar-boost') as HTMLElement).style.width)).toBeCloseTo(0);
    expect(within(card).getByRole('img')).toHaveAccessibleName(/keyword boost 0\.000 equals 0\.400/);
  });
});

describe('Chunk card and 2D PCA dot are linked', () => {
  it('highlights the dot while its card is hovered, and the card while its dot is hovered', async () => {
    await load();
    const card = screen.getByTestId('retrieved-passage-row-2');
    const dot = screen.getByTestId('chunk-dot-2');
    expect(dot).not.toHaveClass('hovered');

    fireEvent.mouseEnter(card);
    expect(dot).toHaveClass('hovered');
    expect(screen.getByTestId('chunk-dot-1')).not.toHaveClass('hovered');
    fireEvent.mouseLeave(card);
    expect(dot).not.toHaveClass('hovered');

    fireEvent.mouseEnter(screen.getByTestId('chunk-dot-1'));
    expect(screen.getByTestId('retrieved-passage-row-1')).toHaveClass('linked');
    expect(card).not.toHaveClass('linked');
    fireEvent.mouseLeave(screen.getByTestId('chunk-dot-1'));
    expect(screen.getByTestId('retrieved-passage-row-1')).not.toHaveClass('linked');
  });

  it('makes the hovered dot larger', async () => {
    await load();
    // The last circle of a dot is the point itself; the others are halos around it.
    const pointRadius = () => {
      const circles = screen.getByTestId('chunk-dot-1').querySelectorAll('circle');
      return Number(circles[circles.length - 1].getAttribute('r'));
    };
    const before = pointRadius(); // chunk 2 is auto-selected as the top result, so use the other dot
    fireEvent.mouseEnter(screen.getByTestId('retrieved-passage-row-1'));
    expect(pointRadius()).toBeGreaterThan(before);
  });

  it('hovering a dot scrolls its card into view inside the scrolling container only', async () => {
    await load();
    const card = screen.getByTestId('retrieved-passage-row-2');
    // Make the card's grandparent the scroller, with the card far below its visible area.
    const scroller = card.parentElement!.parentElement as HTMLElement;
    scroller.style.overflowY = 'auto';
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 100 });
    scroller.getBoundingClientRect = () => ({ top: 0, bottom: 100, left: 0, right: 300, width: 300, height: 100, x: 0, y: 0, toJSON: () => ({}) });
    card.getBoundingClientRect = () => ({ top: 500, bottom: 560, left: 0, right: 300, width: 300, height: 60, x: 0, y: 500, toJSON: () => ({}) });
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView; // would also scroll clipped ancestors, so it must stay unused
    fireEvent.mouseEnter(screen.getByTestId('chunk-dot-2'));
    await waitFor(() => expect(scroller.scrollTop).toBeGreaterThan(0));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('does not scroll when the highlight started from the card itself', async () => {
    await load();
    const card = screen.getByTestId('retrieved-passage-row-2');
    const scroller = card.parentElement!.parentElement as HTMLElement;
    scroller.style.overflowY = 'auto';
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 100 });
    card.getBoundingClientRect = () => ({ top: 500, bottom: 560, left: 0, right: 300, width: 300, height: 60, x: 0, y: 500, toJSON: () => ({}) });
    fireEvent.mouseEnter(card);
    expect(screen.getByTestId('chunk-dot-2')).toHaveClass('hovered');
    expect(scroller.scrollTop).toBe(0);
  });

  it('selects the card when its dot is clicked', async () => {
    await load();
    fireEvent.click(screen.getByTestId('chunk-dot-1'));
    await waitFor(() => expect(screen.getByTestId('retrieved-passage-row-1')).toHaveClass('selected'));
  });

  it('supports the keyboard: focus lights the pair, Enter selects', async () => {
    await load();
    const dot = screen.getByTestId('chunk-dot-2');
    fireEvent.focus(dot);
    expect(screen.getByTestId('retrieved-passage-row-2')).toHaveClass('linked');
    fireEvent.keyDown(dot, { key: 'Enter' });
    expect(screen.getByTestId('retrieved-passage-row-2')).toHaveClass('selected');
    fireEvent.blur(dot);
    expect(screen.getByTestId('retrieved-passage-row-2')).not.toHaveClass('linked');
  });
});
