import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DashboardView } from './components/DashboardView';

const noop = async () => {};
const subject = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, user_id: 'u', name, course_code: null, description: null, is_archived: false,
  settings: { response_length: 'default', response_style: 'general' },
  created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-12T10:00:00Z', source_count: 3, ...extra,
}) as any;
const subjects = [
  subject('a', 'Algorithms', { course_code: 'EECS 3101' }),
  subject('b', 'Operating Systems', { source_count: 1 }),
  subject('c', 'Old Course', { is_archived: true }),
];
const props = {
  subjects, loading: false, onOpenSubject: () => {}, onCreateSubject: noop, onUpdateSubject: noop,
  onArchiveSubject: noop, onRestoreSubject: noop, onDeleteSubject: noop,
};

describe('Notebook launcher grid', () => {
  it('shows every notebook as a card with its tag and meta line, and opens one on click', () => {
    const onOpenSubject = vi.fn();
    render(<DashboardView {...props} onOpenSubject={onOpenSubject} />);

    expect(screen.getByRole('heading', { name: 'My notebooks' })).toBeInTheDocument();
    const card = screen.getByTestId('subject-card-a');
    expect(within(card).getByText('EECS 3101')).toBeInTheDocument();
    expect(within(card).getByText('Oct 12')).toBeInTheDocument();
    expect(within(card).getByText('3')).toBeInTheDocument();
    expect(within(card).getByText('Indexed')).toBeInTheDocument();
    expect(within(screen.getByTestId('subject-card-b')).getByText('1')).toBeInTheDocument();
    expect(screen.queryByText(/Select a notebook/)).toBeNull();

    fireEvent.click(card);
    expect(onOpenSubject).toHaveBeenCalledWith('a');
  });

  it('filters with All, Active and Archived', () => {
    render(<DashboardView {...props} />);
    expect(screen.getByTestId('subject-card-c')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Active' }));
    expect(screen.queryByTestId('subject-card-c')).toBeNull();
    expect(screen.getByTestId('subject-card-a')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Archived' }));
    expect(screen.getByTestId('subject-card-c')).toBeInTheDocument();
    expect(screen.queryByTestId('subject-card-a')).toBeNull();
  });

  it('gives the same notebook the same mark tone every time', () => {
    const { unmount } = render(<DashboardView {...props} />);
    const tone = screen.getByTestId('subject-card-a').querySelector('.notebook-card-mark')!.className;
    unmount();
    render(<DashboardView {...props} />);
    expect(screen.getByTestId('subject-card-a').querySelector('.notebook-card-mark')!.className).toBe(tone);
    expect(tone).toMatch(/tone-[1-6]/);
  });

  it('opens the card menu without opening the notebook, and archives from it', () => {
    const onOpenSubject = vi.fn();
    const onArchiveSubject = vi.fn(noop);
    render(<DashboardView {...props} onOpenSubject={onOpenSubject} onArchiveSubject={onArchiveSubject} />);

    fireEvent.click(screen.getByRole('button', { name: 'Options for Algorithms' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(onArchiveSubject).toHaveBeenCalledWith('a');
    expect(onOpenSubject).not.toHaveBeenCalled();
  });

  it('keeps the first-notebook empty state when there are no notebooks', () => {
    render(<DashboardView {...props} subjects={[]} />);
    expect(screen.getByTestId('dashboard-empty-state')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Start with a subject. Make it yours.' })).toBeInTheDocument();
  });
});
