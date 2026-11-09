import React from 'react';
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
const study = () => screen.getByRole('complementary', { name: 'Study panel' });
// jsdom has no PointerEvent; a MouseEvent carries the fields the resize handle reads.
if (!(window as any).PointerEvent) {
  (window as any).PointerEvent = class extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: any = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; }
  };
}
const originalWidth = window.innerWidth;
beforeEach(() => { window.innerWidth = 1440; window.localStorage.clear(); });
afterEach(() => { window.innerWidth = originalWidth; vi.restoreAllMocks(); });

describe('Sources panel', () => {
  it('with no sources shows the actions, the link bar and the drop zone, with no count and no selection row', () => {
    render(workspace([], []));
    const zone = within(panel()).getByRole('button', { name: /Drop PDFs here or click to browse/ });
    expect(zone).toHaveTextContent('PDFs, links, pasted text');
    expect(within(panel()).getByRole('heading', { name: 'Sources' })).toHaveTextContent(/^Sources$/);
    expect(within(panel()).queryByText(/of \d+ selected/)).toBeNull();
    expect(within(panel()).queryByText('Select all')).toBeNull();
    expect(screen.queryByText('No materials added yet.')).toBeNull();
    expect(within(panel()).getByRole('button', { name: 'Add sources' })).toBeInTheDocument();
    expect(within(panel()).queryByRole('button', { name: 'Create note' })).toBeNull(); // notes live in the study panel
    expect(within(panel()).getByRole('button', { name: /Switch notebook/ })).toBeInTheDocument();
    expect(within(panel()).getByRole('searchbox', { name: 'Search the web for new sources' })).toBeInTheDocument();
    expect(within(panel()).queryByRole('combobox', { name: 'Where to search' })).toBeNull(); // the single-option select was removed
    expect(within(panel()).queryByRole('combobox', { name: 'Research depth' })).toBeNull(); // the disabled depth selector was removed
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

  it('with sources drops the drop zone, shows a select-all row, and has no number beside the title', () => {
    const onSelectSources = vi.fn();
    const { rerender } = render(workspace([src('a', 'Syllabus.pdf'), src('b', 'Lecture 7.pdf')], ['a'], onSelectSources));
    expect(within(panel()).queryByRole('button', { name: /Drop PDFs here/ })).toBeNull();
    expect(within(panel()).getByRole('button', { name: 'Add sources' })).toBeInTheDocument();
    expect(within(panel()).getByRole('heading', { name: 'Sources' })).toHaveTextContent(/^Sources$/);
    const selectAll = within(panel()).getByRole('checkbox', { name: 'Select all sources' }) as HTMLInputElement;
    expect(within(panel()).getByText('Select all')).toBeInTheDocument();
    expect(selectAll.checked).toBe(false);
    expect(selectAll.indeterminate).toBe(true);

    fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Select Lecture 7.pdf' }));
    expect(onSelectSources).toHaveBeenCalledWith(['a', 'b']);
    fireEvent.click(selectAll);
    expect(onSelectSources).toHaveBeenLastCalledWith(['a', 'b']);

    rerender(workspace([src('a', 'Syllabus.pdf'), src('b', 'Lecture 7.pdf')], ['a', 'b'], onSelectSources));
    const all = within(panel()).getByRole('checkbox', { name: 'Select all sources' }) as HTMLInputElement;
    expect(all.checked).toBe(true);
    fireEvent.click(all);
    expect(onSelectSources).toHaveBeenLastCalledWith([]);
  });

  it('the link bar opens the add dialog on the link tab with the link filled in, and explains anything else', async () => {
    render(workspace([], []));
    const bar = within(panel()).getByRole('searchbox', { name: 'Search the web for new sources' });
    fireEvent.change(bar, { target: { value: 'how do heaps work' } });
    fireEvent.click(within(panel()).getByRole('button', { name: 'Add this link as a source' }));
    expect(within(panel()).getByRole('status')).toHaveTextContent('Web search is not available yet');
    expect(screen.queryByText('Add sources to notebook')).toBeNull();

    fireEvent.change(bar, { target: { value: 'example.com/notes' } });
    fireEvent.click(within(panel()).getByRole('button', { name: 'Add this link as a source' }));
    expect(await screen.findByText('Add sources to notebook')).toBeInTheDocument();
    expect(await screen.findByLabelText(/Public Webpage URL/)).toHaveValue('https://example.com/notes');
    expect(bar).toHaveValue('');
  });

  it('Find in sources filters the list by name; Create note lives in the study panel', () => {
    render(workspace([src('a', 'Syllabus.pdf'), src('b', 'Lecture 7.pdf')], ['a']));
    expect(within(panel()).getByRole('heading', { name: /In this notebook/ })).toHaveTextContent('2');
    expect(within(panel()).getByTestId('rail-selected-count')).toHaveTextContent('1 source selected');
    fireEvent.change(within(panel()).getByRole('searchbox', { name: 'Find in sources' }), { target: { value: 'lect' } });
    expect(within(panel()).queryByText('Syllabus.pdf')).toBeNull();
    expect(within(panel()).getByText('Lecture 7.pdf')).toBeInTheDocument();

    fireEvent.click(within(study()).getByTestId('new-note-btn'));
    expect(screen.getByRole('heading', { name: 'Create Note' })).toBeInTheDocument();
  });

  it('keeps chat switching in the study panel and out of the sources rail', () => {
    const onSelect = vi.fn();
    render(React.cloneElement(workspace([src('a', 'Syllabus.pdf')], ['a']), { onSelectConversation: onSelect }));
    expect(within(panel()).queryByText('Exam prep')).toBeNull();
    expect(within(panel()).queryByRole('button', { name: /New session/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Conversation history' }));
    expect(within(screen.getByRole('dialog', { name: 'Conversation history' })).getByRole('button', { name: 'Exam prep' })).toHaveAttribute('aria-current', 'true');
    expect(within(screen.getByRole('dialog', { name: 'Conversation history' })).getByRole('button', { name: 'Older chat' })).not.toHaveAttribute('aria-current');
    expect(within(screen.getByRole('dialog', { name: 'Conversation history' })).getByTestId('nav-new-session')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Conversation history' })).getByRole('button', { name: 'Older chat' }));
    expect(onSelect).toHaveBeenCalledWith('c2');
  });

  it('rows have one always-present menu button and checkbox, and no separate action icons', () => {
    const onDeleteSource = vi.fn(done);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const view = workspace([src('a', 'Syllabus.pdf'), src('b', 'Notes', { source_type: 'pasted', status: 'failed' })], ['a']);
    render(React.cloneElement(view, { onDeleteSource }));
    const row = within(panel()).getByText('Syllabus.pdf').closest('li')!;
    expect(within(row).getAllByRole('button')).toHaveLength(2);
    expect(row.querySelector('.source-row-meta')).toBeNull();
    expect(within(row).queryByRole('button', { name: /^(View|Rename|Delete|Replace|Retry) / })).toBeNull();
    expect(within(row).getByRole('checkbox', { name: 'Select Syllabus.pdf' })).toBeInTheDocument();
    expect(row).toHaveTextContent('PDF');
    expect(row).toHaveTextContent('3 pages');

    fireEvent.click(within(row).getByRole('button', { name: 'Options for Syllabus.pdf' }));
    const menu = screen.getByRole('menu', { name: 'Options for Syllabus.pdf' });
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Read', 'View', 'Rename', 'Replace', 'Remove']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Remove' }));
    expect(onDeleteSource).toHaveBeenCalledWith('a');
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(within(panel()).getByRole('button', { name: 'Options for Notes' }));
    expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Retry' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('is a fixed-width floating study panel with no resize handle', () => {
    render(workspace([src('a', 'Syllabus.pdf')], ['a']));
    expect(screen.queryByRole('separator', { name: 'Resize sources panel' })).toBeNull();
    expect(study()).toHaveClass('workspace-context-panel');
    expect(study().closest('.context-slot')).not.toHaveClass('is-collapsed');
    expect(panel().closest('.nav-slot')).not.toHaveClass('is-collapsed');
  });

  it('collapses the Sources rail from its own button, reopens from the top bar, and takes it out of reach', () => {
    render(workspace([src('a', 'Syllabus.pdf')], ['a']));
    const toggle = screen.getByRole('button', { name: 'Toggle sources panel' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle sources panel' }));
    expect(screen.queryByRole('complementary', { name: 'Sources' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Select Syllabus.pdf' })).toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);
    expect(panel()).toBeInTheDocument();
  });

  it('collapses the study panel from its own button and returns focus to its toggle', () => {
    render(workspace([src('a', 'Syllabus.pdf')], ['a']));
    const toggle = screen.getByRole('button', { name: 'Toggle study panel' });
    fireEvent.click(screen.getByRole('button', { name: 'Toggle study panel' }));
    expect(screen.queryByRole('complementary', { name: 'Study panel' })).toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);
    expect(study()).toBeInTheDocument();
  });

  it('remembers each panel preference independently while docked', () => {
    const { unmount } = render(workspace([src('a', 'Syllabus.pdf')], ['a']));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle study panel' }));
    expect(window.localStorage.getItem('notebookspace_context_open')).toBe('0');
    expect(window.localStorage.getItem('notebookspace_nav_open')).toBeNull();
    unmount();
    render(workspace([src('a', 'Syllabus.pdf')], ['a']));
    expect(screen.getByRole('button', { name: 'Toggle study panel' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Toggle sources panel' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle sources panel' }));
    expect(window.localStorage.getItem('notebookspace_nav_open')).toBe('0');
    expect(screen.queryByRole('complementary', { name: 'Sources' })).toBeNull();
  });

  it('starts the study panel as an overlay at tablet width and does not store its open state', () => {
    window.innerWidth = 1024;
    render(workspace([src('a', 'Syllabus.pdf')], ['a']));
    expect(screen.getByRole('button', { name: 'Toggle study panel' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Toggle sources panel' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle study panel' }));
    expect(study()).toBeVisible();
    expect(window.localStorage.getItem('notebookspace_context_open')).toBeNull();
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
