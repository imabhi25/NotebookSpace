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
    fireEvent.change(screen.getByLabelText('Response Length'), { target: { value: 'concise' } });
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
      <SettingsPanel isPrivacyBannerDismissed={false} onShowPrivacyNotice={() => {}} onRequestReset={() => {}} onClose={() => {}} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Export notes/ }));

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

  it('brings the privacy notice back and opens the reset confirmation', () => {
    window.localStorage.setItem('notebookspace_privacy_banner_dismissed', 'true');
    render(<DashboardView {...dashboardProps} />);
    expect(screen.queryByTestId('guest-workspace-banner')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Workspace settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Show privacy notice/ }));
    expect(screen.getByTestId('guest-workspace-banner')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Reset Workspace/ }));
    expect(screen.getByText('Reset Workspace?')).toBeTruthy();
  });
});
