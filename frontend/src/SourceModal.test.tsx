import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SourceModal, formatFileSize } from './components/SourceModal';

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

  it('reproduces bug 1: clicking Done on paste tab after uploading file must not discard pasted text', async () => {
    const onUploadFiles = vi.fn(noop);
    const onPasteText = vi.fn(noop);
    const onClose = vi.fn();
    render(
      <SourceModal
        isOpen
        onUploadFiles={onUploadFiles}
        onPasteText={onPasteText}
        onAddUrl={noop}
        onClose={onClose}
      />
    );

    // 1. Upload a file on the upload tab
    const file = new File(['sample content'], 'doc.txt', { type: 'text/plain' });
    const dropzone = screen.getByRole('button', { name: /Drag and drop files here/i });
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file], types: ['Files'] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Source' }));

    // Wait for upload result to appear
    await screen.findByText('Upload Results');
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();

    // 2. Switch to Paste Text tab
    fireEvent.click(screen.getByRole('button', { name: 'Paste Text' }));
    fireEvent.change(screen.getByLabelText(/Source Title/), { target: { value: 'Lecture 1 Notes' } });
    fireEvent.change(screen.getByLabelText(/Text Content/), { target: { value: 'Binary search complexity is O(log n).' } });

    // 3. Click Done
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    // 4. Assert onPasteText was called with the title and content
    expect(onPasteText).toHaveBeenCalledWith('Lecture 1 Notes', 'Binary search complexity is O(log n).');
  });

  it('keeps the dialog open with a clear error message when Done is clicked with invalid paste fields', async () => {
    const onPasteText = vi.fn(noop);
    const onClose = vi.fn();
    render(
      <SourceModal
        isOpen
        onUploadFiles={noop}
        onPasteText={onPasteText}
        onAddUrl={noop}
        onClose={onClose}
      />
    );

    // 1. Upload a file so Done button is displayed
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    fireEvent.drop(screen.getByRole('button', { name: /Drag and drop files here/i }), {
      dataTransfer: { files: [file], types: ['Files'] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Source' }));
    await screen.findByText('Upload Results');

    // 2. Switch to Paste Text tab and provide title but NO content
    fireEvent.click(screen.getByRole('button', { name: 'Paste Text' }));
    fireEvent.change(screen.getByLabelText(/Source Title/), { target: { value: 'Incomplete Notes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    // Dialog stays open and shows error
    expect(onClose).not.toHaveBeenCalled();
    expect(onPasteText).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter or paste the text content.');

    // 3. Clear title and provide content but NO title
    fireEvent.change(screen.getByLabelText(/Source Title/), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/Text Content/), { target: { value: 'Some text content here' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(onPasteText).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a title for the pasted content.');
  });

  it('formats file sizes under 1 KB as bytes and above 1 KB with one decimal place', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1023)).toBe('1023 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(1048576)).toBe('1.0 MB');
    expect(formatFileSize(2621440)).toBe('2.5 MB');
  });
});
