import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

describe('Course-Document Assistant UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders normal answer and citation chips', async () => {
    const mockAskResponse = {
      answer: 'Office hours are held on Wednesdays [syllabus.pdf p.2].',
      citations: [{ file: 'syllabus.pdf', page: 2 }],
      conflicts: [],
      conflict_detected: false,
      abstained: false,
      abstain_reason: null,
      retrieved: [],
      tokens: { input: 10, output: 10, total: 20 },
      latency: 0.5,
    };

    const mockPassages = [
      {
        file_name: 'syllabus.pdf',
        page_number: 2,
        chunk_index: 0,
        text: 'Office hours are Wednesdays 1-3pm in CS-101.',
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/documents')) {
        return { ok: true, json: async () => [] } as Response;
      }
      if (urlStr.includes('/ask')) {
        return { ok: true, json: async () => mockAskResponse } as Response;
      }
      if (urlStr.includes('/passages')) {
        return { ok: true, json: async () => mockPassages } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<App />);

    const input = screen.getByPlaceholderText(/When is the final exam/i);
    fireEvent.change(input, { target: { value: 'When are office hours?' } });

    const askButton = screen.getByRole('button', { name: /Ask Question/i });
    fireEvent.click(askButton);

    await waitFor(() => {
      expect(screen.getByTestId('answer-view')).toBeInTheDocument();
    });

    expect(screen.getByText(/Office hours are held on Wednesdays/i)).toBeInTheDocument();
    expect(screen.getByTestId('citation-chip-0')).toHaveTextContent('syllabus.pdf p.2');
  });

  it('renders abstention state with plain explanation and what was searched', async () => {
    const mockAbstainResponse = {
      answer: 'NOT_FOUND',
      citations: [],
      conflicts: [],
      conflict_detected: false,
      abstained: true,
      abstain_reason: 'not_found',
      retrieved: [],
      tokens: { input: 10, output: 5, total: 15 },
      latency: 0.3,
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/documents')) {
        return { ok: true, json: async () => [] } as Response;
      }
      if (urlStr.includes('/ask')) {
        return { ok: true, json: async () => mockAbstainResponse } as Response;
      }
      return { ok: false } as Response;
    });

    render(<App />);

    const input = screen.getByPlaceholderText(/When is the final exam/i);
    fireEvent.change(input, { target: { value: 'What is the professor phone number?' } });

    const askButton = screen.getByRole('button', { name: /Ask Question/i });
    fireEvent.click(askButton);

    await waitFor(() => {
      expect(screen.getByTestId('abstained-view')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/The requested information could not be found in the course documents/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Searched for: “What is the professor phone number\?”/i)
    ).toBeInTheDocument();
  });

  it('renders conflict view with "These documents disagree" heading and side-by-side cards', async () => {
    const mockConflictResponse = {
      answer: 'The syllabus says Oct 10 [syllabus.pdf p.1], but assignment handout says Oct 15 [assignment.pdf p.2].',
      citations: [
        { file: 'syllabus.pdf', page: 1 },
        { file: 'assignment.pdf', page: 2 },
      ],
      conflicts: [
        {
          topic: 'Due Date',
          claims: [
            {
              file: 'syllabus.pdf',
              page: 1,
              value: 'October 10',
              upload_date: '2026-09-01T10:00:00',
            },
            {
              file: 'assignment.pdf',
              page: 2,
              value: 'October 15',
              upload_date: '2026-09-05T12:00:00',
            },
          ],
        },
      ],
      conflict_detected: true,
      abstained: false,
      abstain_reason: null,
      retrieved: [],
      tokens: { input: 20, output: 25, total: 45 },
      latency: 0.6,
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/documents')) {
        return { ok: true, json: async () => [] } as Response;
      }
      if (urlStr.includes('/ask')) {
        return { ok: true, json: async () => mockConflictResponse } as Response;
      }
      if (urlStr.includes('/passages')) {
        return { ok: true, json: async () => [] } as Response;
      }
      return { ok: false } as Response;
    });

    render(<App />);

    const input = screen.getByPlaceholderText(/When is the final exam/i);
    fireEvent.change(input, { target: { value: 'When is assignment 1 due?' } });

    const askButton = screen.getByRole('button', { name: /Ask Question/i });
    fireEvent.click(askButton);

    await waitFor(() => {
      expect(screen.getByTestId('conflict-view')).toBeInTheDocument();
    });

    expect(screen.getByText('These documents disagree')).toBeInTheDocument();
    expect(screen.getByText(/Conflict Topic: Due Date/i)).toBeInTheDocument();
    expect(screen.getByText('“October 10”')).toBeInTheDocument();
    expect(screen.getByText('“October 15”')).toBeInTheDocument();
    expect(screen.getByText(/2026-09-01T10:00:00/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-09-05T12:00:00/i)).toBeInTheDocument();
  });

  it('renders error state when backend returns failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/documents')) {
        return { ok: true, json: async () => [] } as Response;
      }
      if (urlStr.includes('/ask')) {
        return { ok: false, status: 500 } as Response;
      }
      return { ok: false } as Response;
    });

    render(<App />);

    const input = screen.getByPlaceholderText(/When is the final exam/i);
    fireEvent.change(input, { target: { value: 'Trigger an error?' } });

    const askButton = screen.getByRole('button', { name: /Ask Question/i });
    fireEvent.click(askButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/Server returned status 500/i);
  });

  it('updates the right pane when a citation chip is clicked', async () => {
    const mockAskResponse = {
      answer: 'Course info [syllabus.pdf p.1] and grading [grading.pdf p.3].',
      citations: [
        { file: 'syllabus.pdf', page: 1 },
        { file: 'grading.pdf', page: 3 },
      ],
      conflicts: [],
      conflict_detected: false,
      abstained: false,
      abstain_reason: null,
      retrieved: [],
      tokens: { input: 15, output: 15, total: 30 },
      latency: 0.4,
    };

    const syllabusPassages = [
      {
        file_name: 'syllabus.pdf',
        page_number: 1,
        chunk_index: 0,
        text: 'Welcome to CS 101. Intro to Algorithms.',
      },
    ];

    const gradingPassages = [
      {
        file_name: 'grading.pdf',
        page_number: 3,
        chunk_index: 0,
        text: 'Final Exam is 50 percent of the final mark.',
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/documents')) {
        return { ok: true, json: async () => [] } as Response;
      }
      if (urlStr.includes('/ask')) {
        return { ok: true, json: async () => mockAskResponse } as Response;
      }
      if (urlStr.includes('/passages') && urlStr.includes('syllabus.pdf')) {
        return { ok: true, json: async () => syllabusPassages } as Response;
      }
      if (urlStr.includes('/passages') && urlStr.includes('grading.pdf')) {
        return { ok: true, json: async () => gradingPassages } as Response;
      }
      return { ok: false } as Response;
    });

    render(<App />);

    const input = screen.getByPlaceholderText(/When is the final exam/i);
    fireEvent.change(input, { target: { value: 'How is the course structured?' } });

    fireEvent.click(screen.getByRole('button', { name: /Ask Question/i }));

    await waitFor(() => {
      expect(screen.getByText(/Welcome to CS 101/i)).toBeInTheDocument();
    });

    // Click the second chip for grading.pdf p.3
    const chip2 = screen.getByTestId('citation-chip-1');
    expect(chip2).toHaveTextContent('grading.pdf p.3');
    fireEvent.click(chip2);

    await waitFor(() => {
      expect(
        screen.getByText(/Final Exam is 50 percent of the final mark/i)
      ).toBeInTheDocument();
    });

    expect(screen.getByTestId('passage-pane')).toHaveTextContent('grading.pdf • Page 3');
  });
  it('ignores a stale passage response when a newer chip was clicked', async () => {
    const ask = {
      answer: 'A [syllabus.pdf p.1] B [grading.pdf p.3].',
      citations: [
        { file: 'syllabus.pdf', page: 1 },
        { file: 'grading.pdf', page: 3 },
      ],
      conflicts: [],
      conflict_detected: false,
      abstained: false,
      abstain_reason: null,
      retrieved: [],
      tokens: { input: 1, output: 1, total: 2 },
      latency: 0.1,
    };
    let releaseSyllabus: (r: Response) => void = () => {};
    const syllabusPending = new Promise<Response>((resolve) => {
      releaseSyllabus = resolve;
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('/documents')) return { ok: true, json: async () => [] } as Response;
      if (u.includes('/ask')) return { ok: true, json: async () => ask } as Response;
      if (u.includes('/passages') && u.includes('syllabus.pdf')) return syllabusPending;
      if (u.includes('/passages') && u.includes('grading.pdf')) {
        return {
          ok: true,
          json: async () => [
            { file_name: 'grading.pdf', page_number: 3, chunk_index: 0, text: 'Grading text' },
          ],
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText(/When is the final exam/i), {
      target: { value: 'q' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Ask Question/i }));

    const chip2 = await screen.findByTestId('citation-chip-1');
    fireEvent.click(chip2);
    await waitFor(() => expect(screen.getByText(/Grading text/)).toBeInTheDocument());

    // The earlier (syllabus) request finishes last and must not overwrite the pane.
    releaseSyllabus({
      ok: true,
      json: async () => [
        { file_name: 'syllabus.pdf', page_number: 1, chunk_index: 0, text: 'Stale syllabus text' },
      ],
    } as Response);
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.queryByText(/Stale syllabus text/)).not.toBeInTheDocument();
    expect(screen.getByTestId('passage-pane')).toHaveTextContent('grading.pdf • Page 3');
  });
});
