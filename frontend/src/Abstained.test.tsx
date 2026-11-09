import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { SubjectWorkspaceView } from './components/SubjectWorkspaceView';
import { abstainCopy } from './abstain';
import { api } from './api';
import { MessageItem, Source, Subject } from './types';

// MOCKED: props and vi.spyOn on `api`; no real backend.
const subject: Subject = {
  id: 'ab', name: 'Notebook', course_code: 'N 1', settings: { response_length: 'default', response_style: 'general' },
  is_archived: false, source_count: 2, created_at: '2026-10-12', updated_at: '2026-10-12',
};
const src = (id: string): Source => ({
  id, subject_id: subject.id, user_id: 'g', title: `Title ${id}`, file_name: `${id}.pdf`, source_type: 'pdf', status: 'ready',
  version: 1, page_count: 3, word_count: 10, created_at: '2026-10-12', updated_at: '2026-10-12',
});
const question: MessageItem = {
  id: 'q', conversation_id: 'c', user_id: 'g', role: 'user', content: 'What is the remote proctoring policy?', citations: [],
  conflicts: [], conflict_detected: false, abstained: false, retrieved: [], selected_source_ids: ['a', 'b'], source_versions: {},
  tokens: { input: 0, output: 0, total: 0 }, latency: 0, created_at: '2026-10-12',
};
const notFound = (extra: Partial<MessageItem> = {}): MessageItem => ({
  ...question, id: 'nf', role: 'assistant', content: 'NOT_FOUND', abstained: true, abstain_reason: 'not_found',
  retrieved: [
    { source_id: 'a', file_name: 'a.pdf', title: 'Title a', page_number: 4, text: 'x', score: 0.2143 },
    { source_id: 'b', file_name: 'b.pdf', title: 'Title b', page_number: 3, text: 'y', score: 0.1987 },
  ],
  model: 'sample', latency: 0.84, ...extra,
});
const done = async () => {};
const view = (messages: MessageItem[], onSend = vi.fn()) => (
  <SubjectWorkspaceView subject={subject} sources={[src('a'), src('b')]} selectedSourceIds={['a', 'b']}
    conversations={[]} notes={[]} activeConversationId="c" starterQuestions={[]} isDemoMode={false}
    onBackToDashboard={vi.fn()} onSelectSources={vi.fn()} onSelectConversation={vi.fn()}
    onCreateConversation={done} onRenameConversation={done} onDeleteConversation={done}
    onUploadFiles={done} onPasteText={done} onAddUrl={done} onRenameSource={done}
    onDeleteSource={done} onRetrySource={done} onReplaceSource={done} onSendMessage={onSend}
    onUpdateSettings={done} onCreateNote={done} onSaveAnswerAsNote={done}
    onUpdateNote={done} onDeleteNote={done} messages={messages} chatLoading={false} />
);
const originalWidth = window.innerWidth;
beforeEach(() => { window.innerWidth = 1440; window.localStorage.clear(); window.sessionStorage.clear(); });
afterEach(() => { window.innerWidth = originalWidth; vi.restoreAllMocks(); });

describe('abstainCopy (pure)', () => {
  it('never returns the raw code and covers every known reason', () => {
    for (const reason of ['not_found', 'low_retrieval_score', 'invalid_citation', 'bad_output', 'stopped', undefined, 'something_new']) {
      const c = abstainCopy({ ...notFound(), abstain_reason: reason as any }, 2);
      expect(`${c.title} ${c.body} ${c.hint ?? ''}`).not.toMatch(/NOT_FOUND|_/);
      expect(c.title.length).toBeGreaterThan(5);
    }
  });
  it('shows the service sentence only for a failed generation', () => {
    expect(abstainCopy({ ...notFound(), abstain_reason: 'generation_failed', content: 'Usage limit reached.' }).body).toBe('Usage limit reached.');
    expect(abstainCopy({ ...notFound(), content: 'Usage limit reached.' }).body).not.toContain('Usage limit');
  });
  it('counts passages and materials in plain words, and has no scores', () => {
    const c = abstainCopy(notFound(), 2);
    expect(c.body).toBe('I checked 2 passages from your 2 selected materials, and none of them answer this.');
  });
});

describe('Not-found answers in the workspace (mocked)', () => {
  it('replaces NOT_FOUND with a clear message and hides scores', () => {
    render(view([question, notFound()]));
    const notice = screen.getByTestId('abstained-view');
    expect(within(notice).getByRole('heading', { name: "I couldn't find this in your materials" })).toBeInTheDocument();
    expect(screen.queryByText('NOT_FOUND')).toBeNull();
    expect(document.body.textContent).not.toMatch(/NOT_FOUND|Score:|0\.2143|0\.214\b/);
    expect(document.querySelector('.card-not-found, .related-passages-section')).toBeNull();
    expect(notice).toHaveAttribute('role', 'status');
  });
  it('offers Retry, Choose materials and Retrieval details', () => {
    const onSend = vi.fn();
    render(view([question, notFound()], onSend));
    fireEvent.click(screen.getByRole('button', { name: 'Retry question' }));
    expect(onSend).toHaveBeenCalledWith(question.content, { is_retry: true, retry_message_id: 'nf' });
    expect(screen.getByRole('button', { name: 'Choose materials' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retrieval details' }));
    expect(screen.getByRole('complementary', { name: 'Study panel' })).toBeVisible();
    expect(screen.getByTestId('right-panel-tab-evidence')).toHaveAttribute('aria-pressed', 'true');
  });
  it('omits Retrieval details when nothing was retrieved, and has no status strip', () => {
    render(view([question, notFound({ retrieved: [] })]));
    expect(screen.queryByRole('button', { name: 'Retrieval details' })).toBeNull();
    expect(screen.queryByTestId('status-strip')).toBeNull();
  });
  it('shows a failed generation as an alert with the service text once, and no Choose materials', () => {
    render(view([question, notFound({ abstain_reason: 'generation_failed', content: 'The AI service has reached its usage limit.', retrieved: [] })]));
    const notice = screen.getByTestId('abstained-view');
    expect(notice).toHaveAttribute('role', 'alert');
    expect(screen.getAllByText('The AI service has reached its usage limit.')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Choose materials' })).toBeNull();
  });
  it('Choose materials opens the Sources panel when it is closed', () => {
    window.innerWidth = 1024;
    window.localStorage.setItem('notebookspace_nav_open', '0');
    render(view([question, notFound()]));
    expect(screen.getByRole('button', { name: 'Toggle sources panel' })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Choose materials' }));
    expect(screen.getByRole('button', { name: 'Toggle sources panel' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('complementary', { name: 'Sources' })).toBeVisible();
  });
  it('keeps model and latency metadata out of the chat feed', () => {
    const answer: MessageItem = { ...question, id: 'ok', role: 'assistant', content: 'Fine.', latency: 1.2, model: 'm', retrieved: [] };
    vi.spyOn(api, 'getPassages').mockResolvedValue([]);
    render(view([question, answer]));
    expect(screen.queryByTestId('status-strip')).toBeNull();
    expect(screen.queryByText(/Model:/)).toBeNull();
  });
});
