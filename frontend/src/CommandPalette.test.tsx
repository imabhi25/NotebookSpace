import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SubjectWorkspaceView } from './components/SubjectWorkspaceView';
import { CommandItem, matchShortcut, rankCommands, scoreCommand } from './commandPalette';
import { Conversation, Note, Source, Subject } from './types';
import { api } from './api';

const item = (id: string, group: CommandItem['group'], label: string, extra: Partial<CommandItem> = {}): CommandItem =>
  ({ id, group, label, run: () => {}, ...extra });

describe('rankCommands', () => {
  const items = [
    item('1', 'Actions', 'New session', { keywords: 'conversation chat' }),
    item('2', 'Actions', 'Add sources', { keywords: 'upload paste' }),
    item('3', 'Sources', 'Syllabus.pdf', { hint: 'PDF · 3 pages' }),
    item('4', 'Sources', 'Lecture notes on session design'),
    item('5', 'Notes', 'Exam weights', { hint: 'the final is 40%' }),
  ];
  it('returns everything, grouped in a fixed order, for an empty query', () => {
    expect(rankCommands(items, '').map((i) => i.id)).toEqual(['1', '2', '3', '4', '5']);
  });
  it('needs every word to match somewhere, including hints and hidden keywords', () => {
    expect(rankCommands(items, 'upload').map((i) => i.id)).toEqual(['2']);
    expect(rankCommands(items, '40%').map((i) => i.id)).toEqual(['5']);
    expect(rankCommands(items, 'pdf pages').map((i) => i.id)).toEqual(['3']);
    expect(rankCommands(items, 'session zzz')).toEqual([]);
  });
  it('ranks a label start above a word start above a substring, keeping order on ties', () => {
    const r = rankCommands([item('a', 'Actions', 'Resession'), item('b', 'Actions', 'A session'), item('c', 'Actions', 'Session start')], 'session');
    expect(r.map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });
  it('ignores case and accents', () => {
    expect(scoreCommand(item('x', 'Notes', 'Café résumé'), 'CAFE RESUME')).toBeGreaterThan(0);
  });
  it('escapes regular-expression characters in the query', () => {
    expect(() => rankCommands(items, '(*[')).not.toThrow();
  });
});

describe('matchShortcut', () => {
  const key = (k: string, over: object = {}) => matchShortcut({ key: k, metaKey: false, ctrlKey: true, shiftKey: false, altKey: false, repeat: false, isComposing: false, ...over });
  it('maps K, B and backslash with the platform modifier', () => {
    expect(key('k')).toBe('palette');
    expect(key('K')).toBe('palette');
    expect(key('b', { ctrlKey: false, metaKey: true })).toBe('sources');
    expect(key('\\')).toBe('study');
  });
  it('leaves other keys, shifted or alted keys, repeats and IME input alone', () => {
    expect(key('n')).toBeNull();
    expect(key('k', { ctrlKey: false })).toBeNull();
    expect(key('k', { shiftKey: true })).toBeNull();
    expect(key('k', { altKey: true })).toBeNull();
    expect(key('k', { repeat: true })).toBeNull();
    expect(key('k', { isComposing: true })).toBeNull();
  });
});

const subject: Subject = {
  id: 'cp', name: 'Palette notebook', course_code: 'CP 1', settings: { response_length: 'default', response_style: 'general' },
  is_archived: false, source_count: 1, created_at: '2026-11-09', updated_at: '2026-11-09',
};
const source: Source = {
  id: 'a', subject_id: 'cp', user_id: 'g', title: 'Syllabus', file_name: 'syllabus.pdf', source_type: 'pdf', status: 'ready',
  version: 1, page_count: 3, word_count: 50, created_at: '2026-11-09', updated_at: '2026-11-09',
};
const conversation: Conversation = { id: 'c1', subject_id: 'cp', user_id: 'g', title: 'Exam planning', created_at: '2026-11-09', updated_at: '2026-11-09' };
const note: Note = { id: 'n1', subject_id: 'cp', user_id: 'g', title: 'Grading scheme', content: 'Final exam is forty percent.', is_saved_answer: false, created_at: '2026-11-09', updated_at: '2026-11-09' } as Note;

const done = async () => {};
const handlers = { onSelectConversation: vi.fn(), onCreateConversation: vi.fn(async () => {}), onBackToDashboard: vi.fn() };
const view = () => (
  <SubjectWorkspaceView subject={subject} sources={[source]} selectedSourceIds={['a']}
    conversations={[conversation]} notes={[note]} activeConversationId={null} starterQuestions={[]} isDemoMode={false}
    onBackToDashboard={handlers.onBackToDashboard} onSelectSources={vi.fn()} onSelectConversation={handlers.onSelectConversation}
    onCreateConversation={handlers.onCreateConversation} onRenameConversation={done} onDeleteConversation={done}
    onUploadFiles={done} onPasteText={done} onAddUrl={done} onRenameSource={done}
    onDeleteSource={done} onRetrySource={done} onReplaceSource={done} onSendMessage={done}
    onUpdateSettings={done} onCreateNote={done} onSaveAnswerAsNote={done}
    onUpdateNote={done} onDeleteNote={done} messages={[]} chatLoading={false} />
);
const originalWidth = window.innerWidth;
beforeEach(() => {
  window.innerWidth = 1440;
  try { window.localStorage.clear(); } catch { /* ignore */ }
  vi.spyOn(api, 'getSourceDetail').mockResolvedValue({ ...source, raw_content: '--- Page 1 ---\nHello.' });
});
afterEach(() => { window.innerWidth = originalWidth; vi.restoreAllMocks(); vi.clearAllMocks(); });

const press = (key: string, over: Partial<KeyboardEventInit> = {}) =>
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...over })); });
const palette = () => screen.getByTestId('command-palette');

describe('Command palette in the workspace', () => {
  it('opens with Ctrl+K, closes with the same keys and with Escape, and returns focus', async () => {
    render(view());
    const opener = screen.getByTestId('open-command-palette');
    opener.focus();
    press('k');
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    expect(within(palette()).getByRole('combobox')).toHaveFocus();
    press('k');
    await waitFor(() => expect(screen.queryByTestId('command-palette')).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());

    fireEvent.click(opener);
    await screen.findByTestId('command-palette');
    fireEvent.keyDown(within(palette()).getByRole('combobox'), { key: 'Escape' });
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await waitFor(() => expect(screen.queryByTestId('command-palette')).toBeNull());
  });

  it('searches sessions, sources and notes, and runs the highlighted entry with Enter', async () => {
    render(view());
    press('k');
    const box = await screen.findByRole('combobox');
    fireEvent.change(box, { target: { value: 'exam' } });
    const options = within(palette()).getAllByRole('option').map((o) => o.textContent);
    expect(options.some((t) => t?.includes('Exam planning'))).toBe(true);
    expect(options.some((t) => t?.includes('Grading scheme'))).toBe(true); // matched through the note's text
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(handlers.onSelectConversation).toHaveBeenCalledWith('c1'));
    expect(screen.queryByTestId('command-palette')).toBeNull();
  });

  it('moves with the arrow keys and exposes the highlighted option to assistive tech', async () => {
    render(view());
    press('k');
    const box = await screen.findByRole('combobox');
    const first = within(palette()).getAllByRole('option')[0];
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(box).toHaveAttribute('aria-activedescendant', first.id);
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    const second = within(palette()).getAllByRole('option')[1];
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(box).toHaveAttribute('aria-activedescendant', second.id);
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    fireEvent.keyDown(box, { key: 'ArrowUp' }); // wraps to the last entry
    const all = within(palette()).getAllByRole('option');
    expect(all[all.length - 1]).toHaveAttribute('aria-selected', 'true');
  });

  it('runs commands: opening a source and offers no theme commands', async () => {
    render(view());
    press('k');
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'theme' } });
    expect(within(palette()).queryAllByRole('option', { name: /theme/i })).toHaveLength(0);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'syllabus' } });
    fireEvent.click(within(palette()).getByRole('option', { name: /Syllabus/ }));
    expect(await screen.findByRole('dialog', { name: /Syllabus/ })).toBeInTheDocument();
  });

  it('says when nothing matches', async () => {
    render(view());
    press('k');
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'qqqq' } });
    expect(within(palette()).getByText(/Nothing matches/)).toBeInTheDocument();
    expect(within(palette()).queryAllByRole('option')).toHaveLength(0);
  });

  it('does not open over another dialog', async () => {
    render(view());
    fireEvent.click(screen.getByRole('button', { name: 'Conversation history' }));
    await screen.findByRole('dialog', { name: /Conversation history/ });
    press('k');
    expect(screen.queryByTestId('command-palette')).toBeNull();
  });
});

describe('Panel shortcuts', () => {
  it('Ctrl+B toggles the sources panel and Ctrl+\\ toggles the study panel', async () => {
    render(view());
    const nav = document.querySelector('.nav-slot') as HTMLElement;
    const study = document.querySelector('.context-slot') as HTMLElement;
    expect(nav).not.toHaveClass('is-collapsed');
    press('b');
    await waitFor(() => expect(nav).toHaveClass('is-collapsed'));
    press('b');
    await waitFor(() => expect(nav).not.toHaveClass('is-collapsed'));
    const studyOpen = !study.classList.contains('is-collapsed');
    press('\\');
    await waitFor(() => expect(study.classList.contains('is-collapsed')).toBe(studyOpen));
  });

  it('leaves plain keys, Shift and Alt combinations alone', () => {
    render(view());
    const nav = document.querySelector('.nav-slot') as HTMLElement;
    press('b', { ctrlKey: false });
    press('b', { shiftKey: true });
    press('b', { altKey: true });
    expect(nav).not.toHaveClass('is-collapsed');
  });

  it('does not toggle panels while the palette is open', async () => {
    render(view());
    press('k');
    await screen.findByTestId('command-palette');
    press('b');
    expect(document.querySelector('.nav-slot')).not.toHaveClass('is-collapsed');
  });
});
