import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SubjectWorkspaceView } from './components/SubjectWorkspaceView';
import { api } from './api';
import { MessageItem, Source, Subject } from './types';

const subject: Subject = {
  id: 'ev', name: 'Evidence notebook', course_code: 'EV 1',
  settings: { response_length: 'default', response_style: 'general' }, is_archived: false,
  source_count: 2, created_at: '2026-10-12', updated_at: '2026-10-12',
};
const mkSource = (id: string, file: string): Source => ({
  id, subject_id: subject.id, user_id: 'g', title: file, file_name: file, source_type: 'pdf', status: 'ready',
  version: 1, page_count: 3, word_count: 50, created_at: '2026-10-12', updated_at: '2026-10-12',
});
const sources = [mkSource('a', 'a.pdf'), mkSource('b', 'b.pdf')];
const chunk = 'The final exam is worth 40% of the grade.';
const message: MessageItem = {
  id: 'm', conversation_id: 'c', user_id: 'g', role: 'assistant',
  content: 'Exam is 40% [a.pdf p.2] and quizzes count [b.pdf p.1].',
  citations: [
    { file: 'a.pdf', page: 2, source_id: 'a', source_version: 1 },
    { file: 'b.pdf', page: 1, source_id: 'b', source_version: 1 },
  ],
  conflicts: [{ topic: 'Exam weight', claims: [{ file: 'a.pdf', page: 2, value: '40%' }, { file: 'b.pdf', page: 1, value: '50%' }] }],
  conflict_detected: true, abstained: false,
  retrieved: [{ source_id: 'a', file_name: 'a.pdf', page_number: 2, text: chunk, score: 0.8 }],
  selected_source_ids: ['a', 'b'], source_versions: { a: 1, b: 1 },
  tokens: { input: 1, output: 1, total: 2 }, latency: 0, created_at: '2026-10-12',
};
const done = async () => {};
const view = () => (
  <SubjectWorkspaceView subject={subject} sources={sources} selectedSourceIds={['a', 'b']}
    conversations={[]} notes={[]} activeConversationId={null} starterQuestions={[]} isDemoMode={false}
    onBackToDashboard={vi.fn()} onSelectSources={vi.fn()} onSelectConversation={vi.fn()}
    onCreateConversation={done} onRenameConversation={done} onDeleteConversation={done}
    onUploadFiles={done} onPasteText={done} onAddUrl={done} onRenameSource={done}
    onDeleteSource={done} onRetrySource={done} onReplaceSource={done} onSendMessage={done}
    onUpdateSettings={done} onCreateNote={done} onSaveAnswerAsNote={done}
    onUpdateNote={done} onDeleteNote={done} messages={[message]} chatLoading={false} />
);
const originalWidth = window.innerWidth;
beforeEach(() => { window.innerWidth = 1440; });
afterEach(() => { window.innerWidth = originalWidth; vi.restoreAllMocks(); });

describe('Evidence panel', () => {
  it('marks only the retrieved passage and states that citations are page-level', async () => {
    vi.spyOn(api, 'getPassages').mockResolvedValue([
      { file_name: 'a.pdf', page_number: 2, chunk_index: 0, text: 'Unrelated syllabus text.' },
      { file_name: 'a.pdf', page_number: 2, chunk_index: 1, text: chunk },
    ]);
    render(view());
    fireEvent.click(screen.getByTestId('citation-chip-0'));
    const pane = await screen.findByTestId('inline-evidence');
    await waitFor(() => expect(within(pane).getByText(chunk)).toBeInTheDocument());
    expect(within(pane).getAllByText('Retrieved for this answer')).toHaveLength(1);
    expect(within(pane).queryByText('Cited Passage Match')).toBeNull();
    expect(pane.querySelectorAll('.passage-chunk-highlighted')).toHaveLength(1);
    expect(pane.querySelector('.passage-chunk-highlighted')).toHaveTextContent(chunk);
    expect(within(pane).getByText(/Citations point to a page, not a sentence/)).toBeInTheDocument();
  });

  it('exposes citation chips as pressed toggles that control the evidence under the answer', async () => {
    vi.spyOn(api, 'getPassages').mockResolvedValue([]);
    render(view());
    const chip = screen.getByTestId('citation-chip-0');
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(chip).not.toHaveAttribute('aria-controls');
    fireEvent.click(chip);
    await waitFor(() => expect(screen.getByTestId('citation-chip-0')).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByTestId('citation-chip-0')).toHaveAttribute('aria-controls', screen.getByTestId('inline-evidence').id);
  });

  it('lets keyboard users open a conflict claim with Enter and Space', async () => {
    const spy = vi.spyOn(api, 'getPassages').mockResolvedValue([]);
    render(view());
    const claim = screen.getByRole('button', { name: /Claim: 50% in b\.pdf page 1/ });
    fireEvent.keyDown(claim, { key: 'Enter' });
    await waitFor(() => expect(spy).toHaveBeenCalledWith('b.pdf', 1));
    fireEvent.keyDown(screen.getByRole('button', { name: /Claim: 40% in a\.pdf page 2/ }), { key: ' ' });
    await waitFor(() => expect(spy).toHaveBeenCalledWith('a.pdf', 2));
  });

  it('ignores a stale passage response when a newer citation was opened', async () => {
    let releaseA: (v: any) => void = () => {};
    const pendingA = new Promise<any>((resolve) => { releaseA = resolve; });
    vi.spyOn(api, 'getPassages').mockImplementation((file: string) =>
      file === 'a.pdf' ? pendingA : Promise.resolve([{ file_name: 'b.pdf', page_number: 1, chunk_index: 0, text: 'B text' }]));
    render(view());
    fireEvent.click(screen.getByTestId('citation-chip-0'));
    fireEvent.click(screen.getByTestId('citation-chip-1'));
    await waitFor(() => expect(screen.getByText('B text')).toBeInTheDocument());
    releaseA([{ file_name: 'a.pdf', page_number: 2, chunk_index: 0, text: 'Stale A text' }]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Stale A text')).toBeNull();
  });

  it('shows the evidence directly beneath its answer, with real file, page and passage text', async () => {
    vi.spyOn(api, 'getPassages').mockResolvedValue([{ file_name: 'a.pdf', page_number: 2, chunk_index: 1, text: chunk }]);
    render(view());
    fireEvent.click(screen.getByTestId('citation-chip-0'));
    const evidence = await screen.findByTestId('inline-evidence');
    const answer = screen.getByTestId('answer-view');
    expect(answer.contains(evidence)).toBe(true);
    const chips = answer.querySelector('.chips-row')!;
    const actions = answer.querySelector('.answer-action-toolbar')!;
    expect(chips.compareDocumentPosition(evidence) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(evidence.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(evidence.querySelector('.passage-doc-title')).toHaveTextContent('a.pdf');
    expect(within(evidence).getByText('Page 2')).toBeInTheDocument();
    await waitFor(() => expect(within(evidence).getByText(chunk)).toBeInTheDocument());
    expect(evidence.querySelector('mark')).toBeNull();
  });

  it('collapses on Close and on Escape, and returns focus to the citation that opened it', async () => {
    vi.spyOn(api, 'getPassages').mockResolvedValue([]);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(view());
      const chip = screen.getByTestId('citation-chip-0');
      chip.focus();
      fireEvent.click(chip);
      await screen.findByTestId('inline-evidence');
      fireEvent.click(screen.getByRole('button', { name: 'Close evidence' }));
      vi.advanceTimersByTime(10);
      expect(screen.queryByTestId('inline-evidence')).toBeNull();
      expect(screen.getByTestId('citation-chip-0')).toHaveFocus();

      const chip1 = screen.getByTestId('citation-chip-1');
      chip1.focus();
      fireEvent.click(chip1);
      const evidence = await screen.findByTestId('inline-evidence');
      fireEvent.keyDown(evidence, { key: 'Escape' });
      vi.advanceTimersByTime(10);
      expect(screen.queryByTestId('inline-evidence')).toBeNull();
      expect(screen.getByTestId('citation-chip-1')).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });

  it('steps between the answer\'s citations without losing the original opener', async () => {
    vi.spyOn(api, 'getPassages').mockResolvedValue([]);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(view());
      const chip = screen.getByTestId('citation-chip-0');
      chip.focus();
      fireEvent.click(chip);
      const evidence = await screen.findByTestId('inline-evidence');
      expect(within(evidence).getByText('1/2')).toBeInTheDocument();
      fireEvent.click(within(evidence).getByRole('button', { name: 'Next citation' }));
      await waitFor(() => expect(within(screen.getByTestId('inline-evidence')).getByText('2/2')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'Close evidence' }));
      vi.advanceTimersByTime(10);
      expect(screen.getByTestId('citation-chip-0')).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows selected-source details in the materials panel while the passage stays under the answer', async () => {
    vi.spyOn(api, 'getPassages').mockResolvedValue([]);
    render(view());
    expect(screen.queryByTestId('selected-source-card')).toBeNull();
    fireEvent.click(screen.getByTestId('citation-chip-1'));
    const card = await screen.findByTestId('selected-source-card');
    const panel = screen.getByRole('complementary', { name: 'Sources' });
    expect(panel.contains(card)).toBe(true);
    expect(within(card).getAllByText('b.pdf').length).toBeGreaterThan(0);
    expect(within(card).getByText('Cited page')).toBeInTheDocument();
    expect(within(card).getByText('v1')).toBeInTheDocument();
    expect(within(card).queryByTestId('passage-content')).toBeNull(); // passage is inline, not duplicated
    expect(screen.getAllByTestId('passage-content')).toHaveLength(1);
    fireEvent.click(within(card).getByRole('button', { name: 'Clear' }));
    expect(screen.queryByTestId('selected-source-card')).toBeNull();
    expect(screen.queryByTestId('inline-evidence')).toBeNull();
  });

  it('shows the passage in the panel for a note citation that has no answer on screen', async () => {
    vi.spyOn(api, 'getPassages').mockResolvedValue([{ file_name: 'a.pdf', page_number: 2, chunk_index: 0, text: 'Note-cited passage text.' }]);
    const note = { id: 'n1', subject_id: subject.id, user_id: 'g', title: 'My note', content: 'body', is_saved_answer: false,
      citations: [{ file: 'a.pdf', page: 2, source_id: 'a', source_version: 1 }], created_at: '2026-10-12', updated_at: '2026-10-12' };
    const base = view();
    render({ ...base, props: { ...base.props, notes: [note], messages: [] } });
    fireEvent.click(screen.getByRole('button', { name: /^Notes/ }));
    fireEvent.click(await screen.findByTestId('note-citation-chip-0'));
    const card = await screen.findByTestId('selected-source-card');
    expect(screen.queryByTestId('inline-evidence')).toBeNull();
    await waitFor(() => expect(within(card).getByText('Note-cited passage text.')).toBeInTheDocument());
  });
});
