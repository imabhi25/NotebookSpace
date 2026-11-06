import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import React, { useState } from 'react';
import { Composer } from './components/Composer';
import { SourceRow } from './components/SourceRow';
import { Source } from './types';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Composer double-click protection (Bug 2)', () => {
  it('does not trigger onStop if clicked within 500ms of send', () => {
    vi.useFakeTimers();
    const onStop = vi.fn();
    const onSubmit = vi.fn();

    const TestHarness = () => {
      const [loading, setLoading] = useState(false);
      const [question, setQuestion] = useState('What is the midterm date?');

      const handleSubmit = (e: React.FormEvent) => {
        onSubmit(e);
        setLoading(true);
      };

      return (
        <Composer
          question={question}
          setQuestion={setQuestion}
          onSubmit={handleSubmit}
          loading={loading}
          onStop={onStop}
        />
      );
    };

    render(<TestHarness />);

    const sendBtn = screen.getByRole('button', { name: /Ask Question/i });

    const form = sendBtn.closest('form')!;

    // First click: triggers submit and switches button to stop state
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // Button is now Stop generation
    const stopBtn = screen.getByRole('button', { name: /Stop generation/i });
    expect(stopBtn).toBeInTheDocument();

    // Fast second click at 100ms: double-click scenario
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.click(stopBtn);
    expect(onStop).not.toHaveBeenCalled();

    // Third click at 300ms (total 400ms from send)
    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.click(stopBtn);
    expect(onStop).not.toHaveBeenCalled();

    // Click after 550ms (total > 500ms from send): onStop should now fire
    act(() => {
      vi.advanceTimersByTime(150);
    });
    fireEvent.click(stopBtn);
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});

describe('SourceRow failed state actions and menu (Bug 3)', () => {
  const baseFailedSource: Source = {
    id: 'src-123',
    subject_id: 'sub-456',
    user_id: 'usr-789',
    title: 'broken_file.pdf',
    file_name: 'broken_file.pdf',
    source_type: 'pdf',
    status: 'failed',
    error_message: 'The PDF file is corrupted or empty.',
    page_count: 0,
    word_count: 0,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('renders Failed badge and provides Retry and Remove actions in menu for failed file source', () => {
    const onRetry = vi.fn();
    const onReplace = vi.fn();
    const onRemove = vi.fn();

    render(
      <SourceRow
        source={baseFailedSource}
        isSelected={false}
        onToggle={vi.fn()}
        onView={vi.fn()}
        onRename={vi.fn()}
        onRetry={onRetry}
        onReplace={onReplace}
        onRemove={onRemove}
      />
    );

    // Failed badge is shown
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toHaveAttribute('title', 'The PDF file is corrupted or empty.');

    // Checkbox is disabled for failed source
    const checkbox = screen.getByTestId('source-checkbox-src-123');
    expect(checkbox).toBeDisabled();

    // Open options menu
    const moreBtn = screen.getByRole('button', { name: /Options for broken_file\.pdf/i });
    fireEvent.click(moreBtn);

    // Menu should contain Retry and Remove, but NOT View or Rename
    expect(screen.getByRole('menuitem', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'View' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument();

    // Clicking Retry on a failed file calls onReplace (to select a file)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Retry' }));
    expect(onReplace).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();

    // Re-open and click Remove
    fireEvent.click(moreBtn);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('calls onRetry when clicking Retry on a failed URL source', () => {
    const onRetry = vi.fn();
    const onReplace = vi.fn();

    const failedUrlSource: Source = {
      ...baseFailedSource,
      title: 'https://broken.link',
      file_name: 'broken.link',
      source_type: 'url',
      error_message: 'HTTP 404 Not Found',
    };

    render(
      <SourceRow
        source={failedUrlSource}
        isSelected={false}
        onToggle={vi.fn()}
        onView={vi.fn()}
        onRename={vi.fn()}
        onRetry={onRetry}
        onReplace={onReplace}
        onRemove={vi.fn()}
      />
    );

    const moreBtn = screen.getByRole('button', { name: /Options for https:\/\/broken\.link/i });
    fireEvent.click(moreBtn);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onReplace).not.toHaveBeenCalled();
  });
});
