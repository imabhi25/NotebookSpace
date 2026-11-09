import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { buildTelemetry, crossSourceCheck, isGrounded, topScoreOf } from './answerTelemetry';
import { AnswerTelemetryStrip } from './components/AnswerTelemetry';
import { CrossSourceCheck } from './components/CrossSourceCheck';
import { MessageItem } from './types';

const base: MessageItem = {
  id: 'm', conversation_id: 'c', user_id: 'u', role: 'assistant', content: 'Late work loses 10% per day [syllabus.pdf p.2].',
  citations: [{ file: 'syllabus.pdf', page: 2, source_id: 'a', source_version: 1, excerpt: 'Late Policy: assignments lose 10 percent per day.' }],
  conflicts: [], conflict_detected: false, abstained: false,
  retrieved: [
    { id: 1, source_id: 'a', file_name: 'syllabus.pdf', page_number: 2, text: 'Late Policy: assignments lose 10 percent per day.', score: 0.712, similarity_score: 0.712, matched_terms: ['late'] },
    { id: 2, source_id: 'a', file_name: 'syllabus.pdf', page_number: 1, text: 'Welcome.', score: 0.31, similarity_score: 0.31, matched_terms: [] },
  ],
  selected_source_ids: ['a'], source_versions: { a: 1 }, tokens: { input: 1, output: 1, total: 2 }, latency: 1, created_at: '2026-11-09',
};

describe('topScoreOf', () => {
  it('is exact when no keyword matched: the score is the raw cosine', () => {
    expect(topScoreOf([{ score: 0.55, matched_terms: [] }])).toEqual({ score: 0.55, raw: 0.55, boost: 0, kind: 'vector' });
  });
  it('estimates raw as score minus the boost when a keyword matched', () => {
    const t = topScoreOf(base.retrieved)!;
    expect(t.kind).toBe('estimated');
    expect(t.raw).toBeCloseTo(0.412);
    expect(t.boost).toBeCloseTo(0.3);
  });
  it('does not guess a raw value when the floor or the cap hid it', () => {
    expect(topScoreOf([{ score: 1, matched_terms: ['x'] }])?.kind).toBe('boosted');
    expect(topScoreOf([{ score: 0.4, matched_terms: ['x'] }])?.raw).toBeNull();
  });
  it('picks the highest score and reads similarity_score when score is missing', () => {
    expect(topScoreOf([{ similarity_score: 0.2 }, { similarity_score: 0.6 }])?.score).toBe(0.6);
    expect(topScoreOf([])).toBeNull();
    expect(topScoreOf(undefined)).toBeNull();
  });
});

describe('buildTelemetry and isGrounded', () => {
  it('counts retrieved chunks and verified citations from the saved response', () => {
    const t = buildTelemetry(base);
    expect(t.model).toBe('ONNX MiniLM-L6-v2');
    expect(t.chunks).toBe(2);
    expect(t.citations).toBe(1);
  });
  it('treats an answer as grounded only when it is not an abstention and it cites something', () => {
    expect(isGrounded(base)).toBe(true);
    expect(isGrounded({ ...base, abstained: true })).toBe(false);
    expect(isGrounded({ ...base, citations: [] })).toBe(false);
    expect(isGrounded({ ...base, role: 'user' })).toBe(false);
  });
});

describe('AnswerTelemetryStrip', () => {
  it('shows model, chunks, top score with its raw + boost split, and verified citations', () => {
    render(<AnswerTelemetryStrip telemetry={buildTelemetry(base)} />);
    const strip = screen.getByTestId('answer-telemetry');
    expect(within(strip).getByTestId('telemetry-model')).toHaveTextContent('ONNX MiniLM-L6-v2');
    expect(within(strip).getByTestId('telemetry-chunks')).toHaveTextContent('2 chunks retrieved');
    expect(within(strip).getByTestId('telemetry-score')).toHaveTextContent('Top Score: 0.712 (raw ≈0.412 + 0.30 boost)');
    expect(within(strip).getByTestId('telemetry-citations')).toHaveTextContent('1 Verified Citation');
  });
  it('is exact for a vector-only top score, and omits what the response did not record', () => {
    render(<AnswerTelemetryStrip telemetry={buildTelemetry({ citations: base.citations, retrieved: [] })} />);
    expect(screen.queryByTestId('telemetry-chunks')).toBeNull();
    expect(screen.queryByTestId('telemetry-score')).toBeNull();
    expect(screen.getByTestId('telemetry-citations')).toHaveTextContent('1 Verified Citation');
  });
});

describe('crossSourceCheck', () => {
  const second = { file: 'announcement_week4.md', page: 1, source_id: 'b', source_version: 1, excerpt: 'Update: the late penalty is now 5 percent per day.' };
  it('is absent for an answer on one source with no conflict', () => {
    expect(crossSourceCheck(base)).toBeNull();
  });
  it('appears when two distinct sources are cited', () => {
    const c = crossSourceCheck({ ...base, citations: [...base.citations, second] })!;
    expect(c.status).toBe('multi');
    expect(c.sources.map((s) => s.file)).toEqual(['syllabus.pdf', 'announcement_week4.md']);
    expect(c.sources[0].pages).toEqual([2]);
  });
  it('upgrades the wording when a multi-source answer mentions an update, but a cue alone is not enough', () => {
    const multi = { ...base, citations: [...base.citations, second] };
    expect(crossSourceCheck({ ...multi, content: 'The policy was updated, so the late penalty is now 5%.' })?.status).toBe('update');
    expect(crossSourceCheck({ ...base, content: 'However, the policy was updated.' })).toBeNull();
  });
  it('is a conflict whenever the backend flagged one, even on a single cited source', () => {
    const c = crossSourceCheck({
      ...base, conflict_detected: true,
      conflicts: [{ topic: 'Late penalty', claims: [
        { file: 'syllabus.pdf', page: 2, value: '10% per day', source_id: 'a' },
        { file: 'announcement_week4.md', page: 1, value: '5% per day', source_id: 'b' },
      ] }],
    })!;
    expect(c.status).toBe('conflict');
    expect(c.sources).toHaveLength(2);
    expect(c.topics).toEqual(['Late penalty']);
    expect(c.sources.find((s) => s.file === 'announcement_week4.md')?.claims[0]).toMatchObject({ value: '5% per day', page: 1 });
  });
  it('merges the same source cited twice and never fires for an abstention', () => {
    const twice = { ...base, citations: [...base.citations, { ...base.citations[0], page: 4 }] };
    expect(crossSourceCheck(twice)).toBeNull();
    expect(crossSourceCheck({ ...twice, citations: [...twice.citations, second], abstained: true })).toBeNull();
  });
});

describe('CrossSourceCheck', () => {
  const check = crossSourceCheck({
    ...base, citations: [...base.citations, { file: 'announcement_week4.md', page: 1, source_id: 'b', source_version: 1, excerpt: 'Update: the late penalty is now 5 percent per day.' }],
    conflict_detected: true,
    conflicts: [{ topic: 'Late penalty', claims: [
      { file: 'syllabus.pdf', page: 2, value: '10% per day', source_id: 'a' },
      { file: 'announcement_week4.md', page: 1, value: '5% per day', source_id: 'b' },
    ] }],
  })!;

  it('contrasts the sources side by side under a high-visibility heading', () => {
    render(<CrossSourceCheck check={check} onOpen={vi.fn()} />);
    const region = screen.getByRole('region', { name: 'Cross-Source Evidence Check' });
    expect(region).toHaveAttribute('data-status', 'conflict');
    expect(within(region).getByText('These documents disagree')).toBeInTheDocument();
    expect(within(region).getByText('Conflict Topic: Late penalty')).toBeInTheDocument();
    const cards = within(region).getAllByTestId('cross-source-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('syllabus.pdf');
    expect(cards[0]).toHaveTextContent('10% per day');
    expect(cards[1]).toHaveTextContent('announcement_week4.md');
    expect(cards[1]).toHaveTextContent('5% per day');
  });

  it('opens the evidence for a claim or a source', () => {
    const onOpen = vi.fn();
    render(<CrossSourceCheck check={check} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /Claim: 5% per day in announcement_week4\.md page 1/ }));
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ file: 'announcement_week4.md', page: 1 }));
    fireEvent.click(screen.getAllByRole('button', { name: /View evidence/ })[0]);
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ file: 'syllabus.pdf' }));
  });

  it('is a calmer multi-source card when nothing conflicts', () => {
    const multi = crossSourceCheck({ ...base, citations: [...base.citations, { file: 'notes.md', page: 1, source_id: 'c' }] })!;
    render(<CrossSourceCheck check={multi} onOpen={vi.fn()} />);
    expect(screen.getByTestId('cross-source-check')).toHaveAttribute('data-status', 'multi');
    expect(screen.getByText(/No contradiction was flagged/)).toBeInTheDocument();
  });
});

describe('crossSourceCheck: one source arriving with and without an id', () => {
  it('does not split a source into two cards when a conflict claim lacks the source id', () => {
    const c = crossSourceCheck({
      ...base, citations: [base.citations[0], { file: 'announcement_week4.md', page: 1, source_id: 'b' }], conflict_detected: true,
      conflicts: [{ topic: 'Late penalty', claims: [{ file: 'syllabus.pdf', page: 2, value: '10%' }, { file: 'announcement_week4.md', page: 1, value: '5%' }] }],
    })!;
    expect(c.sources.map((s) => s.file)).toEqual(['syllabus.pdf', 'announcement_week4.md']);
    expect(c.sources[0].claims).toHaveLength(1);
  });
});
