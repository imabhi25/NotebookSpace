import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsPanel, readDefaultResponseSettings } from './components/SettingsPanel';
import { DashboardView } from './components/DashboardView';
import { api } from './api';

const noop = async () => {};
const dashboardProps = {
  subjects: [],
  loading: false,
  onOpenSubject: () => {},
  onCreateSubject: noop,
  onUpdateSubject: noop,
  onArchiveSubject: noop,
  onRestoreSubject: noop,
  onDeleteSubject: noop,
};

describe('Workspace settings', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('stores default response preferences and sends them with a new notebook', async () => {
    const onCreateSubject = vi.fn(async (_data: Record<string, any>) => {});
    render(<DashboardView {...dashboardProps} onCreateSubject={onCreateSubject} />);

    fireEvent.click(screen.getByRole('button', { name: 'Workspace settings' }));
    fireEvent.change(screen.getByLabelText('Answer depth'), { target: { value: 'concise' } });
    expect(readDefaultResponseSettings()).toEqual({ response_length: 'concise', response_style: 'general' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: 'Create new notebook' }));
    fireEvent.change(screen.getByLabelText(/Notebook Name/i), { target: { value: 'Algorithms' } });
    fireEvent.submit(screen.getByLabelText(/Notebook Name/i).closest('form')!);

    await waitFor(() => expect(onCreateSubject).toHaveBeenCalled());
    expect(onCreateSubject.mock.calls[0][0]).toMatchObject({
      name: 'Algorithms',
      settings: { response_length: 'concise', response_style: 'general' },
    });
  });

  it('leaves the create payload unchanged when no defaults were chosen', async () => {
    const onCreateSubject = vi.fn(async (_data: Record<string, any>) => {});
    render(<DashboardView {...dashboardProps} onCreateSubject={onCreateSubject} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create new notebook' }));
    fireEvent.change(screen.getByLabelText(/Notebook Name/i), { target: { value: 'Algorithms' } });
    fireEvent.submit(screen.getByLabelText(/Notebook Name/i).closest('form')!);
    await waitFor(() => expect(onCreateSubject).toHaveBeenCalled());
    expect(onCreateSubject.mock.calls[0][0]).not.toHaveProperty('settings');
  });

  it('exports every notebook with its notes as a JSON download', async () => {
    vi.spyOn(api, 'getSubjects').mockResolvedValue([
      { id: 's1', name: 'Algorithms', course_code: 'EECS 3101', description: '', is_archived: false } as any,
    ]);
    vi.spyOn(api, 'getNotes').mockResolvedValue([
      { id: 'n1', title: 'LCS', content: 'table', is_saved_answer: true, citations: [], created_at: 'a', updated_at: 'b' } as any,
    ]);
    let exported: Blob | null = null;
    (URL as any).createObjectURL = vi.fn((b: Blob) => { exported = b; return 'blob:x'; });
    (URL as any).revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      <SettingsPanel onRequestReset={() => {}} onClose={() => {}} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));

    await screen.findByText('Downloaded');
    expect(api.getSubjects).toHaveBeenCalledWith(true);
    expect(click).toHaveBeenCalled();
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(exported!);
    });
    const data = JSON.parse(text);
    expect(data.notebooks[0]).toMatchObject({ name: 'Algorithms', notes: [{ title: 'LCS', content: 'table' }] });
  });

  it('has no privacy-notice row, states local storage, and opens the reset confirmation', () => {
    render(<DashboardView {...dashboardProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Workspace settings' }));
    expect(screen.queryByText(/Show privacy notice/)).toBeNull();
    expect(screen.getByText('Stored locally in your browser. No account required.')).toBeTruthy();
    expect(screen.getByLabelText('Reading font')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Reset Workspace/ }));
    expect(screen.getByText('Reset Workspace?')).toBeTruthy();
  });

  it('applies the reading font and has no guest avatar in the header', () => {
    render(<DashboardView {...dashboardProps} />);
    expect(document.querySelector('.library-account')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Workspace settings' }));
    fireEvent.change(screen.getByLabelText('Reading font'), { target: { value: 'serif' } });
    expect(document.documentElement.getAttribute('data-reading-font')).toBe('serif');
    expect(window.localStorage.getItem('notebookspace_reading_font')).toBe('serif');
    document.documentElement.removeAttribute('data-reading-font');
  });
});
