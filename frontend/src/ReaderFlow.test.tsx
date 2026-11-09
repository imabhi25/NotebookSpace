import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SubjectWorkspaceView } from './components/SubjectWorkspaceView';
import { api } from './api';
import { clearSourceTextCache } from './sourcePages';
import { MessageItem, Source, SourceType, Subject } from './types';

const subject: Subject = {
  id: 'rd', name: 'Reader notebook', course_code: 'RD 1',
  settings: { response_length: 'default', response_style: 'general' }, is_archived: false,
  source_count: 1, created_at: '2026-11-09', updated_at: '2026-11-09',
};
const mkSource = (over: Partial<Source> = {}): Source => ({
  id: 'a', subject_id: subject.id, user_id: 'g', title: 'Article', file_name: 'a.pdf', source_type: 'pdf', status: 'ready',
  version: 1, page_count: 3, word_count: 50, created_at: '2026-11-09', updated_at: '2026-11-09', ...over,
});
const chunk = 'The final exam is worth forty percent of the grade.';
const raw = [
  '--- Page 1 ---\nFirst page text.',
  `--- Page 2 ---\nIntro line.\nSecond line of intro.\n\n${chunk}\n\nClosing paragraph.`,
  '--- Page 3 ---\nThird page text.',
].join('\n\n');
const message: MessageItem = {
  id: 'm', conversation_id: 'c', user_id: 'g', role: 'assistant',
  content: 'The exam is worth 40% [a.pdf p.2].',
  citations: [{ file: 'a.pdf', page: 2, source_id: 'a', source_version: 1 }],
  conflicts: [], conflict_detected: false, abstained: false,
  retrieved: [{ source_id: 'a', file_name: 'a.pdf', page_number: 2, text: chunk, score: 0.8 }],
  selected_source_ids: ['a'], source_versions: { a: 1 },
  tokens: { input: 1, output: 1, total: 2 }, latency: 0, created_at: '2026-11-09',
};
// A second source keeps the notebook from showing its empty state when the cited one is gone.
const other = mkSource({ id: 'z', title: 'Other', file_name: 'z.pdf' });
const done = async () => {};
const view = (sources: Source[] = [mkSource()], messages: MessageItem[] = [message]) => (
  <SubjectWorkspaceView subject={subject} sources={sources} selectedSourceIds={['a']}
    conversations={[]} notes={[]} activeConversationId={null} starterQuestions={[]} isDemoMode={false}
    onBackToDashboard={vi.fn()} onSelectSources={vi.fn()} onSelectConversation={vi.fn()}
    onCreateConversation={done} onRenameConversation={done} onDeleteConversation={done}
    onUploadFiles={done} onPasteText={done} onAddUrl={done} onRenameSource={done}
    onDeleteSource={done} onRetrySource={done} onReplaceSource={done} onSendMessage={done}
    onUpdateSettings={done} onCreateNote={done} onSaveAnswerAsNote={done}
    onUpdateNote={done} onDeleteNote={done} messages={messages} chatLoading={false} />
);

const originalWidth = window.innerWidth;
let detail: MockInstance<typeof api.getSourceDetail>;
beforeEach(() => {
  window.innerWidth = 1440;
  try { window.localStorage.clear(); } catch { /* ignore */ }
  clearSourceTextCache();
  vi.spyOn(api, 'getPassages').mockResolvedValue([]);
  detail = vi.spyOn(api, 'getSourceDetail').mockImplementation(async (_s, id) => ({ ...mkSource({ id }), raw_content: raw }));
});
afterEach(() => { window.innerWidth = originalWidth; vi.restoreAllMocks(); });

const openEvidence = async () => {
  fireEvent.click(screen.getByRole('button', { name: /^Citation 1:/ }));
  return screen.findByTestId('inline-evidence');
};
const openReader = async () => {
  const pane = await openEvidence();
  const button = within(pane).getByRole('button', { name: 'Open in reader' });
  button.focus();
  fireEvent.click(button);
  return button;
};
const reader = () => screen.getByTestId('source-reader');
const escape = () => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });

describe('Source reader: opening and reading', () => {
  it('opens at the cited page without the chunk list and marks the retrieved passage', async () => {
    render(view());
    await openReader();
    await waitFor(() => expect(reader().querySelector('mark.reader-mark')).not.toBeNull());
    expect(detail).toHaveBeenCalledWith('rd', 'a', { includePassages: false });
    expect(reader()).toHaveTextContent('Page 2 of 3');
    expect(reader().querySelector('mark.reader-mark')).toHaveTextContent(chunk);
    // Screen readers get the start and end of the passage as text.
    expect(reader().querySelector('mark.reader-mark')).toHaveTextContent(/Start of retrieved passage/);
    expect(screen.getByRole('complementary', { name: 'Source reader' })).toBeInTheDocument();
  });

  it('rebuilds PDF paragraphs and moves between pages', async () => {
    render(view());
    await openReader();
    await waitFor(() => expect(reader().querySelectorAll('.reader-paragraph').length).toBe(3));
    fireEvent.click(within(reader()).getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(reader()).toHaveTextContent('Third page text.'));
    expect(reader()).toHaveTextContent('Page 3 of 3');
    expect(within(reader()).getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(reader().querySelector('mark.reader-mark')).toBeNull();
    fireEvent.click(within(reader()).getByRole('button', { name: 'Previous page' }));
    await waitFor(() => expect(reader().querySelector('mark.reader-mark')).not.toBeNull());
  });

  it('says so when the retrieved passage cannot be located', async () => {
    render(view([mkSource()], [{ ...message, retrieved: [{ ...message.retrieved[0], text: 'Words that are not on the page.' }] }]));
    await openReader();
    await waitFor(() => expect(reader()).toHaveTextContent('Second line of intro.'));
    expect(reader()).toHaveTextContent(/could not be located on this page/);
    expect(reader().querySelector('mark.reader-mark')).toBeNull();
  });

  it('labels a non-PDF source in sections and shows a page as one block', async () => {
    const type: SourceType = 'pasted';
    detail.mockImplementation(async (_s, id) => ({ ...mkSource({ id, source_type: type }), raw_content: '--- Page 1 ---\nOne block.\n\n--- Page 2 ---\nTwo blocks of words.' }));
    render(view([mkSource({ source_type: type, page_count: 2 })], [{ ...message, citations: [{ file: 'a.pdf', page: 2, source_id: 'a', source_version: 1 }] }]));
    await openReader();
    await waitFor(() => expect(reader()).toHaveTextContent('Two blocks of words.'));
    expect(reader()).toHaveTextContent('Section 2 of 2');
    expect(reader()).toHaveTextContent('about 350 words');
    expect(within(reader()).getByRole('button', { name: 'Previous section' })).toBeEnabled();
  });

  it('reports a failed load with Retry, and an empty source without inventing text', async () => {
    detail.mockRejectedValueOnce(new Error('boom'));
    render(view());
    await openReader();
    await screen.findByText('The source text could not be loaded.');
    expect(within(reader()).getByRole('button', { name: 'View as plain text' })).toBeInTheDocument();
    detail.mockResolvedValue({ ...mkSource(), raw_content: '' });
    fireEvent.click(within(reader()).getByRole('button', { name: 'Retry' }));
    await screen.findByText('No text was stored for this source.');
  });
});

describe('Source reader: expand, pointer and Escape (docked)', () => {
  it('expands and collapses, announces it, and returns focus to the Expand button', async () => {
    render(view());
    await openReader();
    await waitFor(() => expect(reader().querySelector('mark.reader-mark')).not.toBeNull());
    fireEvent.click(within(reader()).getByRole('button', { name: 'Expand reader' }));
    await waitFor(() => expect(document.querySelector('.workspace-layout')).toHaveAttribute('data-reader', 'expanded'));
    expect(within(reader()).getByRole('button', { name: 'Collapse' })).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(screen.getByTestId('reader-live-region')).toHaveTextContent('Reader expanded'));

    fireEvent.click(within(reader()).getByRole('button', { name: 'Collapse' }));
    await waitFor(() => expect(document.querySelector('.workspace-layout')).toHaveAttribute('data-reader', 'compact'));
    await waitFor(() => expect(within(reader()).getByRole('button', { name: 'Expand reader' })).toHaveFocus(), { timeout: 2000 });
  });

  it('Escape collapses an expanded reader and ignores a compact one', async () => {
    render(view());
    await openReader();
    await waitFor(() => expect(reader().querySelector('mark.reader-mark')).not.toBeNull());
    escape();
    expect(document.querySelector('.workspace-layout')).toHaveAttribute('data-reader', 'compact');
    fireEvent.click(within(reader()).getByRole('button', { name: 'Expand reader' }));
    await waitFor(() => expect(document.querySelector('.workspace-layout')).toHaveAttribute('data-reader', 'expanded'));
    escape();
    await waitFor(() => expect(document.querySelector('.workspace-layout')).toHaveAttribute('data-reader', 'compact'));
  });

  it('hides the navigation while expanded without room, and the toggle collapses the reader first', async () => {
    render(view());
    await openReader();
    fireEvent.click(within(reader()).getByRole('button', { name: 'Expand reader' }));
    await waitFor(() => expect(document.querySelector('.nav-slot')).toHaveClass('is-collapsed'));
    expect(window.localStorage.getItem('notebookspace_nav_open')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle sources panel' }));
    await waitFor(() => expect(document.querySelector('.workspace-layout')).toHaveAttribute('data-reader', 'compact'));
    expect(document.querySelector('.nav-slot')).not.toHaveClass('is-collapsed');
  });
});

describe('Source reader: closing', () => {
  it('Back returns to the evidence view and focuses the Open in reader button', async () => {
    render(view());
    await openReader();
    await waitFor(() => expect(reader().querySelector('mark.reader-mark')).not.toBeNull());
    fireEvent.click(within(reader()).getByRole('button', { name: 'Back to answer' }));
    await waitFor(() => expect(document.querySelector('.workspace-layout')).not.toHaveAttribute('data-reader'));
    expect(document.querySelector('.context-slot')).not.toHaveClass('is-collapsed');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open in reader' })).toHaveFocus());
  });
});

describe('Source reader: overlay (1024px)', () => {
  beforeEach(() => { window.innerWidth = 1024; });

  it('Escape steps back one level, then closes the panel and returns to the opener', async () => {
    render(view());
    const opener = await openReader();
    await waitFor(() => expect(reader().querySelector('mark.reader-mark')).not.toBeNull());
    fireEvent.click(within(reader()).getByRole('button', { name: 'Expand reader' }));
    await waitFor(() => expect(document.querySelector('.workspace-layout')).toHaveAttribute('data-reader', 'expanded'));

    escape(); // expanded -> compact; the overlay stays open
    await waitFor(() => expect(document.querySelector('.workspace-layout')).toHaveAttribute('data-reader', 'compact'));
    expect(document.querySelector('.context-slot')).not.toHaveClass('is-collapsed');
    await waitFor(() => expect(within(reader()).getByRole('button', { name: 'Expand reader' })).toHaveFocus(), { timeout: 2000 });

    escape(); // compact -> reader closed; the panel stays open on the evidence, focus returns to the opener
    await waitFor(() => expect(document.querySelector('.workspace-layout')).not.toHaveAttribute('data-reader'));
    expect(document.querySelector('.context-slot')).not.toHaveClass('is-collapsed');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open in reader' })).toHaveFocus());
    escape(); // evidence view in the overlay -> panel closed
    await waitFor(() => expect(document.querySelector('.context-slot')).toHaveClass('is-collapsed'));
    expect(opener).toBeDefined();
  });
});

describe('Source reader: replaced and removed sources', () => {
  it('offers only the current version for a replaced source and shows no mark', async () => {
    detail.mockImplementation(async (_s, id) => ({ ...mkSource({ id, version: 2 }), raw_content: raw }));
    render(view([mkSource({ version: 2 })]));
    const pane = await openEvidence();
    expect(within(pane).queryByRole('button', { name: 'Open in reader' })).toBeNull();
    fireEvent.click(within(pane).getByRole('button', { name: 'Open current version in reader (v2)' }));
    await waitFor(() => expect(reader()).toHaveTextContent('Second line of intro.'));
    expect(reader()).toHaveTextContent(/Current version \(v2\), not what the answer used/);
    expect(reader().querySelector('mark.reader-mark')).toBeNull();
  });

  it('offers nothing for a deleted source', async () => {
    render(view([other]));
    const pane = await openEvidence();
    expect(within(pane).queryByRole('button', { name: /^Open/ })).toBeNull();
  });

  it('switches to current text when the source is replaced while the reader is open', async () => {
    const { rerender } = render(view());
    await openReader();
    await waitFor(() => expect(reader().querySelector('mark.reader-mark')).not.toBeNull());
    rerender(view([mkSource({ version: 2 })]));
    await waitFor(() => expect(reader()).toHaveTextContent(/This source was replaced \(now v2\)/));
    expect(reader().querySelector('mark.reader-mark')).toBeNull();
  });

  it('says the source was removed when it is deleted while the reader is open', async () => {
    const { rerender } = render(view());
    await openReader();
    await waitFor(() => expect(reader().querySelector('mark.reader-mark')).not.toBeNull());
    rerender(view([other]));
    await waitFor(() => expect(reader()).toHaveTextContent('This source was removed from the notebook.'));
  });
});

describe('Source reader: opening from the source list', () => {
  const readFromList = async (title = 'Article') => {
    const more = screen.getByRole('button', { name: `Options for ${title}` });
    more.focus();
    fireEvent.click(more);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Read' }));
    return more;
  };

  it('opens a source on its first page with no passage mark', async () => {
    render(view());
    await readFromList();
    await waitFor(() => expect(reader()).toHaveTextContent('First page text.'));
    expect(reader()).toHaveTextContent('Page 1 of 3');
    expect(reader().querySelector('mark.reader-mark')).toBeNull();
    expect(reader()).not.toHaveTextContent(/could not be located/);
    expect(detail).toHaveBeenCalledWith('rd', 'a', { includePassages: false });
  });

  it('starts at the first stored page when page 1 has no text entry', async () => {
    detail.mockImplementation(async (_s, id) => ({ ...mkSource({ id }), raw_content: '--- Page 4 ---\nFourth.\n\n--- Page 5 ---\nFifth.' }));
    render(view());
    await readFromList();
    await waitFor(() => expect(reader()).toHaveTextContent('Fourth.'));
  });

  it('opens a collapsed panel without saving that choice, and Back collapses it and refocuses the row', async () => {
    window.localStorage.setItem('notebookspace_context_open', '0');
    render(view());
    const panel = document.querySelector('.context-slot') as HTMLElement;
    expect(panel).toHaveClass('is-collapsed');
    const more = await readFromList();
    await waitFor(() => expect(panel).not.toHaveClass('is-collapsed'));
    expect(window.localStorage.getItem('notebookspace_context_open')).toBe('0');
    fireEvent.click(within(reader()).getByRole('button', { name: 'Back to answer' }));
    await waitFor(() => expect(panel).toHaveClass('is-collapsed'));
    expect(window.localStorage.getItem('notebookspace_context_open')).toBe('0');
    await waitFor(() => expect(more).toHaveFocus());
  });

  it('does not offer Read for a source that is still processing', async () => {
    render(view([mkSource({ status: 'processing' })]));
    expect(screen.queryByRole('button', { name: 'Options for Article' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Options for Article' }));
    expect(screen.queryByRole('menuitem', { name: 'Read' })).toBeNull();
  });
});

describe('Full-text viewer (modal): load states', () => {
  const openViewer = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Options for Article' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'View' }));
  };

  it('shows an error with Retry instead of spinning forever, and recovers on retry', async () => {
    detail.mockRejectedValueOnce(new Error('boom'));
    render(view());
    await openViewer();
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('The source text could not be loaded.');
    expect(within(dialog).queryByText('Loading source content...')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(within(dialog).getByText(/Second line of intro\./)).toBeInTheDocument());
  });

  it('says so when a source has no stored text instead of loading forever', async () => {
    detail.mockResolvedValue({ ...mkSource(), raw_content: '', passages: [] });
    render(view());
    await openViewer();
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('No text was stored for this source.');
  });
});
