import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SubjectWorkspaceView } from './components/SubjectWorkspaceView';
import App from './App';
import { api } from './api';
import { Conversation, Source, Subject } from './types';

const subject: Subject = {
  id: 'sp-subject', name: 'Algorithms', course_code: 'EECS 3101',
  settings: { response_length: 'default', response_style: 'general' }, is_archived: false,
  source_count: 2, created_at: '2026-10-12', updated_at: '2026-10-12',
};
const src = (id: string, title: string, extra: Partial<Source> = {}): Source => ({
  id, subject_id: subject.id, user_id: 'guest', title, file_name: title, source_type: 'pdf', status: 'ready',
  version: 1, page_count: 3, word_count: 500, created_at: '2026-10-12', updated_at: '2026-10-12', ...extra,
});
const chats: Conversation[] = [
  { id: 'c1', subject_id: subject.id, user_id: 'guest', title: 'Exam prep', created_at: '2026-10-12', updated_at: '2026-10-12', message_count: 2 },
  { id: 'c2', subject_id: subject.id, user_id: 'guest', title: 'Older chat', created_at: '2026-10-11', updated_at: '2026-10-11', message_count: 4 },
];
const done = async () => {};
const workspace = (sources: Source[], selected: string[], onSelectSources = vi.fn()) => (
  <SubjectWorkspaceView subject={subject} sources={sources} selectedSourceIds={selected}
    conversations={chats} notes={[]} activeConversationId="c1" starterQuestions={[]} isDemoMode={false}
    onBackToDashboard={vi.fn()} onSelectSources={onSelectSources} onSelectConversation={vi.fn()}
    onCreateConversation={done} onRenameConversation={done} onDeleteConversation={done}
    onUploadFiles={done} onPasteText={done} onAddUrl={done} onRenameSource={done}
    onDeleteSource={done} onRetrySource={done} onReplaceSource={done} onSendMessage={done}
    onUpdateSettings={done} onCreateNote={done} onSaveAnswerAsNote={done}
    onUpdateNote={done} onDeleteNote={done} messages={[]} chatLoading={false} />
);
const panel = () => screen.getByRole('complementary', { name: 'Sources' });
const originalWidth = window.innerWidth;
beforeEach(() => { window.innerWidth = 1440; });
afterEach(() => { window.innerWidth = originalWidth; vi.restoreAllMocks(); });

describe('Sources panel', () => {
  it('with no sources shows only the drop zone: no selection row, no old empty text, no big add button', () => {
    render(workspace([], []));
    const zone = within(panel()).getByRole('button', { name: /Drop PDFs here or click to browse/ });
    expect(zone).toHaveTextContent('PDFs, links, pasted text');
    expect(within(panel()).getByRole('heading', { name: /Sources/ })).toHaveTextContent('0');
    expect(within(panel()).queryByText(/of \d+ selected/)).toBeNull();
    expect(within(panel()).queryByText('Select all')).toBeNull();
    expect(screen.queryByText('No materials added yet.')).toBeNull();
    expect(within(panel()).queryByRole('button', { name: 'Add sources' })).toBeNull();
  });

  it('opens the add dialog from the drop zone, and queues dropped files in it', async () => {
    render(workspace([], []));
    fireEvent.click(within(panel()).getByRole('button', { name: /Drop PDFs here/ }));
    expect(await screen.findByText('Add sources to notebook')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });

    const file = new File(['%PDF-1.4'], 'handout.pdf', { type: 'application/pdf' });
    fireEvent.drop(within(panel()).getByRole('button', { name: /Drop PDFs here/ }), { dataTransfer: { files: [file], types: ['Files'] } });
    expect(await screen.findByText('handout.pdf')).toBeInTheDocument();
  });

  it('with sources collapses to a compact Add row and shows the selection row', () => {
    const onSelectSources = vi.fn();
    render(workspace([src('a', 'Syllabus.pdf'), src('b', 'Lecture 7.pdf')], ['a'], onSelectSources));
    expect(within(panel()).queryByRole('button', { name: /Drop PDFs here/ })).toBeNull();
    expect(within(panel()).getByRole('button', { name: 'Add sources' })).toHaveTextContent('Add');
    expect(within(panel()).getByText('1 of 2 selected')).toBeInTheDocument();
    expect(within(panel()).getByRole('heading', { name: /Sources/ })).toHaveTextContent('2');

    fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Select Lecture 7.pdf' }));
    expect(onSelectSources).toHaveBeenCalledWith(['a', 'b']);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Clear' }));
    expect(onSelectSources).toHaveBeenCalledWith([]);
  });

  it('has no chat-switching UI anywhere, even when the notebook has several stored conversations', () => {
    render(workspace([src('a', 'Syllabus.pdf')], ['a']));
    expect(screen.queryByText(/Chats/)).toBeNull();
    expect(screen.queryByText(/Recent Chats/i)).toBeNull();
    expect(screen.queryByText('Exam prep')).toBeNull();
    expect(screen.queryByText('Older chat')).toBeNull();
    expect(screen.queryByRole('button', { name: /New conversation/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /chats panel/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sources panel' }));
    expect(screen.getAllByRole('button', { name: /Open .* panel/ })).toHaveLength(1);
  });

  it('opening a notebook lands straight in its conversation', async () => {
    window.history.replaceState({}, '', '/subject/' + subject.id);
    vi.spyOn(api, 'ensureSession').mockResolvedValue({ id: 'guest', email: 'Guest Workspace' } as any);
    vi.spyOn(api, 'getSubjects').mockResolvedValue([subject]);
    vi.spyOn(api, 'getSubject').mockResolvedValue(subject);
    vi.spyOn(api, 'getSources').mockResolvedValue([src('a', 'Syllabus.pdf')]);
    vi.spyOn(api, 'getConversations').mockResolvedValue(chats);
    vi.spyOn(api, 'getNotes').mockResolvedValue([]);
    vi.spyOn(api, 'getStarterQuestions').mockResolvedValue([]);
    const getMessages = vi.spyOn(api, 'getMessages').mockResolvedValue([
      { id: 'm1', conversation_id: 'c1', user_id: 'guest', role: 'user', content: 'When is the final exam?', citations: [], conflicts: [],
        conflict_detected: false, abstained: false, retrieved: [], selected_source_ids: [], source_versions: {},
        tokens: { input: 0, output: 0, total: 0 }, latency: 0, created_at: '2026-10-12' } as any,
    ]);
    const createConversation = vi.spyOn(api, 'createConversation');
    render(<App />);
    expect(await screen.findByText('When is the final exam?')).toBeInTheDocument();
    await waitFor(() => expect(getMessages).toHaveBeenCalledWith(subject.id, 'c1'));
    expect(createConversation).not.toHaveBeenCalled();
    expect(screen.queryByText(/Chats/)).toBeNull();
    window.history.replaceState({}, '', '/');
  });
});
