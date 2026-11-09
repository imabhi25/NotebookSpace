import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsPanel } from './components/SettingsPanel';
import { DashboardView } from './components/DashboardView';
import { applyTheme, getThemeSetting, watchSystemTheme, THEME_STORAGE_KEY } from './theme';

const noop = async () => {};

// A controllable stand-in for the operating system's colour-scheme preference.
const mockSystem = (dark: boolean) => {
  const listeners = new Set<() => void>();
  const query = {
    matches: dark,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  window.matchMedia = vi.fn().mockReturnValue(query) as any;
  return { set: (next: boolean) => { query.matches = next; listeners.forEach((fn) => fn()); } };
};

const renderSettings = () =>
  render(<SettingsPanel onRequestReset={() => {}} onClose={() => {}} />);

describe('Theme setting', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to Auto and follows the system, including later changes', () => {
    const system = mockSystem(true);
    applyTheme();
    const stop = watchSystemTheme();
    expect(getThemeSetting()).toBe('auto');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    system.set(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    stop();
  });

  it('offers Auto, Light and Dark in Settings, applies the choice and persists it', () => {
    mockSystem(false);
    renderSettings();
    const group = screen.getByRole('radiogroup', { name: 'Appearance' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');

    // A reload reads the stored choice, whatever the system says.
    document.documentElement.removeAttribute('data-theme');
    applyTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('an explicit choice ignores system changes; Auto clears the stored choice', () => {
    const system = mockSystem(false);
    const stop = watchSystemTheme();
    renderSettings();
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    system.set(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    fireEvent.click(screen.getByRole('radio', { name: 'System' }));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    stop();
  });

  it('has no theme control outside Settings', () => {
    mockSystem(false);
    render(
      <DashboardView subjects={[]} loading={false} onOpenSubject={() => {}} onCreateSubject={noop} onUpdateSubject={noop}
        onArchiveSubject={noop} onRestoreSubject={noop} onDeleteSubject={noop} />
    );
    expect(screen.queryByRole('radiogroup', { name: 'Appearance' })).toBeNull();
    expect(screen.queryByRole('button', { name: /theme|dark|light/i })).toBeNull();
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
