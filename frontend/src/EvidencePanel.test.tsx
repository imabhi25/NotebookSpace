import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

describe('Workspace answer: telemetry and cross-source check', () => {
  it('hides the telemetry strip and shows the Cross-Source Evidence Check on a grounded two-source answer', async () => {
    vi.spyOn(api, 'getPassages').mockResolvedValue([]);
    render(view());
    expect(screen.queryByTestId('answer-telemetry')).toBeNull();
    const check = screen.getByRole('region', { name: 'Cross-Source Evidence Check' });
    expect(check).toHaveAttribute('data-status', 'conflict');
    expect(within(check).getAllByTestId('cross-source-card')).toHaveLength(2);
  });

  it('lets keyboard users open a conflict claim into the Source Reader: each claim is a native button', async () => {
    render(view());
    const claim = screen.getByRole('button', { name: /Claim: 50% in b\.pdf page 1/ });
    expect(claim.tagName).toBe('BUTTON');
    expect(claim).toHaveAttribute('type', 'button');
    fireEvent.click(claim);
    expect(await screen.findByTestId('source-reader')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /b\.pdf/ })).toBeInTheDocument();
  });
});
