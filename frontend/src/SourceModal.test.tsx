import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SourceModal } from './components/SourceModal';

const noop = async () => {};

const openLinkTab = () => fireEvent.click(screen.getByRole('button', { name: 'Webpage URL' }));
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Add Source' }));

describe('Add sources dialog: link form (round-2 audit M3)', () => {
  it('is blank again after a link is saved', async () => {
    const onAddUrl = vi.fn(noop);
    const onClose = vi.fn();
    const props = { onUploadFiles: noop, onPasteText: noop, onAddUrl, onClose };
    const { rerender } = render(<SourceModal isOpen {...props} />);

    openLinkTab();
    fireEvent.change(screen.getByLabelText(/Public Webpage URL/), { target: { value: 'https://example.com/a' } });
    fireEvent.change(screen.getByLabelText(/Display Title/), { target: { value: 'Page A' } });
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onAddUrl).toHaveBeenCalledWith('https://example.com/a', 'Page A');

    rerender(<SourceModal isOpen={false} {...props} />);
    rerender(<SourceModal isOpen {...props} />);
    expect((screen.getByLabelText(/Public Webpage URL/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Display Title/) as HTMLInputElement).value).toBe('');
  });

  it('does not carry a typed link over after the dialog is cancelled', () => {
    const props = { onUploadFiles: noop, onPasteText: noop, onAddUrl: noop, onClose: () => {} };
    const { rerender } = render(<SourceModal isOpen {...props} />);

    openLinkTab();
    fireEvent.change(screen.getByLabelText(/Public Webpage URL/), { target: { value: 'https://example.com/b' } });
    fireEvent.change(screen.getByLabelText(/Display Title/), { target: { value: 'Page B' } });

    rerender(<SourceModal isOpen={false} {...props} />);
    rerender(<SourceModal isOpen {...props} />);
    expect((screen.getByLabelText(/Public Webpage URL/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Display Title/) as HTMLInputElement).value).toBe('');
  });

  it('keeps the values and shows the reason when the link is refused', async () => {
    const onAddUrl = vi.fn(async () => { throw new Error("Couldn't fetch this PDF: the file could not be read as text."); });
    const onClose = vi.fn();
    render(<SourceModal isOpen onUploadFiles={noop} onPasteText={noop} onAddUrl={onAddUrl} onClose={onClose} />);

    openLinkTab();
    fireEvent.change(screen.getByLabelText(/Public Webpage URL/), { target: { value: 'https://example.com/x.pdf' } });
    submit();
    await screen.findByText(/Couldn't fetch this PDF/);
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/Public Webpage URL/) as HTMLInputElement).value).toBe('https://example.com/x.pdf');
  });
});
