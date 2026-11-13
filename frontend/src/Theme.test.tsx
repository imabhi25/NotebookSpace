import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsPanel } from './components/SettingsPanel';
import { DashboardView } from './components/DashboardView';
import { applyTheme, THEME_STORAGE_KEY } from './theme';

const noop = async () => {};

const renderSettings = () =>
  render(<SettingsPanel onRequestReset={() => {}} onClose={() => {}} />);

describe('Light-only theme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('is always light, even with a stored dark choice or an OS dark preference', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }) as any;
    applyTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('shows no theme control in Settings or on the dashboard', () => {
    renderSettings();
    expect(screen.queryByRole('radiogroup', { name: 'Appearance' })).toBeNull();
    expect(screen.queryByText(/Appearance|Dark|System/)).toBeNull();
    expect(document.querySelector('select')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Academic Serif' })).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Detailed' })).toBeVisible();
    render(
      <DashboardView subjects={[]} loading={false} onOpenSubject={() => {}} onCreateSubject={noop} onUpdateSubject={noop}
        onArchiveSubject={noop} onRestoreSubject={noop} onDeleteSubject={noop} />
    );
    expect(screen.queryByRole('button', { name: /theme|dark/i })).toBeNull();
  });
});

describe('Notebook cards', () => {
  it('shows a quiet first-source line for notebooks with no sources', () => {
    const base = { user_id: 'u', description: null, is_archived: false, settings: {}, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-12T10:00:00Z' };
    render(
      <DashboardView
        subjects={[
          { ...base, id: 'a', name: 'Algorithms', course_code: 'EECS 3101', source_count: 0 },
          { ...base, id: 'b', name: 'Systems', course_code: 'EECS 3221', source_count: 2 },
        ] as any}
        loading={false} onOpenSubject={() => {}} onCreateSubject={noop} onUpdateSubject={noop}
        onArchiveSubject={noop} onRestoreSubject={noop} onDeleteSubject={noop}
      />
    );
    const empty = screen.getByTestId('subject-card-a');
    expect(empty).toHaveTextContent('No sources yet');
    expect(empty).toHaveTextContent('EECS 3101');
    expect(empty).not.toHaveTextContent('0 sources');
    expect(screen.getByTestId('subject-card-b')).toHaveTextContent(/2 sources · Updated Oct 12/);
  });
});
