import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SubjectWorkspaceView } from './components/SubjectWorkspaceView';
import { api } from './api';
import { MessageItem, RetrievalMapResponse, Source, Subject } from './types';

// These tests use mocked API calls (vi.spyOn on `api`); none touches a real backend.
const subject: Subject = {
  id: 'ev', name: 'Evidence notebook', course_code: 'EV 1',
  settings: { response_length: 'default', response_style: 'general' }, is_archived: false,
  source_count: 2, created_at: '2026-10-12', updated_at: '2026-10-12',
};
const LONG = 'CS3101_Advanced_Algorithms_Lecture_Schedule_and_Reading_List_Fall_2026_Final_Revised_Version.pdf';
const mkSource = (id: string, file: string, version = 1): Source => ({
  id, subject_id: subject.id, user_id: 'g', title: file, file_name: file, source_type: 'pdf', status: 'ready',
  version, page_count: 3, word_count: 50, created_at: '2026-10-12', updated_at: '2026-10-12',
});
const chunk = 'The final exam is worth 40% of the grade.';
const message: MessageItem = {
  id: 'm', conversation_id: 'c', user_id: 'g', role: 'assistant',
  content: 'Exam is 40% [a.pdf p.2] and quizzes count [b.pdf p.1].',
  citations: [
    { file: 'a.pdf', page: 2, source_id: 'a', source_version: 1, excerpt: chunk },
    { file: 'b.pdf', page: 1, source_id: 'b', source_version: 1, excerpt: 'Quizzes are 10%.' },
  ],
  conflicts: [], conflict_detected: false, abstained: false,
  retrieved: [{ source_id: 'a', file_name: 'a.pdf', page_number: 2, text: chunk, score: 0.8 }],
  selected_source_ids: ['a', 'b'], source_versions: { a: 1, b: 1 },
  tokens: { input: 1, output: 1, total: 2 }, latency: 0, created_at: '2026-10-12',
};
const done = async () => {};
const view = (sources: Source[], notes: any[] = []) => (
  <SubjectWorkspaceView subject={subject} sources={sources} selectedSourceIds={sources.map((s) => s.id)}
    conversations={[]} notes={notes} activeConversationId={null} starterQuestions={[]} isDemoMode={false}
    onBackToDashboard={vi.fn()} onSelectSources={vi.fn()} onSelectConversation={vi.fn()}
    onCreateConversation={done} onRenameConversation={done} onDeleteConversation={done}
    onUploadFiles={done} onPasteText={done} onAddUrl={done} onRenameSource={done}
    onDeleteSource={done} onRetrySource={done} onReplaceSource={done} onSendMessage={done}
    onUpdateSettings={done} onCreateNote={done} onSaveAnswerAsNote={done}
    onUpdateNote={done} onDeleteNote={done} messages={[message]} chatLoading={false} />
);
const originalWidth = window.innerWidth;
beforeEach(() => { window.innerWidth = 1440; window.localStorage.clear(); });
afterEach(() => { window.innerWidth = originalWidth; vi.restoreAllMocks(); });

describe('Evidence after sources change (mocked API)', () => {
  it('a replaced source shows the captured excerpt as historical and never fetches the new version', async () => {
    const spy = vi.spyOn(api, 'getPassages').mockResolvedValue([
      { file_name: 'a.pdf', page_number: 2, chunk_index: 0, text: 'NEW VERSION TEXT' }]);
    render(view([mkSource('a', 'a.pdf', 2), mkSource('b', 'b.pdf')]));
    fireEvent.click(screen.getByRole('button', { name: /^Citation 1:/ }));
    const evidence = await screen.findByTestId('inline-evidence');
    expect(within(evidence).getByTestId('historical-citation-alert')).toHaveTextContent(/Source Replaced \(v1\)/);
    expect(within(evidence).getByText(chunk)).toBeInTheDocument();
    expect(screen.queryByText('NEW VERSION TEXT')).toBeNull();
    expect(spy).not.toHaveBeenCalledWith('a.pdf', 2, expect.anything(), expect.anything());
    expect(within(screen.getByTestId('selected-source-card')).getByText(/Source Replaced/)).toBeInTheDocument();
  });

  it('a deleted source shows a removed notice and its captured excerpt, not another source', async () => {
    const spy = vi.spyOn(api, 'getPassages').mockResolvedValue([]);
    render(view([mkSource('a', 'a.pdf')])); // b.pdf is gone
    fireEvent.click(screen.getByRole('button', { name: /^Citation 2:/ }));
    const evidence = await screen.findByTestId('inline-evidence');
    expect(within(evidence).getByTestId('historical-citation-alert')).toHaveTextContent(/Original Source Removed/);
    expect(within(evidence).getByText('Quizzes are 10%.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalledWith('b.pdf', expect.anything(), expect.anything(), expect.anything());
    const card = screen.getByTestId('selected-source-card');
    expect(within(card).getByText(/Original Source Removed/)).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Open source ↗' })).toBeNull();
  });

  it('steps between a live source and a removed one without mixing their text', async () => {
    vi.spyOn(api, 'getPassages').mockResolvedValue([{ file_name: 'a.pdf', page_number: 2, chunk_index: 0, text: 'Live a.pdf passage' }]);
    render(view([mkSource('a', 'a.pdf')]));
    fireEvent.click(screen.getByRole('button', { name: /^Citation 1:/ }));
    await screen.findByText('Live a.pdf passage');
    fireEvent.click(screen.getByRole('button', { name: 'Next citation' }));
    await waitFor(() => expect(within(screen.getByTestId('inline-evidence')).getByTestId('historical-citation-alert')).toBeInTheDocument());
    expect(screen.queryByText('Live a.pdf passage')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Previous citation' }));
    await screen.findByText('Live a.pdf passage');
    expect(screen.queryByTestId('historical-citation-alert')).toBeNull();
  });

  it('never looks up a file that is not among the notebook\'s sources', async () => {
    const spy = vi.spyOn(api, 'getPassages').mockResolvedValue([{ file_name: 'ghost.pdf', page_number: 1, chunk_index: 0, text: 'Someone else\'s ghost text' }]);
    const note = { id: 'n1', subject_id: subject.id, user_id: 'g', title: 'Old note', content: 'x', is_saved_answer: false,
      citations: [{ file: 'ghost.pdf', page: 1 }], created_at: '2026-10-12', updated_at: '2026-10-12' };
    render(view([mkSource('a', 'a.pdf')], [note]));
    fireEvent.click(screen.getByRole('button', { name: /^Notes/ }));
    fireEvent.click(await screen.findByTestId('note-citation-chip-0'));
    const card = await screen.findByTestId('selected-source-card');
    expect(within(card).getByText(/not among the notebook.s current sources/)).toBeInTheDocument();
    expect(within(card).getByText('No text chunks found for this page.')).toBeInTheDocument();
    expect(screen.queryByText(/ghost text/)).toBeNull();
    expect(spy).not.toHaveBeenCalledWith('ghost.pdf', expect.anything(), expect.anything(), expect.anything());
  });

  it('scopes every passage lookup to this notebook and source', async () => {
    const spy = vi.spyOn(api, 'getPassages').mockResolvedValue([]);
    render(view([mkSource('a', 'a.pdf'), mkSource('b', 'b.pdf')]));
    fireEvent.click(screen.getByRole('button', { name: /^Citation 2:/ }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith('b.pdf', 1, 'ev', 'b'));
  });
});

describe('Retrieval map inside the materials panel (mocked API)', () => {
  const map: RetrievalMapResponse = {
    subject_id: 'ev', question: 'q', query_position: { x: 0, y: 0, z: 0 }, abstained: false, abstain_reason: null,
    support_min_score: 0.3, retrieved_chunk_ids: [1, 2],
    chunks: [
      { id: 1, source_id: 'a', file_name: 'a.pdf', title: 'a.pdf', page_number: 2, chunk_index: 0, text: chunk, position: { x: 0.1, y: 0.1, z: 0 }, raw_cosine: 0.8, score: 0.82, matched_terms: ['exam'], is_retrieved: true },
      { id: 2, source_id: 'c', file_name: LONG, title: LONG, page_number: 3, chunk_index: 1, text: 'Week 12 review.', position: { x: 0.4, y: 0.2, z: 0 }, raw_cosine: 0.5, score: 0.5, matched_terms: [], is_retrieved: true },
      { id: 3, source_id: 'a', file_name: 'a.pdf', title: 'a.pdf', page_number: 1, chunk_index: 0, text: 'Unrelated.', position: { x: -0.4, y: 0.2, z: 0 }, raw_cosine: 0.1, score: 0.1, matched_terms: [], is_retrieved: false },
    ],
  };

  it('lists retrieved passages, selects one, and returns to the study panel with its card, then back to Retrieval', async () => {
    vi.spyOn(api, 'getRetrievalMap').mockResolvedValue(map);
    vi.spyOn(api, 'getPassages').mockResolvedValue([{ file_name: LONG, page_number: 3, chunk_index: 1, text: 'Week 12 review.' }]);
    render(view([mkSource('a', 'a.pdf'), mkSource('c', LONG)]));
    fireEvent.click(screen.getByTestId('see-retrieval-btn-m'));
    await screen.findByTestId('retrieval-map-view');
    expect(screen.getByRole('complementary', { name: 'Study panel' })).toBeVisible();
    const rows = screen.getAllByTestId(/retrieved-passage-row-/);
    expect(rows).toHaveLength(2);
    fireEvent.click(screen.getByTestId('retrieved-passage-row-2'));
    expect(screen.getByTestId('retrieval-inspector')).toHaveTextContent(LONG);
    fireEvent.click(screen.getByRole('button', { name: /Show passage and source/ }));

    const panel = await screen.findByRole('complementary', { name: 'Study panel' });
    const card = within(panel).getByTestId('selected-source-card');
    expect(card).toHaveTextContent(LONG);
    expect(within(card).getByRole('heading', { level: 3 })).toHaveTextContent('Page 3');
    await waitFor(() => expect(within(card).getByText('Week 12 review.')).toBeInTheDocument());
    expect(screen.getByTestId('inline-evidence')).toBeInTheDocument();
    expect(screen.getByTestId('inline-evidence')).toHaveFocus();
    expect(screen.getByRole('button', { name: /^Evidence$/, pressed: true })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show retrieval diagnostics' }));
    await screen.findByTestId('retrieval-map-view');
    expect(screen.getAllByTestId(/retrieved-passage-row-/)).toHaveLength(2);
  });
});
