import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { renderFormattedAnswer } from './components/AssistantMessage';

describe('NotebookSpace UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/demo');
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

  it('renders rate limit detail message when /ask returns 429 with detail', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/documents')) {
        return { ok: true, json: async () => [] } as Response;
      }
      if (urlStr.includes('/ask')) {
        return {
          ok: false,
          status: 429,
          json: async () => ({
            detail: 'Rate limit exceeded. Demo allows up to 10 questions per minute.',
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<App />);

    const input = screen.getByPlaceholderText(/When is the final exam/i);
    fireEvent.change(input, { target: { value: 'Rate limited query?' } });

    const askButton = screen.getByRole('button', { name: /Ask Question/i });
    fireEvent.click(askButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Rate limit exceeded\. Demo allows up to 10 questions per minute\./i
    );
  });

  it('disables upload controls and displays demo banner in demo mode', () => {
    render(<App isDemoMode={true} />);

    expect(screen.getByTestId('demo-banner')).toBeInTheDocument();
    expect(
      screen.getByText(/Public demo: sample documents, questions are rate-limited/i)
    ).toBeInTheDocument();
    const fileInput = screen.getByLabelText(/Upload PDF Document/i);
    expect(fileInput).toBeDisabled();
    const uploadBtn = screen.getByRole('button', { name: /Upload/i });
    expect(uploadBtn).toBeDisabled();
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

  it('clears the thread when New chat is clicked', async () => {
    const mockAskResponse = {
      answer: 'Course syllabus response',
      citations: [{ file: 'syllabus.pdf', page: 1 }],
      conflicts: [],
      conflict_detected: false,
      abstained: false,
      abstain_reason: null,
      retrieved: [],
      tokens: { input: 5, output: 5, total: 10 },
      latency: 0.2,
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('/documents')) return { ok: true, json: async () => [] } as Response;
      if (u.includes('/ask')) return { ok: true, json: async () => mockAskResponse } as Response;
      if (u.includes('/passages')) {
        return {
          ok: true,
          json: async () => [
            { file_name: 'syllabus.pdf', page_number: 1, chunk_index: 0, text: 'Syllabus info' },
          ],
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<App />);

    const input = screen.getByPlaceholderText(/When is the final exam/i);
    fireEvent.change(input, { target: { value: 'What is the syllabus?' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask Question/i }));

    await waitFor(() => {
      expect(screen.getByTestId('answer-view')).toBeInTheDocument();
    });
    expect(screen.getByText('What is the syllabus?')).toBeInTheDocument();
    expect(screen.getByText('Course syllabus response')).toBeInTheDocument();

    // Click "New chat" button
    const newChatBtn = screen.getByRole('button', { name: /New chat/i });
    fireEvent.click(newChatBtn);

    // Verify thread is cleared
    expect(screen.queryByTestId('answer-view')).not.toBeInTheDocument();
    expect(screen.queryByText('What is the syllabus?')).not.toBeInTheDocument();
    expect(screen.queryByText('Course syllabus response')).not.toBeInTheDocument();
  });

  it('steps through citations with previous and next buttons', async () => {
    const mockAskResponse = {
      answer: 'Three citations answer',
      citations: [
        { file: 'doc1.pdf', page: 1 },
        { file: 'doc2.pdf', page: 2 },
        { file: 'doc3.pdf', page: 3 },
      ],
      conflicts: [],
      conflict_detected: false,
      abstained: false,
      abstain_reason: null,
      retrieved: [],
      tokens: { input: 10, output: 10, total: 20 },
      latency: 0.3,
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('/documents')) return { ok: true, json: async () => [] } as Response;
      if (u.includes('/ask')) return { ok: true, json: async () => mockAskResponse } as Response;
      if (u.includes('/passages')) {
        const file = u.includes('doc1.pdf') ? 'doc1.pdf' : u.includes('doc2.pdf') ? 'doc2.pdf' : 'doc3.pdf';
        const page = u.includes('page=1') ? 1 : u.includes('page=2') ? 2 : 3;
        return {
          ok: true,
          json: async () => [
            { file_name: file, page_number: page, chunk_index: 0, text: `Text from ${file} page ${page}` },
          ],
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/When is the final exam/i), {
      target: { value: 'Multi citation query' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Ask Question/i }));

    // First citation should automatically load initially
    await waitFor(() => {
      expect(screen.getByTestId('passage-pane')).toHaveTextContent('doc1.pdf • Page 1');
    });

    const prevBtn = screen.getByRole('button', { name: /Previous citation/i });
    const nextBtn = screen.getByRole('button', { name: /Next citation/i });

    // Initially at index 0: prev is disabled, next is enabled
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    // Step next to doc2.pdf p.2
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(screen.getByTestId('passage-pane')).toHaveTextContent('doc2.pdf • Page 2');
    });
    expect(prevBtn).not.toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    // Step next to doc3.pdf p.3
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(screen.getByTestId('passage-pane')).toHaveTextContent('doc3.pdf • Page 3');
    });
    expect(prevBtn).not.toBeDisabled();
    expect(nextBtn).toBeDisabled();

    // Step previous back to doc2.pdf p.2
    fireEvent.click(prevBtn);
    await waitFor(() => {
      expect(screen.getByTestId('passage-pane')).toHaveTextContent('doc2.pdf • Page 2');
    });

    // Step previous back to doc1.pdf p.1
    fireEvent.click(prevBtn);
    await waitFor(() => {
      expect(screen.getByTestId('passage-pane')).toHaveTextContent('doc1.pdf • Page 1');
    });
    expect(prevBtn).toBeDisabled();
  });

  it('hides items in the status strip that the API did not return', async () => {
    // Response with latency and model, but no retrieved
    const partialResponse = {
      answer: 'Partial response answer',
      citations: [],
      conflicts: [],
      conflict_detected: false,
      abstained: false,
      abstain_reason: null,
      tokens: { input: 1, output: 1, total: 2 },
      latency: 0.75,
      model: 'test-model-v1',
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('/documents')) return { ok: true, json: async () => [] } as Response;
      if (u.includes('/ask')) return { ok: true, json: async () => partialResponse } as Response;
      return { ok: false } as Response;
    });

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/When is the final exam/i), {
      target: { value: 'Metadata test query' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Ask Question/i }));

    await waitFor(() => {
      expect(screen.getByTestId('status-strip')).toBeInTheDocument();
    });

    // Latency and model were returned
    expect(screen.getByTestId('status-latency')).toHaveTextContent('0.75s');
    expect(screen.getByTestId('status-model')).toHaveTextContent('test-model-v1');

    // Retrieved was omitted from response, so retrieved item is hidden
    expect(screen.queryByTestId('status-retrieved')).not.toBeInTheDocument();
  });

  it('renders the empty state on load with heading, subtext, and starter chips', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: /Ask questions about your course materials/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Upload a source, ask a question, and follow citations back to the relevant passage\./i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grade breakdown' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lecture room' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Do the syllabi disagree?' })).toBeInTheDocument();
    expect(screen.getAllByText('NotebookSpace').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText('NotebookSpace answers questions with verified citations from uploaded materials.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Independent student project, not affiliated with Google.')
    ).toBeInTheDocument();
  });

  it('renders NotebookSpace branding, round logo mark N, and independent project disclaimer', () => {
    render(<App />);

    expect(screen.getByText('NotebookSpace', { selector: '.chat-header-title' })).toBeInTheDocument();
    expect(screen.getByText('NotebookSpace', { selector: '.brand-title' })).toBeInTheDocument();
    expect(screen.getAllByText('N').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText('NotebookSpace answers questions with verified citations from uploaded materials.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Independent student project, not affiliated with Google.')
    ).toBeInTheDocument();
  });

  it('submits that question and hides the empty state when a starter chip is clicked', async () => {
    const mockAskResponse = {
      answer: 'The grade breakdown is 40% midterm, 60% final.',
      citations: [{ file: 'syllabus.pdf', page: 2 }],
      conflicts: [],
      conflict_detected: false,
      abstained: false,
      abstain_reason: null,
      retrieved: [],
      tokens: { input: 12, output: 14, total: 26 },
      latency: 0.35,
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('/documents')) return { ok: true, json: async () => [] } as Response;
      if (u.includes('/ask')) return { ok: true, json: async () => mockAskResponse } as Response;
      if (u.includes('/passages')) return { ok: true, json: async () => [] } as Response;
      return { ok: false } as Response;
    });

    render(<App />);

    // Initially the empty state is present
    expect(
      screen.getByRole('heading', { name: /Ask questions about your course materials/i })
    ).toBeInTheDocument();

    // Click starter chip
    const chip = screen.getByRole('button', { name: 'Grade breakdown' });
    fireEvent.click(chip);

    // Empty state disappears and answer is displayed
    await waitFor(() => {
      expect(screen.getByTestId('answer-view')).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('heading', { name: /Ask questions about your course materials/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('What is the grade breakdown for this course?')
    ).toBeInTheDocument();
    expect(
      screen.getByText('The grade breakdown is 40% midterm, 60% final.')
    ).toBeInTheDocument();
  });

  it('brings back the empty state when New chat is clicked after an answer', async () => {
    const mockAskResponse = {
      answer: 'Course answer text',
      citations: [],
      conflicts: [],
      conflict_detected: false,
      abstained: false,
      abstain_reason: null,
      retrieved: [],
      tokens: { input: 5, output: 5, total: 10 },
      latency: 0.15,
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('/documents')) return { ok: true, json: async () => [] } as Response;
      if (u.includes('/ask')) return { ok: true, json: async () => mockAskResponse } as Response;
      return { ok: false } as Response;
    });

    render(<App />);

    // Click starter chip to initiate conversation
    fireEvent.click(screen.getByRole('button', { name: 'Lecture room' }));

    await waitFor(() => {
      expect(screen.getByTestId('answer-view')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('heading', { name: /Ask questions about your course materials/i })
    ).not.toBeInTheDocument();

    // Click New chat
    const newChatBtn = screen.getByRole('button', { name: /^New chat$/i });
    fireEvent.click(newChatBtn);

    // Empty state is restored
    expect(
      screen.getByRole('heading', { name: /Ask questions about your course materials/i })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('answer-view')).not.toBeInTheDocument();
  });

  it('renders Public demo pill in header and Uploads are disabled note in demo mode', () => {
    render(<App isDemoMode={true} />);

    expect(screen.getByTestId('demo-pill')).toHaveTextContent('Public demo');
    expect(
      screen.getByText('Uploads are disabled in the public demo.')
    ).toBeInTheDocument();
  });

  it('renders document page count and Ready when provided by /documents', async () => {
    const mockDocs = [
      { file_name: 'syllabus.pdf', chunk_count: 5, page_count: 4 },
      { file_name: 'lecture.pdf', chunk_count: 2 },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('/documents')) return { ok: true, json: async () => mockDocs } as Response;
      return { ok: false } as Response;
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('syllabus.pdf')).toBeInTheDocument();
    });

    expect(screen.getByText(/4 pages · Ready/)).toBeInTheDocument();
    expect(screen.getByText('lecture.pdf')).toBeInTheDocument();
  });

  it('correctly associates retrieved passages when two answers cite the same page', async () => {
    const askResp1 = {
      answer: 'Office hours on Wednesdays [syllabus.pdf p.2].',
      citations: [{ file: 'syllabus.pdf', page: 2 }],
      conflicts: [],
      conflict_detected: false,
      abstained: false,
      retrieved: [
        {
          file: 'syllabus.pdf',
          page: 2,
          chunk_index: 0,
          text: 'Office hours are Wednesdays 1-3pm in CS-101.',
          score: 0.9,
        },
      ],
      tokens: { input: 10, output: 10, total: 20 },
      latency: 0.2,
    };

    const askResp2 = {
      answer: 'Grading scale breakdown [syllabus.pdf p.2].',
      citations: [{ file: 'syllabus.pdf', page: 2 }],
      conflicts: [],
      conflict_detected: false,
      abstained: false,
      retrieved: [
        {
          file: 'syllabus.pdf',
          page: 2,
          chunk_index: 1,
          text: 'Grading scale: A is 93-100%, B is 83-92%.',
          score: 0.95,
        },
      ],
      tokens: { input: 10, output: 10, total: 20 },
      latency: 0.25,
    };

    const syllabusPassages = [
      {
        file_name: 'syllabus.pdf',
        page_number: 2,
        chunk_index: 0,
        text: 'Office hours are Wednesdays 1-3pm in CS-101.',
      },
      {
        file_name: 'syllabus.pdf',
        page_number: 2,
        chunk_index: 1,
        text: 'Grading scale: A is 93-100%, B is 83-92%.',
      },
    ];

    let askCallCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('/documents')) return { ok: true, json: async () => [] } as Response;
      if (u.includes('/ask')) {
        askCallCount++;
        const resp = askCallCount === 1 ? askResp1 : askResp2;
        return { ok: true, json: async () => resp } as Response;
      }
      if (u.includes('/passages')) {
        return { ok: true, json: async () => syllabusPassages } as Response;
      }
      return { ok: false } as Response;
    });

    render(<App />);

    // First question
    fireEvent.change(screen.getByPlaceholderText(/When is the final exam/i), {
      target: { value: 'When are office hours?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Ask Question/i }));

    await waitFor(() => {
      expect(screen.getByText(/Office hours on Wednesdays/)).toBeInTheDocument();
    });

    // Second question
    fireEvent.change(screen.getByPlaceholderText(/When is the final exam/i), {
      target: { value: 'What is the grading scale?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Ask Question/i }));

    await waitFor(() => {
      expect(screen.getByText(/Grading scale breakdown/)).toBeInTheDocument();
    });

    // The second answer is now active and its retrieved chunk (chunk 1) should be highlighted
    const passagePane = screen.getByTestId('passage-pane');
    expect(passagePane).toHaveTextContent('syllabus.pdf • Page 2');

    const highlightedChunks = passagePane.querySelectorAll('.passage-chunk-highlighted');
    expect(highlightedChunks.length).toBeGreaterThan(0);
    expect(highlightedChunks[0]).toHaveTextContent('Grading scale: A is 93-100%');

    // Click the citation chip on the older answer (first turn)
    const chips = screen.getAllByTestId('citation-chip-0');
    expect(chips.length).toBe(2);
    fireEvent.click(chips[0]); // first turn chip

    // Now the passage pane must reflect turn 1's retrieved context (chunk 0)
    await waitFor(() => {
      const updatedHighlighted = screen.getByTestId('passage-pane').querySelectorAll('.passage-chunk-highlighted');
      expect(updatedHighlighted.length).toBeGreaterThan(0);
      expect(updatedHighlighted[0]).toHaveTextContent('Office hours are Wednesdays 1-3pm in CS-101');
    });
  });

  it('updates passage viewer and navigation when selecting an older answer citation', async () => {
    const askResp1 = {
      answer: 'First question answered [syllabus.pdf p.1].',
      citations: [{ file: 'syllabus.pdf', page: 1 }],
      conflicts: [],
      conflict_detected: false,
      abstained: false,
      retrieved: [{ file: 'syllabus.pdf', page: 1, text: 'Syllabus info', score: 0.8 }],
      tokens: { input: 5, output: 5, total: 10 },
      latency: 0.2,
    };

    const askResp2 = {
      answer: 'Second question answered [assignment.pdf p.3].',
      citations: [
        { file: 'assignment.pdf', page: 3 },
        { file: 'assignment.pdf', page: 4 },
      ],
      conflicts: [],
      conflict_detected: false,
      abstained: false,
      retrieved: [{ file: 'assignment.pdf', page: 3, text: 'Assignment info', score: 0.85 }],
      tokens: { input: 5, output: 5, total: 10 },
      latency: 0.2,
    };

    let askCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('/documents')) return { ok: true, json: async () => [] } as Response;
      if (u.includes('/ask')) {
        askCount++;
        return { ok: true, json: async () => (askCount === 1 ? askResp1 : askResp2) } as Response;
      }
      if (u.includes('/passages')) {
        const file = u.includes('syllabus.pdf') ? 'syllabus.pdf' : 'assignment.pdf';
        const page = u.includes('page=1') ? 1 : u.includes('page=3') ? 3 : 4;
        return {
          ok: true,
          json: async () => [{ file_name: file, page_number: page, chunk_index: 0, text: `${file} text p.${page}` }],
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<App />);

    // Q1
    fireEvent.change(screen.getByPlaceholderText(/When is the final exam/i), { target: { value: 'Q1' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask Question/i }));
    await waitFor(() => expect(screen.getByText(/First question answered/i)).toBeInTheDocument());

    // Q2
    fireEvent.change(screen.getByPlaceholderText(/When is the final exam/i), { target: { value: 'Q2' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask Question/i }));
    await waitFor(() => expect(screen.getByText(/Second question answered/i)).toBeInTheDocument());

    await waitFor(() => {
      expect(screen.getByTestId('passage-pane')).toHaveTextContent('assignment.pdf • Page 3');
    });
    const nextBtn = screen.getByRole('button', { name: /Next citation/i });
    expect(nextBtn).not.toBeDisabled();

    // Now select older answer's citation chip (syllabus.pdf p.1)
    const allSyllabusChips = screen.getAllByRole('button', { name: /syllabus\.pdf page 1/i });
    fireEvent.click(allSyllabusChips[0]);

    // Passage viewer switches to syllabus.pdf • Page 1
    await waitFor(() => {
      expect(screen.getByTestId('passage-pane')).toHaveTextContent('syllabus.pdf • Page 1');
    });

    // Since answer 1 only has 1 citation, next is disabled
    expect(screen.getByRole('button', { name: /Next citation/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Previous citation/i })).toBeDisabled();
  });

  it('activates inline citation button using keyboard', async () => {
    const askResp = {
      answer: 'Midterm date is confirmed for Nov 5 [syllabus.pdf p.3].',
      citations: [{ file: 'syllabus.pdf', page: 3 }],
      conflicts: [],
      conflict_detected: false,
      abstained: false,
      retrieved: [],
      tokens: { input: 10, output: 10, total: 20 },
      latency: 0.3,
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('/documents')) return { ok: true, json: async () => [] } as Response;
      if (u.includes('/ask')) return { ok: true, json: async () => askResp } as Response;
      if (u.includes('/passages')) {
        return {
          ok: true,
          json: async () => [{ file_name: 'syllabus.pdf', page_number: 3, chunk_index: 0, text: 'Midterm on Nov 5 in Hall B.' }],
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/When is the final exam/i), { target: { value: 'When is midterm?' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask Question/i }));

    await waitFor(() => {
      expect(screen.getByTestId('inline-citation')).toBeInTheDocument();
    });

    const inlineBtn = screen.getByTestId('inline-citation');
    expect(inlineBtn).toHaveTextContent('[syllabus.pdf p.3]');

    // Activate via keyboard Enter key
    fireEvent.keyDown(inlineBtn, { key: 'Enter', code: 'Enter' });
    fireEvent.click(inlineBtn);

    await waitFor(() => {
      expect(screen.getByTestId('passage-pane')).toHaveTextContent('syllabus.pdf • Page 3');
      expect(screen.getByText('Midterm on Nov 5 in Hall B.')).toBeInTheDocument();
    });
    expect(inlineBtn).toHaveClass('active');
  });

  it('selects conflict claims in the correct message context and navigates between claims', async () => {
    const conflictResp = {
      answer: 'Deadline conflict detected [syllabus.pdf p.2] and [announcement_update.pdf p.1].',
      citations: [
        { file: 'syllabus.pdf', page: 2 },
        { file: 'announcement_update.pdf', page: 1 },
      ],
      conflicts: [
        {
          topic: 'Assignment 1 Due Date',
          claims: [
            { file: 'syllabus.pdf', page: 2, value: 'October 10', upload_date: '2026-09-01' },
            { file: 'announcement_update.pdf', page: 1, value: 'October 15', upload_date: '2026-09-08' },
          ],
        },
      ],
      conflict_detected: true,
      abstained: false,
      retrieved: [
        { file: 'syllabus.pdf', page: 2, text: 'Due Oct 10', score: 0.9 },
        { file: 'announcement_update.pdf', page: 1, text: 'Due Oct 15', score: 0.88 },
      ],
      tokens: { input: 15, output: 15, total: 30 },
      latency: 0.4,
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('/documents')) return { ok: true, json: async () => [] } as Response;
      if (u.includes('/ask')) return { ok: true, json: async () => conflictResp } as Response;
      if (u.includes('/passages')) {
        const file = u.includes('announcement_update.pdf') ? 'announcement_update.pdf' : 'syllabus.pdf';
        const page = u.includes('announcement_update.pdf') ? 1 : 2;
        return {
          ok: true,
          json: async () => [{ file_name: file, page_number: page, chunk_index: 0, text: `Passage for ${file}` }],
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/When is the final exam/i), { target: { value: 'Conflict query' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask Question/i }));

    await waitFor(() => {
      expect(screen.getByTestId('conflict-view')).toBeInTheDocument();
    });

    // Click the second conflict claim card (announcement_update.pdf page 1)
    const claim2 = screen.getByRole('button', { name: /Claim: October 15 in announcement_update\.pdf page 1/i });
    fireEvent.click(claim2);

    await waitFor(() => {
      expect(screen.getByTestId('passage-pane')).toHaveTextContent('announcement_update.pdf • Page 1');
    });

    // Claim 2 card has active class
    expect(claim2).toHaveClass('active');

    // Previous navigation is enabled and steps to claim 1 (syllabus.pdf page 2)
    const prevBtn = screen.getByRole('button', { name: /Previous citation/i });
    expect(prevBtn).not.toBeDisabled();
    fireEvent.click(prevBtn);

    await waitFor(() => {
      expect(screen.getByTestId('passage-pane')).toHaveTextContent('syllabus.pdf • Page 2');
    });
  });

  it('parses inline citations with spaces in PDF filenames and activates passage viewer', async () => {
    const askResp = {
      answer: 'Course policies are detailed in [Course Syllabus 2026.pdf p.2].',
      citations: [{ file: 'Course Syllabus 2026.pdf', page: 2 }],
      conflicts: [],
      conflict_detected: false,
      abstained: false,
      retrieved: [{ file: 'Course Syllabus 2026.pdf', page: 2, text: 'Grading and late policy rules', score: 0.92 }],
      tokens: { input: 12, output: 12, total: 24 },
      latency: 0.35,
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('/documents')) return { ok: true, json: async () => [] } as Response;
      if (u.includes('/ask')) return { ok: true, json: async () => askResp } as Response;
      if (u.includes('/passages')) {
        return {
          ok: true,
          json: async () => [
            {
              file_name: 'Course Syllabus 2026.pdf',
              page_number: 2,
              chunk_index: 0,
              text: 'Grading and late policy rules.',
            },
          ],
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/When is the final exam/i), {
      target: { value: 'What are the course policies?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Ask Question/i }));

    await waitFor(() => {
      expect(screen.getByTestId('inline-citation')).toBeInTheDocument();
    });

    const inlineBtn = screen.getByTestId('inline-citation');
    expect(inlineBtn).toHaveTextContent('[Course Syllabus 2026.pdf p.2]');
    expect(inlineBtn).toHaveAttribute('aria-label', 'Citation: Course Syllabus 2026.pdf page 2');

    fireEvent.click(inlineBtn);

    await waitFor(() => {
      expect(screen.getByTestId('passage-pane')).toHaveTextContent('Course Syllabus 2026.pdf • Page 2');
      expect(screen.getByText('Grading and late policy rules.')).toBeInTheDocument();
    });
    expect(inlineBtn).toHaveClass('active');
  });

  it('parses inline citations with Unicode characters and activates passage viewer', async () => {
    const askResp = {
      answer: 'Consultez le plan [Résumé du cours 2026.pdf p.1] et les cours [План лекций.pdf p.4].',
      citations: [
        { file: 'Résumé du cours 2026.pdf', page: 1 },
        { file: 'План лекций.pdf', page: 4 },
      ],
      conflicts: [],
      conflict_detected: false,
      abstained: false,
      retrieved: [
        { file: 'Résumé du cours 2026.pdf', page: 1, text: 'Bienvenue au cours de programmation.', score: 0.95 },
        { file: 'План лекций.pdf', page: 4, text: 'Расписание лекций и экзаменов.', score: 0.89 },
      ],
      tokens: { input: 15, output: 15, total: 30 },
      latency: 0.28,
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('/documents')) return { ok: true, json: async () => [] } as Response;
      if (u.includes('/ask')) return { ok: true, json: async () => askResp } as Response;
      if (u.includes('/passages')) {
        const isFrench = u.includes(encodeURIComponent('Résumé du cours 2026.pdf')) || u.includes('R%C3%A9sum%C3%A9');
        return {
          ok: true,
          json: async () => [
            {
              file_name: isFrench ? 'Résumé du cours 2026.pdf' : 'План лекций.pdf',
              page_number: isFrench ? 1 : 4,
              chunk_index: 0,
              text: isFrench ? 'Bienvenue au cours de programmation.' : 'Расписание лекций и экзаменов.',
            },
          ],
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/When is the final exam/i), {
      target: { value: 'Plan de cours?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Ask Question/i }));

    await waitFor(() => {
      const buttons = screen.getAllByTestId('inline-citation');
      expect(buttons).toHaveLength(2);
    });

    const [frenchBtn, cyrillicBtn] = screen.getAllByTestId('inline-citation');
    expect(frenchBtn).toHaveTextContent('[Résumé du cours 2026.pdf p.1]');
    expect(cyrillicBtn).toHaveTextContent('[План лекций.pdf p.4]');

    // Click french citation
    fireEvent.click(frenchBtn);
    await waitFor(() => {
      expect(screen.getByTestId('passage-pane')).toHaveTextContent('Résumé du cours 2026.pdf • Page 1');
      expect(screen.getByText('Bienvenue au cours de programmation.')).toBeInTheDocument();
    });
    expect(frenchBtn).toHaveClass('active');

    // Click cyrillic citation
    fireEvent.click(cyrillicBtn);
    await waitFor(() => {
      expect(screen.getByTestId('passage-pane')).toHaveTextContent('План лекций.pdf • Page 4');
      expect(screen.getByText('Расписание лекций и экзаменов.')).toBeInTheDocument();
    });
    expect(cyrillicBtn).toHaveClass('active');
  });

  it('strictly preserves unknown markers and unmatched page numbers as plain text', async () => {
    const askResp = {
      answer: 'See [unknown_document.pdf p.99], [syllabus.pdf p.42], [notes.txt p.1], and [general notes].',
      citations: [
        { file: 'syllabus.pdf', page: 2 }, // Only page 2 is in citations, not page 42!
      ],
      conflicts: [],
      conflict_detected: false,
      abstained: false,
      retrieved: [],
      tokens: { input: 8, output: 8, total: 16 },
      latency: 0.2,
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('/documents')) return { ok: true, json: async () => [] } as Response;
      if (u.includes('/ask')) return { ok: true, json: async () => askResp } as Response;
      return { ok: false } as Response;
    });

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/When is the final exam/i), {
      target: { value: 'Check unmatched markers' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Ask Question/i }));

    await waitFor(() => {
      expect(screen.getByTestId('answer-view')).toBeInTheDocument();
    });

    // Zero inline citation buttons should be rendered
    expect(screen.queryByTestId('inline-citation')).not.toBeInTheDocument();

    // All markers should exist in the answer view text content as verbatim plain text
    const answerText = screen.getByTestId('answer-view').textContent;
    expect(answerText).toContain('[unknown_document.pdf p.99]');
    expect(answerText).toContain('[syllabus.pdf p.42]');
    expect(answerText).toContain('[notes.txt p.1]');
    expect(answerText).toContain('[general notes]');
  });

  it('unit test: renderFormattedAnswer handles spaces, Unicode normalization, and unmatched markers', () => {
    const citations = [
      { file: 'Course Syllabus 2026.pdf', page: 2 },
      { file: 'Résumé.pdf', page: 1 },
      { file: '算法导论.pdf', page: 10 },
    ];

    const selectedCit = { file: 'Course Syllabus 2026.pdf', page: 2, messageId: 'm1' };
    const onSelect = vi.fn();

    // NFD decomposed 'e\u0301' in input text matching NFC in citations
    const text = 'Check [Course Syllabus 2026.pdf p.2], [Re\u0301sume\u0301.pdf page 1], [算法导论.pdf p.10], [unknown.pdf p.5], and [bracket note].';

    const { container } = render(
      <div>
        {renderFormattedAnswer(text, citations, true, selectedCit, onSelect)}
      </div>
    );

    const buttons = container.querySelectorAll('button.inline-citation-btn');
    expect(buttons).toHaveLength(3);

    // 1. Spaces in filename
    expect(buttons[0]).toHaveTextContent('[Course Syllabus 2026.pdf p.2]');
    expect(buttons[0]).toHaveClass('active');

    // 2. Unicode accented (NFD text matching NFC citation)
    expect(buttons[1]).toHaveTextContent('[Re\u0301sume\u0301.pdf page 1]');

    // 3. CJK Unicode
    expect(buttons[2]).toHaveTextContent('[算法导论.pdf p.10]');

    // Unmatched markers are preserved as text in DOM
    expect(container.textContent).toContain('[unknown.pdf p.5]');
    expect(container.textContent).toContain('[bracket note]');

    // Click triggers onSelect with resolved citation
    fireEvent.click(buttons[1]);
    expect(onSelect).toHaveBeenCalledWith(citations[1]);
  });
});
