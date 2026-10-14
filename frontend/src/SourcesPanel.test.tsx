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
// jsdom has no PointerEvent; a MouseEvent carries the fields the resize handle reads.
if (!(window as any).PointerEvent) {
  (window as any).PointerEvent = class extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: any = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; }
  };
}
const originalWidth = window.innerWidth;
beforeEach(() => { window.innerWidth = 1440; });
afterEach(() => { window.innerWidth = originalWidth; vi.restoreAllMocks(); });

describe('Sources panel', () => {
  it('with no sources shows the actions, the link bar and the drop zone, with no count and no selection row', () => {
    render(workspace([], []));
    const zone = within(panel()).getByRole('button', { name: /Drop files here or browse/ });
    expect(zone).toHaveTextContent('PDF, text or Markdown, up to 10 MB each');
    expect(within(panel()).getByRole('heading', { name: 'Sources' })).toHaveTextContent(/^Sources$/);
    expect(within(panel()).queryByText(/of \d+ selected/)).toBeNull();
    expect(within(panel()).queryByText('Select all')).toBeNull();
    expect(screen.queryByText('No materials added yet.')).toBeNull();
    expect(within(panel()).getByRole('button', { name: 'Add sources' })).toBeInTheDocument();
    expect(within(panel()).getByRole('button', { name: 'Create note' })).toBeInTheDocument();
    expect(within(panel()).getByRole('textbox', { name: 'Add a link' })).toBeInTheDocument();
    expect(within(panel()).getByRole('button', { name: 'Add' })).toBeInTheDocument();
    // There is no web-search backend, so nothing pretends to be one.
    expect(within(panel()).queryByRole('combobox')).toBeNull();
    expect(within(panel()).queryByRole('searchbox')).toBeNull();
    expect(within(panel()).queryByText(/search the web|fast research|deep research/i)).toBeNull();
  });

  it('opens the add dialog from the drop zone, and queues dropped files in it', async () => {
    render(workspace([], []));
    fireEvent.click(within(panel()).getByRole('button', { name: /Drop files here/ }));
    expect(await screen.findByText('Add sources to notebook')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });

    const file = new File(['%PDF-1.4'], 'handout.pdf', { type: 'application/pdf' });
    fireEvent.drop(within(panel()).getByRole('button', { name: /Drop files here/ }), { dataTransfer: { files: [file], types: ['Files'] } });
    expect(await screen.findByText('handout.pdf')).toBeInTheDocument();
  });

  it('with sources drops the drop zone, shows a select-all row, and has no number beside the title', () => {
    const onSelectSources = vi.fn();
    const { rerender } = render(workspace([src('a', 'Syllabus.pdf'), src('b', 'Lecture 7.pdf')], ['a'], onSelectSources));
    expect(within(panel()).queryByRole('button', { name: /Drop files here/ })).toBeNull();
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

  it('the link row opens the add dialog on the link tab with the address filled in, and explains anything else', async () => {
    render(workspace([], []));
    const bar = within(panel()).getByRole('textbox', { name: 'Add a link' });
    fireEvent.click(within(panel()).getByRole('button', { name: 'Add' }));
    expect(within(panel()).getByRole('status')).toHaveTextContent('Paste a web address first');

    fireEvent.change(bar, { target: { value: 'how do heaps work' } });
    fireEvent.click(within(panel()).getByRole('button', { name: 'Add' }));
    expect(within(panel()).getByRole('status')).toHaveTextContent('does not look like a web address');
    expect(screen.queryByText('Add sources to notebook')).toBeNull();

    fireEvent.change(bar, { target: { value: 'example.com/notes' } });
    fireEvent.click(within(panel()).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Add sources to notebook')).toBeInTheDocument();
    expect(await screen.findByLabelText(/Public Webpage URL/)).toHaveValue('https://example.com/notes');
    expect(bar).toHaveValue('');
  });

  it('Create note opens the note dialog, and the filter button reveals a name filter', () => {
    render(workspace([src('a', 'Syllabus.pdf'), src('b', 'Lecture 7.pdf')], ['a']));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Create note' }));
    expect(screen.getByRole('heading', { name: 'Create Note' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(within(panel()).queryByRole('textbox', { name: 'Filter sources by name' })).toBeNull();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Filter sources by name' }));
    fireEvent.change(within(panel()).getByRole('textbox', { name: 'Filter sources by name' }), { target: { value: 'lect' } });
    expect(within(panel()).queryByText('Syllabus.pdf')).toBeNull();
    expect(within(panel()).getByText('Lecture 7.pdf')).toBeInTheDocument();
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

  it('rows have one always-present menu button and checkbox, and no separate action icons', () => {
    const onDeleteSource = vi.fn(done);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const view = workspace([src('a', 'Syllabus.pdf'), src('b', 'Notes', { source_type: 'pasted', status: 'failed' })], ['a']);
    render(React.cloneElement(view, { onDeleteSource }));
    const row = within(panel()).getByText('Syllabus.pdf').closest('li')!;
    expect(within(row).getAllByRole('button')).toHaveLength(2);
    // One line: the type icon, a serif title, quiet metadata. Status text only when something is wrong or pending.
    expect(row.querySelector('.source-type-icon')).not.toBeNull();
    expect(row.querySelector('.source-row-status')).toBeNull();
    expect(row).not.toHaveTextContent('Ready');
    expect(within(panel()).getByText('Notes').closest('li')!.querySelector('.source-row-status')).toHaveTextContent('Failed');
    expect(within(row).queryByRole('button', { name: /^(View|Rename|Delete|Replace|Retry) / })).toBeNull();
    expect(within(row).getByRole('checkbox', { name: 'Select Syllabus.pdf' })).toBeInTheDocument();
    expect(row).toHaveTextContent('PDF');
    expect(row).toHaveTextContent('3 pages');

    fireEvent.click(within(row).getByRole('button', { name: 'Options for Syllabus.pdf' }));
    const menu = screen.getByRole('menu', { name: 'Options for Syllabus.pdf' });
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['View', 'Rename', 'Replace', 'Remove']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Remove' }));
    expect(onDeleteSource).toHaveBeenCalledWith('a');
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(within(panel()).getByRole('button', { name: 'Options for Notes' }));
    expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Retry' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('resizes between limits, remembers the width, and resets on double-click', () => {
    window.localStorage.removeItem('notebookspace_sources_panel_width');
    const { unmount } = render(workspace([src('a', 'Syllabus.pdf')], ['a']));
    const slot = () => document.querySelector('.sources-slot') as HTMLElement;
    const handle = () => screen.getByRole('separator', { name: 'Resize sources panel' });
    expect(handle()).not.toHaveAttribute('tabindex');
    vi.spyOn(panel(), 'getBoundingClientRect').mockReturnValue({ width: 360 } as DOMRect);

    fireEvent.pointerDown(handle(), { button: 0, clientX: 360, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 420, pointerId: 1 });
    expect(slot().style.getPropertyValue('--sources-panel-user-width')).toBe('420px');
    expect(slot()).toHaveClass('is-resizing');
    fireEvent.pointerMove(handle(), { clientX: 900, pointerId: 1 });
    expect(slot().style.getPropertyValue('--sources-panel-user-width')).toBe('560px');
    fireEvent.pointerMove(handle(), { clientX: 100, pointerId: 1 });
    expect(slot().style.getPropertyValue('--sources-panel-user-width')).toBe('300px');
    fireEvent.pointerUp(handle(), { clientX: 400, pointerId: 1 });
    expect(slot()).not.toHaveClass('is-resizing');
    expect(window.localStorage.getItem('notebookspace_sources_panel_width')).toBe('400');

    unmount();
    render(workspace([src('a', 'Syllabus.pdf')], ['a']));
    expect(slot().style.getPropertyValue('--sources-panel-user-width')).toBe('400px');
    fireEvent.doubleClick(handle());
    expect(slot().style.getPropertyValue('--sources-panel-user-width')).toBe('');
    expect(window.localStorage.getItem('notebookspace_sources_panel_width')).toBeNull();
  });

  it('collapses to a rail with a single toggle, and takes the hidden side out of reach', () => {
    render(workspace([src('a', 'Syllabus.pdf')], ['a']));
    expect(screen.queryByRole('button', { name: 'Open sources panel' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sources panel' }));
    expect(screen.queryByRole('complementary', { name: 'Sources' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Select Syllabus.pdf' })).toBeNull();
    const rail = screen.getByRole('navigation', { name: 'Sources' });
    expect(within(rail).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(within(rail).getByRole('button', { name: 'Open sources panel' }));
    expect(panel()).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Sources' })).toBeNull();
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
