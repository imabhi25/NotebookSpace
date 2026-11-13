import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SourceModal } from './components/SourceModal';

const noop = async () => {};
const files = () => [
  new File(['a'], 'a.pdf', { type: 'application/pdf' }),
  new File(['b'], 'b.md', { type: 'text/markdown' }),
];

describe('SourceModal upload flow', () => {
  it('removes a queued file and pluralises the button', () => {
    render(<SourceModal isOpen onClose={() => {}} onUploadFiles={noop} onPasteText={noop} onAddUrl={noop} initialFiles={files()} />);
    expect(screen.getByRole('button', { name: 'Add 2 Sources' })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove file' })[0]);
    expect(screen.getByRole('button', { name: 'Add Source' })).toBeTruthy();
    expect(screen.queryByText('a.pdf')).toBeNull();
  });

  it('shows plain loading copy, then auto-closes when every file is added', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    let release: () => void = () => {};
    const upload = vi.fn(() => new Promise<void>((r) => { release = r; }));
    render(<SourceModal isOpen onClose={onClose} onUploadFiles={upload} onPasteText={noop} onAddUrl={noop} initialFiles={[files()[0]]} />);
    fireEvent.click(screen.getByTestId('submit-add-source-btn'));
    expect(screen.getByTestId('submit-add-source-btn').textContent).toBe('Adding sources...');
    await act(async () => { release(); });
    expect(screen.getByText('✓ Added')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('stays open with Done and Add more when a file fails', async () => {
    const onClose = vi.fn();
    render(<SourceModal isOpen onClose={onClose} onUploadFiles={async () => { throw new Error('Bad file'); }} onPasteText={noop} onAddUrl={noop} initialFiles={[files()[0]]} />);
    fireEvent.click(screen.getByTestId('submit-add-source-btn'));
    await screen.findByText('✕ Failed');
    expect(screen.getByRole('button', { name: 'Add more' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
