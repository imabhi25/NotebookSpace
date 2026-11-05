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
const left = () => screen.getByRole('button', { name: 'Toggle sources panel' });
const right = () => screen.getByRole('button', { name: 'Toggle inspector panel' });
const originalWidth = window.innerWidth;
beforeEach(() => {
  window.innerWidth = 1440;
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

  it('starts with desktop sources open and the inspector disclosed on demand', () => {
    render(workspace());
    expect(left()).toHaveAttribute('aria-expanded', 'true');
    expect(right()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('complementary', { name: 'Inspector and Notes Panel' })).not.toBeInTheDocument();
    fireEvent.click(right());
    expect(screen.getByRole('complementary', { name: 'Inspector and Notes Panel' })).toBeVisible();
    fireEvent.click(left());
    fireEvent.click(screen.getByRole('button', { name: 'Open sources panel' }));
    expect(screen.getByRole('complementary', { name: 'Sources' })).toBeVisible();
  });

  it.each([1440, 768, 390])('opens cited evidence consistently at %ipx', async width => {
    window.innerWidth = width;
    render(workspace());
    fireEvent.click(screen.getByRole('button', { name: 'Citation: lecture.pdf page 1' }));
    await waitFor(() => expect(api.getPassages).toHaveBeenCalledWith('lecture.pdf', 1));
    expect(right()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('complementary', { name: 'Inspector and Notes Panel' })).toBeVisible();
    if (width <= 960) {
      expect(left()).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByRole('complementary', { name: 'Inspector and Notes Panel' })).toHaveFocus();
    }
  });

  it('starts compact screens closed, supports both panels, and restores focus on Escape', () => {
    window.innerWidth = 390;
    render(workspace());
    expect(left()).toHaveAttribute('aria-expanded', 'false');
    expect(right()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('heading', { name: subject.name })).toHaveTextContent(subject.name);
    fireEvent.click(left()); fireEvent.click(right());
    expect(left()).toHaveAttribute('aria-expanded', 'true');
    expect(right()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(right()).toHaveAttribute('aria-expanded', 'false');
    expect(right()).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(left()).toHaveAttribute('aria-expanded', 'false');
    expect(left()).toHaveFocus();
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

  it('supports three-segment right-panel tab switcher (Passage, Notes, Retrieval) with distinct active states', () => {
    render(workspace());
    fireEvent.click(right());

    const passageTab = screen.getByRole('button', { name: 'Passage' });
    const notesTab = screen.getByRole('button', { name: /^Notes/i });
    const retrievalTab = screen.getByTestId('right-panel-tab-retrieval');

    expect(passageTab).toHaveClass('active');
    expect(notesTab).not.toHaveClass('active');
    expect(retrievalTab).not.toHaveClass('active');

    // Switch to Notes
    fireEvent.click(notesTab);
    expect(passageTab).not.toHaveClass('active');
    expect(notesTab).toHaveClass('active');
    expect(retrievalTab).not.toHaveClass('active');

    // Switch to Retrieval
    fireEvent.click(retrievalTab);
    expect(passageTab).not.toHaveClass('active');
    expect(notesTab).not.toHaveClass('active');
    expect(retrievalTab).toHaveClass('active');

    // Switch back to Passage
    fireEvent.click(passageTab);
    expect(passageTab).toHaveClass('active');
    expect(notesTab).not.toHaveClass('active');
    expect(retrievalTab).not.toHaveClass('active');
  });
});
