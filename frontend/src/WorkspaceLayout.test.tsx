import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
const sourcesToggle = () => screen.getByRole('button', { name: 'Toggle sources panel' });
const navToggle = () => screen.getByRole('button', { name: 'Toggle navigation' });
const originalWidth = window.innerWidth;
beforeEach(() => {
  window.innerWidth = 1440;
  window.localStorage.clear();
  vi.spyOn(api, 'getPassages').mockResolvedValue([]);
});
afterEach(() => { window.innerWidth = originalWidth; vi.restoreAllMocks(); });

describe('Workspace navigation and progressive disclosure', () => {
  it('does not carry the notebook list into a workspace, but keeps dashboard navigation', () => {
    const back = vi.fn();
    render(<DashboardView workspaceMode subjects={[subject]} loading={false} activeSubjectId={subject.id}
      onOpenSubject={vi.fn()} onCreateSubject={done} onUpdateSubject={done} onArchiveSubject={done}
      onRestoreSubject={done} onDeleteSubject={done}>{workspace(back)}</DashboardView>);
    expect(screen.queryByRole('complementary', { name: 'Notebooks sidebar' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to notebooks dashboard' }));
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
    fireEvent.click(await screen.findByRole('button', { name: 'Back to notebooks dashboard' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'My notebooks' })).toBeVisible());
    expect(screen.getByTestId('subject-card-' + subject.id)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to notebooks dashboard' })).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('starts with desktop sources open and has no separate inspector toggle', () => {
    render(workspace());
    expect(sourcesToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(navToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('button', { name: /inspector/i })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Inspector and Notes Panel' })).toBeNull();
    fireEvent.click(sourcesToggle());
    expect(sourcesToggle()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(sourcesToggle());
    expect(screen.getByRole('complementary', { name: 'Sources' })).toBeVisible();
  });

  it.each([1440, 768, 390])('opens cited evidence under the answer at %ipx without opening a panel', async width => {
    window.innerWidth = width;
    render(workspace());
    const sourcesWasOpen = sourcesToggle().getAttribute('aria-expanded');
    fireEvent.click(screen.getByRole('button', { name: 'Citation 1: lecture.pdf, page 1' }));
    await waitFor(() => expect(api.getPassages).toHaveBeenCalledWith('lecture.pdf', 1, subject.id, 'source'));
    const evidence = screen.getByTestId('inline-evidence');
    expect(evidence).toBeVisible();
    expect(evidence).toHaveAccessibleName('Evidence from lecture.pdf, page 1');
    expect(evidence.closest('.assistant-message')).not.toBeNull();
    expect(sourcesToggle().getAttribute('aria-expanded')).toBe(sourcesWasOpen);
  });

  it('starts compact screens closed, supports both panels, and restores focus on Escape', () => {
    window.innerWidth = 390;
    render(workspace());
    expect(navToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(sourcesToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('heading', { name: subject.name })).toHaveTextContent(subject.name);
    fireEvent.click(navToggle()); fireEvent.click(sourcesToggle());
    expect(navToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(sourcesToggle()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(sourcesToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(sourcesToggle()).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(navToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(navToggle()).toHaveFocus();
  });

  it('gives both phone panel toggles real button semantics, names and state', () => {
    window.innerWidth = 390;
    render(workspace());
    for (const toggle of [navToggle(), sourcesToggle()]) {
      expect(toggle.tagName).toBe('BUTTON');
      expect(toggle).toHaveAttribute('type', 'button');
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(toggle).toHaveAttribute('aria-controls');
      expect(toggle).toHaveAttribute('title');
      expect(document.getElementById(toggle.getAttribute('aria-controls')!)).not.toBeNull();
    }
  });

  it('keeps notebook settings reachable through the keyboard-operated actions menu', () => {
    render(workspace());
    const trigger = screen.getByRole('button', { name: 'Notebook actions' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const settings = screen.getByRole('menuitem', { name: 'Notebook settings' });
    expect(settings).toHaveFocus();
    fireEvent.keyDown(settings, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Guest Workspace' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(trigger); fireEvent.click(screen.getByRole('menuitem', { name: 'Notebook settings' }));
    expect(screen.getByLabelText('Response Length')).toBeVisible();
  });

  it('switches the materials panel between Sources, Notes and Retrieval', () => {
    render(workspace());
    const sourcesTab = screen.getByRole('button', { name: 'Sources', pressed: true });
    const notesTab = screen.getByRole('button', { name: /^Notes/i });
    const retrievalTab = screen.getByTestId('right-panel-tab-retrieval');
    expect(notesTab).toHaveAttribute('aria-pressed', 'false');
    expect(retrievalTab).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(notesTab);
    expect(notesTab).toHaveAttribute('aria-pressed', 'true');
    expect(sourcesTab).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('new-note-btn')).toBeVisible();
    expect(screen.getByRole('complementary', { name: 'Saved notes' })).toBeVisible();

    fireEvent.click(retrievalTab);
    expect(retrievalTab).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('complementary', { name: 'Retrieval' })).toBeVisible();

    fireEvent.click(sourcesTab);
    expect(sourcesTab).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('add-source-btn')).toBeVisible();
  });

  it('opens saved notes in the materials panel from the navigation sidebar', () => {
    window.innerWidth = 1024;
    render(workspace());
    expect(sourcesToggle()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByTestId('nav-saved-notes'));
    expect(sourcesToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('complementary', { name: 'Saved notes' })).toBeVisible();
  });
});
