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
    const pane = await screen.findByTestId('passage-pane');
    await waitFor(() => expect(within(pane).getByText(chunk)).toBeInTheDocument());
    expect(within(pane).getAllByText('Retrieved for this answer')).toHaveLength(1);
    expect(within(pane).queryByText('Cited Passage Match')).toBeNull();
    expect(pane.querySelectorAll('.passage-chunk-highlighted')).toHaveLength(1);
    expect(pane.querySelector('.passage-chunk-highlighted')).toHaveTextContent(chunk);
    expect(within(pane).getByText(/Citations point to a page, not a sentence/)).toBeInTheDocument();
  });

  it('exposes citation chips as pressed toggles that control the panel', async () => {
    vi.spyOn(api, 'getPassages').mockResolvedValue([]);
    render(view());
    const chip = screen.getByTestId('citation-chip-0');
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(chip).toHaveAttribute('aria-controls', 'workspace-inspector-panel');
    fireEvent.click(chip);
    await waitFor(() => expect(screen.getByTestId('citation-chip-0')).toHaveAttribute('aria-pressed', 'true'));
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
});
