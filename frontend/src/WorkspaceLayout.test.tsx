import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SubjectWorkspaceView } from './components/SubjectWorkspaceView';
import App from './App';
import { DashboardView } from './components/DashboardView';
import { api } from './api';
import { MessageItem, Source, Subject } from './types';

const subject: Subject = {
  id: 'layout-subject', name: 'A notebook title that must remain available in full', course_code: 'EECS 3101',
  settings: { response_length: 'default', response_style: 'general' }, is_archived: false,
  source_count: 1, created_at: '2026-10-12', updated_at: '2026-10-12',
};
const source: Source = {
  id: 'source', subject_id: subject.id, user_id: 'guest', title: 'Lecture', file_name: 'lecture.pdf',
  source_type: 'pdf', status: 'ready', version: 1, page_count: 1, word_count: 50,
  created_at: '2026-10-12', updated_at: '2026-10-12',
};
const message: MessageItem = {
  id: 'answer', conversation_id: 'chat', user_id: 'guest', role: 'assistant',
  content: 'Initialization establishes the invariant [lecture.pdf p.1].',
  citations: [{ file: 'lecture.pdf', page: 1, source_id: 'source', source_version: 1 }],
  conflicts: [], conflict_detected: false, abstained: false, retrieved: [],
  selected_source_ids: ['source'], source_versions: { source: 1 },
  tokens: { input: 1, output: 1, total: 2 }, latency: 0, created_at: '2026-10-12',
};
const done = async () => {};
function workspace(onBackToDashboard = vi.fn()) {
  return <SubjectWorkspaceView subject={subject} sources={[source]} selectedSourceIds={['source']}
    conversations={[]} notes={[]} activeConversationId={null} starterQuestions={[]} isDemoMode={false}
    onBackToDashboard={onBackToDashboard} onSelectSources={vi.fn()} onSelectConversation={vi.fn()}
    onCreateConversation={done} onRenameConversation={done} onDeleteConversation={done}
    onUploadFiles={done} onPasteText={done} onAddUrl={done} onRenameSource={done}
    onDeleteSource={done} onRetrySource={done} onReplaceSource={done} onSendMessage={done}
    onUpdateSettings={done} onCreateNote={done} onSaveAnswerAsNote={done}
    onUpdateNote={done} onDeleteNote={done} messages={[message]} chatLoading={false} />;
}
const studyToggle = () => screen.getByRole('button', { name: /Toggle study panel|Open citations panel/ });
const sourcesToggle = () => screen.getByRole('button', { name: 'Toggle sources panel' });
const originalWidth = window.innerWidth;
beforeEach(() => {
  window.innerWidth = 1440;
  window.localStorage.clear();
  vi.spyOn(api, 'getPassages').mockResolvedValue([]);
});
afterEach(() => { window.innerWidth = originalWidth; vi.restoreAllMocks(); });

describe('Workspace navigation and progressive disclosure', () => {
  it('opens the link and text source entry points without enabling empty chat', async () => {
    render(React.cloneElement(workspace(), { sources: [], messages: [], starterQuestions: ['A suggested question'] }));
    expect(screen.getByRole('button', { name: 'Ask Question' })).toBeDisabled();
    expect(screen.queryByText('A suggested question')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Import a webpage/ }));
    expect(await screen.findByLabelText(/Public Webpage URL/)).toBeVisible();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: /Paste lecture text/ }));
    expect(await screen.findByLabelText(/Text Content/)).toBeVisible();
  });

  it.each(['empty', 'ready', 'conversation'])('keeps one bottom composer in the %s state', state => {
    const { container } = render(React.cloneElement(workspace(), {
      sources: state === 'empty' ? [] : [source],
      messages: state === 'conversation' ? [message] : [],
    }));
    const main = container.querySelector('.workspace-main-area')!;
    expect(main.querySelectorAll('.composer-container')).toHaveLength(1);
    expect(main.lastElementChild).toHaveClass('composer-container');
  });

  it('does not carry the notebook list into a workspace, but keeps dashboard navigation', () => {
    const back = vi.fn();
    render(<DashboardView workspaceMode subjects={[subject]} loading={false} activeSubjectId={subject.id}
      onOpenSubject={vi.fn()} onCreateSubject={done} onUpdateSubject={done} onArchiveSubject={done}
      onRestoreSubject={done} onDeleteSubject={done}>{workspace(back)}</DashboardView>);
    expect(screen.queryByRole('complementary', { name: 'Notebooks sidebar' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "Back to notebooks" }));
    expect(back).toHaveBeenCalledOnce();
  });

  it('returns to the dashboard without reopening the first notebook', async () => {
    window.history.replaceState({}, '', '/subject/' + subject.id);
    vi.spyOn(api, 'ensureSession').mockResolvedValue({ id: 'guest', email: 'Guest Workspace' });
    vi.spyOn(api, 'getSubjects').mockResolvedValue([subject]);
    vi.spyOn(api, 'getSubject').mockResolvedValue(subject);
    vi.spyOn(api, 'getSources').mockResolvedValue([source]);
    vi.spyOn(api, 'getConversations').mockResolvedValue([]);
    vi.spyOn(api, 'getNotes').mockResolvedValue([]);
    vi.spyOn(api, 'getStarterQuestions').mockResolvedValue([]);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: "Back to notebooks" }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'My notebooks' })).toBeVisible());
    expect(screen.getByTestId('subject-card-' + subject.id)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Back to notebooks" })).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('starts with both desktop panels open and has no separate inspector toggle', () => {
    render(workspace());
    expect(studyToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(sourcesToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('button', { name: /inspector/i })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Inspector and Notes Panel' })).toBeNull();
    fireEvent.click(studyToggle());
    expect(studyToggle()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(studyToggle());
    expect(screen.getByRole('complementary', { name: 'Study panel' })).toBeVisible();
  });

  it.each([1440, 768, 390])('keeps the study panel with notes accessible at %ipx', async width => {
    window.innerWidth = width;
    render(workspace());
    if (studyToggle().getAttribute('aria-expanded') === 'false') {
      fireEvent.click(studyToggle());
    }
    expect(screen.getByRole('complementary', { name: 'Study panel' })).toBeVisible();
    expect(screen.getByTestId('new-note-btn')).toBeVisible();
    expect(studyToggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('starts compact screens closed, supports both panels, and restores focus on Escape', () => {
    window.innerWidth = 390;
    render(workspace());
    expect(sourcesToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(studyToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('heading', { name: subject.name })).toHaveTextContent(subject.name);
    fireEvent.click(sourcesToggle()); fireEvent.click(studyToggle());
    expect(sourcesToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(studyToggle()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(studyToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(studyToggle()).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(sourcesToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(sourcesToggle()).toHaveFocus();
  });

  it('gives both phone panel toggles real button semantics, names and state', () => {
    window.innerWidth = 390;
    render(workspace());
    for (const toggle of [sourcesToggle(), studyToggle()]) {
      expect(toggle.tagName).toBe('BUTTON');
      expect(toggle).toHaveAttribute('type', 'button');
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(toggle).toHaveAttribute('aria-controls');
      expect(toggle).toHaveAttribute('title');
      expect(document.getElementById(toggle.getAttribute('aria-controls')!)).not.toBeNull();
    }
  });

  it('keeps chat settings reachable through the keyboard-operated notebook menu', () => {
    render(workspace());
    const trigger = screen.getByRole('button', { name: 'Notebook actions' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const configure = screen.getByRole('menuitem', { name: 'Configure chat' });
    expect(configure).toHaveFocus();
    fireEvent.keyDown(configure, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Customize notebook' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(trigger); fireEvent.click(screen.getByRole('menuitem', { name: 'Configure chat' }));
    expect(screen.getByLabelText('Response Length')).toBeVisible();
  });

  it('lists the notebook actions, with delete chat history disabled when there is no chat', () => {
    render(React.cloneElement(workspace(), { messages: [] }));
    fireEvent.click(screen.getByRole('button', { name: 'Notebook actions' }));
    for (const name of ['Configure chat', 'Customize notebook', 'Retrieval analytics', 'Export notes']) {
      expect(screen.getByRole('menuitem', { name })).toBeEnabled();
    }
    expect(screen.getByRole('menuitem', { name: /Delete chat history/ })).toBeDisabled();
  });

  it('customizes the notebook title inline from the menu', () => {
    render(React.cloneElement(workspace(), { onRenameSubject: done }));
    fireEvent.click(screen.getByRole('button', { name: 'Notebook actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Customize notebook' }));
    expect(screen.getByLabelText('Notebook name')).toHaveFocus();
  });

  it('confirms before deleting chat history', async () => {
    const clear = vi.fn(async () => {});
    render(React.cloneElement(workspace(), { onClearChat: clear }));
    fireEvent.click(screen.getByRole('button', { name: 'Notebook actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete chat history/ }));
    expect(clear).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete history' }));
    expect(clear).toHaveBeenCalledOnce();
  });

  it('toggles the reading font from a single-line settings row, with no theme picker anywhere', () => {
    render(workspace());
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.queryByText(/Appearance|Dark|System/)).toBeNull();
    expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0);
    const font = screen.getByRole('menuitem', { name: /Reading font/ });
    expect(font).toHaveTextContent('Sans');
    fireEvent.click(font);
    expect(document.documentElement.getAttribute('data-reading-font')).toBe('serif');
    expect(font).toHaveTextContent('Serif');
    fireEvent.click(font);
    expect(document.documentElement.getAttribute('data-reading-font')).toBe('sans');
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('cycles answer depth in the settings popover, saves it, and has no second settings window', async () => {
    const update = vi.fn(async () => {});
    render(React.cloneElement(workspace(), { onUpdateSettings: update }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.queryByRole('menuitem', { name: /All settings/ })).toBeNull();
    const depth = screen.getByRole('menuitem', { name: /Answer depth/ });
    expect(depth).toHaveTextContent('Concise');
    fireEvent.click(depth);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ response_length: 'detailed', response_style: 'learning-guide' }));
  });

  it('shows three starter cards that send their question, and no pills above the composer', () => {
    const send = vi.fn(async () => {});
    render(React.cloneElement(workspace(), { messages: [], onSendMessage: send }));
    expect(screen.getByRole('heading', { name: 'What do you want to study?' })).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Suggested questions' })).toBeNull();
    expect(screen.queryByText('What is the late penalty?')).toBeNull();
    const cards = within(screen.getByRole('group', { name: 'Starter questions' })).getAllByRole('button');
    expect(cards.map((c) => c.textContent?.replace('→', ''))).toEqual([
      'Summarize key policies & grading', 'Check for updates or conflicts', 'Outline main topics to study',
    ]);
    fireEvent.click(cards[1]);
    expect(send).toHaveBeenCalledWith('Check for updates or conflicts');
  });

  it('with no sources shows the study-space heading and three add-source cards', () => {
    render(React.cloneElement(workspace(), { sources: [], messages: [] }));
    expect(screen.getByRole('heading', { name: 'Start your study space' })).toBeVisible();
    const cards = within(screen.getByRole('group', { name: 'Add sources' })).getAllByRole('button');
    expect(cards).toHaveLength(3);
    expect(screen.getByText('Drop PDFs or notes here')).toBeVisible();
    expect(screen.getByRole('button', { name: '+ Add source' })).toBeVisible();
    expect(screen.queryByRole('searchbox', { name: 'Search the web for new sources' })).toBeNull();
    expect(screen.getByTestId('scope-chip')).toHaveTextContent('0 sources');
    expect(screen.getByText('Your notes will appear here')).toBeVisible();
  });

  it('opens help and the reset confirmation from the settings popover', async () => {
    const reset = vi.fn(async () => {});
    render(React.cloneElement(workspace(), { onResetWorkspace: reset }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Help & shortcuts' }));
    expect(await screen.findByRole('dialog', { name: 'Help & shortcuts' })).toBeVisible();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset workspace' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reset Workspace' }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it('keeps Notes in Study and opens history separately', () => {
    render(workspace());
    expect(within(screen.getByRole('complementary', { name: 'Sources' })).getByTestId('add-source-btn')).toBeVisible();
    expect(screen.getByTestId('new-note-btn')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Conversation history' }));
    expect(screen.getByRole('dialog', { name: 'Conversation history' })).toBeVisible();
    expect(screen.getByTestId('nav-new-session')).toBeVisible();
  });

  it('keeps the study panel docked beside the conversation at 1024px', () => {
    window.innerWidth = 1024;
    render(workspace());
    expect(studyToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(sourcesToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('complementary', { name: 'Study panel' })).toBeVisible();
  });

  it('opens the study panel on demand as an overlay at 700px', () => {
    window.innerWidth = 700;
    render(workspace());
    expect(studyToggle()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(studyToggle());
    expect(studyToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('complementary', { name: 'Study panel' })).toBeVisible();
  });
});
