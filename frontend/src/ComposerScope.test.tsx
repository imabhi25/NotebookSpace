import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SubjectWorkspaceView } from './components/SubjectWorkspaceView';
import { Composer } from './components/Composer';
import { api } from './api';
import { MessageItem, Source, Subject } from './types';

// MOCKED: every test here uses props and vi.spyOn on `api`; none touches a real backend.
const subject: Subject = {
  id: 'p1', name: 'Phase one', course_code: 'P 1',
  settings: { response_length: 'default', response_style: 'general' }, is_archived: false,
  source_count: 4, created_at: '2026-10-12', updated_at: '2026-10-12',
};
const mk = (id: string, status: Source['status'], extra: Partial<Source> = {}): Source => ({
  id, subject_id: subject.id, user_id: 'g', title: `Title ${id}`, file_name: `${id}.pdf`, source_type: 'pdf', status,
  version: 1, page_count: 3, word_count: 50, created_at: '2026-10-12', updated_at: '2026-10-12', ...extra,
});
const sources = [mk('a', 'ready'), mk('b', 'ready'), mk('c', 'processing'), mk('d', 'failed', { error_message: 'Text could not be read.' })];
const message: MessageItem = {
  id: 'm', conversation_id: 'c1', user_id: 'g', role: 'assistant',
  content: 'One [a.pdf p.1] and two [b.pdf p.2].',
  citations: [
    { file: 'a.pdf', page: 1, source_id: 'a', source_version: 1, excerpt: 'First passage.' },
    { file: 'b.pdf', page: 2, source_id: 'b', source_version: 1, excerpt: 'Second passage.' },
    { file: 'a.pdf', page: 3, source_id: 'a', source_version: 1, excerpt: 'Third passage, never cited inline.' },
  ],
  conflicts: [], conflict_detected: false, abstained: false,
  retrieved: [{ source_id: 'a', file_name: 'a.pdf', page_number: 1, text: 'First passage.', score: 0.8 }],
  selected_source_ids: ['a'], source_versions: { a: 1, b: 1 },
  tokens: { input: 1, output: 1, total: 2 }, latency: 0, created_at: '2026-10-12',
};
const done = async () => {};

function Harness(props: { conv?: string | null; onSend?: (q: string) => Promise<void>; initial?: string[]; srcs?: Source[]; messages?: MessageItem[] }) {
  const [selected, setSelected] = useState<string[]>(props.initial ?? ['a']);
  return (
    <SubjectWorkspaceView subject={subject} sources={props.srcs ?? sources} selectedSourceIds={selected}
      conversations={[]} notes={[]} activeConversationId={props.conv === undefined ? 'c1' : props.conv} starterQuestions={[]} isDemoMode={false}
      onBackToDashboard={vi.fn()} onSelectSources={setSelected} onSelectConversation={vi.fn()}
      onCreateConversation={done} onRenameConversation={done} onDeleteConversation={done}
      onUploadFiles={done} onPasteText={done} onAddUrl={done} onRenameSource={done}
      onDeleteSource={done} onRetrySource={done} onReplaceSource={done} onSendMessage={props.onSend ?? done}
      onUpdateSettings={done} onCreateNote={done} onSaveAnswerAsNote={done}
      onUpdateNote={done} onDeleteNote={done} messages={props.messages ?? [message]} chatLoading={false} />
  );
}
const originalWidth = window.innerWidth;
beforeEach(() => { window.innerWidth = 1440; window.localStorage.clear(); window.sessionStorage.clear(); vi.spyOn(api, 'getPassages').mockResolvedValue([]); });
afterEach(() => { window.innerWidth = originalWidth; vi.restoreAllMocks(); });

describe('Scope chip reflects real selection and statuses (mocked)', () => {
  it('counts only ready, selected materials and reports processing and failed ones', () => {
    render(<Harness initial={['a', 'c', 'd']} />); // c and d are selected ids but cannot be used
    const chip = screen.getByTestId('scope-chip');
    expect(chip).toHaveTextContent('Using 1 of 4 materials · 1 processing · 1 failed');
    expect(chip).toHaveAccessibleName(/1 of 4 materials selected, 1 processing · 1 failed/);
  });

  it('lists every material with its status; only ready ones can be toggled', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('scope-chip'));
    const pop = screen.getByRole('dialog', { name: 'Materials for the next question' });
    expect(within(pop).getAllByRole('checkbox')).toHaveLength(4);
    expect(within(pop).getAllByText('3 pages · Ready')).toHaveLength(2);
    expect(within(pop).getByText('Processing…')).toBeInTheDocument();
    expect(within(pop).getByText('Text could not be read.')).toBeInTheDocument();
    expect(within(pop).getByRole('checkbox', { name: /Use Title c \(processing\)/ })).toBeDisabled();
    expect(within(pop).getByRole('checkbox', { name: /Use Title d \(failed\)/ })).toBeDisabled();
    expect(within(pop).getByRole('checkbox', { name: 'Use Title a' })).toBeChecked();
  });

  it('follows selection changes made in the chip, and shows "No materials selected" at zero', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('scope-chip'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use Title b' }));
    expect(screen.getByTestId('scope-chip')).toHaveTextContent('Using 2 of 4 materials');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByTestId('scope-chip')).toHaveTextContent('No materials selected');
    fireEvent.click(screen.getByRole('button', { name: 'Select all ready' }));
    expect(screen.getByTestId('scope-chip')).toHaveTextContent('Using 2 of 4 materials');
  });

  it('follows changes made in the materials panel too, and Escape returns focus to the chip', () => {
    render(<Harness />);
    const panelBox = screen.getAllByRole('checkbox', { name: /Select Title b/ })[0];
    fireEvent.click(panelBox);
    expect(screen.getByTestId('scope-chip')).toHaveTextContent('Using 2 of 4 materials');
    fireEvent.click(screen.getByTestId('scope-chip'));
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Materials for the next question' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Materials for the next question' })).toBeNull();
    expect(screen.getByTestId('scope-chip')).toHaveFocus();
  });
});

describe('Composer keys (mocked)', () => {
  const setup = (onSubmit = vi.fn()) => {
    const Wrapper = () => { const [q, setQ] = useState('hello'); return <Composer question={q} setQuestion={setQ} onSubmit={onSubmit} loading={false} />; };
    render(<Wrapper />);
    return { onSubmit, box: screen.getByRole('textbox') };
  };
  it('Enter while an IME composition is active does not send, and is not swallowed', () => {
    const { onSubmit, box } = setup();
    fireEvent.compositionStart(box);
    expect(fireEvent.keyDown(box, { key: 'Enter', isComposing: true })).toBe(true); // not default-prevented
    expect(fireEvent.keyDown(box, { key: 'Enter', keyCode: 229 })).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('the Enter that confirms a candidate right after compositionend does not send; a later Enter does', async () => {
    const { onSubmit, box } = setup();
    fireEvent.compositionStart(box); fireEvent.compositionEnd(box);
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 80));
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
  it('Shift+Enter inserts a newline: it never sends and is not prevented', () => {
    const { onSubmit, box } = setup();
    expect(fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('plain Enter sends once even when pressed twice before the first send settles', async () => {
    let release: () => void = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((r) => { release = r; }));
    const { box } = setup(onSubmit);
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});

describe('Session drafts (mocked)', () => {
  const box = () => screen.getByRole('textbox', { name: /Ask a question/ }) as HTMLTextAreaElement;
  it('keeps a separate draft per session across switching', () => {
    const { rerender } = render(<Harness conv="c1" />);
    fireEvent.change(box(), { target: { value: 'draft for one' } });
    rerender(<Harness conv="c2" />);
    expect(box().value).toBe('');
    fireEvent.change(box(), { target: { value: 'draft for two' } });
    rerender(<Harness conv="c1" />);
    expect(box().value).toBe('draft for one');
    rerender(<Harness conv="c2" />);
    expect(box().value).toBe('draft for two');
  });
  it('restores the draft after a reload (remount)', () => {
    const first = render(<Harness conv="c1" />);
    fireEvent.change(box(), { target: { value: 'survives reload' } });
    first.unmount();
    render(<Harness conv="c1" />);
    expect(box().value).toBe('survives reload');
  });
  it('clears the draft when the send succeeds', async () => {
    const onSend = vi.fn(async () => {});
    render(<Harness conv="c1" onSend={onSend} />);
    fireEvent.change(box(), { target: { value: 'send me' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('send me'));
    await waitFor(() => expect(box().value).toBe(''));
    expect(window.sessionStorage.getItem('notebookspace_draft_p1_c1')).toBeNull();
  });
  it('brings the draft back when the send fails', async () => {
    const onSend = vi.fn(async () => { throw new Error('network'); });
    render(<Harness conv="c1" onSend={onSend} />);
    fireEvent.change(box(), { target: { value: 'keep me' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    await waitFor(() => expect(box().value).toBe('keep me'));
    expect(window.sessionStorage.getItem('notebookspace_draft_p1_c1')).toBe('keep me');
  });
  it('a new session has its own draft key', () => {
    render(<Harness conv={null} messages={[]} />);
    fireEvent.change(box(), { target: { value: 'first question' } });
    expect(window.sessionStorage.getItem('notebookspace_draft_p1_new')).toBe('first question');
  });
});

describe('Answer actions and citation access without the chip row (mocked)', () => {
  it('shows numbered markers that match Evidence n of N, plus every action', () => {
    render(<Harness />);
    expect(screen.queryByTestId('citation-chip-0')).toBeNull();
    const markers = screen.getAllByTestId('inline-citation');
    expect(markers.map((m) => m.textContent)).toEqual(['1', '2']);
    expect(markers[1]).toHaveAccessibleName('Citation 2: b.pdf, page 2');
    for (const name of ['Copy', 'Save to note', 'Retry question', 'Evidence, 3 cited passages', 'Retrieval details']) {
      expect(screen.getByRole('button', { name: new RegExp(name.replace('Copy', '^Copy')) })).toBeInTheDocument();
    }
  });
  it('reaches a citation that has no marker in the text through Evidence and Next', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Evidence, 3 cited passages' }));
    const ev = await screen.findByTestId('inline-evidence');
    expect(within(ev).getByRole('heading', { level: 3 })).toHaveTextContent('Evidence 1 of 3');
    fireEvent.click(within(ev).getByRole('button', { name: 'Next citation' }));
    fireEvent.click(within(screen.getByTestId('inline-evidence')).getByRole('button', { name: 'Next citation' }));
    await waitFor(() => expect(screen.getByTestId('inline-evidence')).toHaveTextContent('Third passage, never cited inline.'));
  });
  it('marks a replaced source on its citation marker', () => {
    const replaced = [mk('a', 'ready', { version: 2 }), mk('b', 'ready')];
    render(<Harness srcs={replaced} />);
    expect(screen.getByRole('button', { name: 'Citation 1: a.pdf, page 1, replaced source' })).toHaveClass('replaced');
  });
  it('removes the disabled research-depth selector but keeps the link form', () => {
    render(<Harness />);
    expect(screen.queryByRole('combobox', { name: 'Research depth' })).toBeNull();
    expect(screen.getByRole('search', { name: 'Add a web page as a source' })).toBeInTheDocument();
  });
});
