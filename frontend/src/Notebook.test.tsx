import { describe, it, expect, vi, afterEach, onTestFinished } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DashboardView } from './components/DashboardView';
import { SubjectWorkspaceView } from './components/SubjectWorkspaceView';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { Subject, Source, Conversation, MessageItem } from './types';
import { api } from './api';

afterEach(() => vi.restoreAllMocks());

describe('MarkdownRenderer component', () => {
  it('renders markdown text with inline citation chips and handles citation click', () => {
    const onSelect = vi.fn();
    const markdown = 'Algorithms have runtime bounds [eecs3101.pdf p.4].';

    render(
      <MarkdownRenderer
        content={markdown}
        onSelectCitation={onSelect}
      />
    );

    const citationBtn = screen.getByRole('button', { name: /Citation:\s*eecs3101\.pdf\s+page\s+4/i });
    expect(citationBtn).toBeInTheDocument();

    fireEvent.click(citationBtn);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        file: 'eecs3101.pdf',
        page: 4,
      })
    );
  });

  it('renders code blocks properly', () => {
    const markdown = '```python\ndef solve():\n    return 42\n```';
    render(<MarkdownRenderer content={markdown} />);
    expect(screen.getByText(/def solve\(\):/)).toBeInTheDocument();
  });

  it('renders inline math expressions with KaTeX', () => {
    const markdown = 'The time complexity is $O(n \\log n)$.';
    const { container } = render(<MarkdownRenderer content={markdown} />);
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it('keeps the leading symbol and leaves no stray dollar sign', () => {
    const { container } = render(<MarkdownRenderer content={'So $T(n) = O(n \\log n)$ overall.'} />);
    const math = container.querySelectorAll('.math-inline');
    expect(math).toHaveLength(1);
    expect(math[0]).toHaveAttribute('aria-label', 'T(n) = O(n \\log n)');
    expect(container.textContent).not.toContain('$');
  });

  it('pairs dollar signs so plain words between two expressions stay text', () => {
    const { container } = render(
      <MarkdownRenderer content={'Split an array of size $n$ into two halves of size $n/2$.'} />
    );
    const math = container.querySelectorAll('.math-inline');
    expect(math).toHaveLength(2);
    expect(math[0]).toHaveAttribute('aria-label', 'n');
    expect(math[1]).toHaveAttribute('aria-label', 'n/2');
    expect(container.textContent).toContain(' into two halves of size ');
  });

  it('renders KaTeX as HTML only, so no hidden MathML copy can duplicate the text', () => {
    const { container } = render(<MarkdownRenderer content={'Size $n$.'} />);
    expect(container.querySelector('.katex-mathml')).toBeNull();
    expect(container.querySelector('.katex-html')).not.toBeNull();
  });

  it('leaves prices and escaped dollars as text', () => {
    const { container } = render(<MarkdownRenderer content={'It costs $5 and $10. Literal \\$x\\$ here.'} />);
    expect(container.querySelector('.katex')).toBeNull();
    expect(container.textContent).toContain('It costs $5 and $10.');
    expect(container.textContent).toContain('Literal $x$ here.');
  });

  it('never treats dollar signs inside inline code as math', () => {
    const { container } = render(<MarkdownRenderer content={'Run `echo $a $b` now.'} />);
    expect(container.querySelector('.katex')).toBeNull();
    expect(container.querySelector('code')).toHaveTextContent('echo $a $b');
  });

  it('keeps citations clickable next to math', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <MarkdownRenderer content={'Merge sort is $O(n \\log n)$ [eecs3101.pdf p.3].'} onSelectCitation={onSelect} />
    );
    expect(container.querySelectorAll('.math-inline')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Citation:\s*eecs3101\.pdf\s+page\s+3/i })).toBeInTheDocument();
  });

  it('renders display math and shows unparseable math as its source', () => {
    const { container } = render(<MarkdownRenderer content={'$$x^2 + y^2$$\n\nBad $\\frac{1$ input.'} />);
    expect(container.querySelectorAll('.math-display')).toHaveLength(1);
    expect(container.textContent).toContain('$\\frac{1$');
  });
});

describe('DashboardView component', () => {
  const mockSubjects: Subject[] = [
    {
      id: 'sub-1',
      name: 'EECS 3101 — Algorithms',
      course_code: 'EECS 3101',
      description: 'Design and Analysis of Algorithms',
      is_archived: false,
      source_count: 3,
      settings: { response_length: 'default', response_style: 'general' },
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-10T12:00:00Z',
    },
    {
      id: 'sub-2',
      name: 'EECS 2031 — Software Tools',
      course_code: 'EECS 2031',
      description: 'C programming and shell scripts',
      is_archived: false,
      source_count: 1,
      settings: { response_length: 'default', response_style: 'general' },
      created_at: '2026-10-02T10:00:00Z',
      updated_at: '2026-10-09T10:00:00Z',
    },
  ];

  it('renders subject list cards and filters via search', () => {
    render(
      <DashboardView
        subjects={mockSubjects}
        loading={false}
        onOpenSubject={() => {}}
        onCreateSubject={async () => {}}
        onUpdateSubject={async () => {}}
        onArchiveSubject={async () => {}}
        onRestoreSubject={async () => {}}
        onDeleteSubject={async () => {}}
      />
    );

    expect(screen.getByText('EECS 3101 — Algorithms')).toBeInTheDocument();
    expect(screen.getByText('EECS 2031 — Software Tools')).toBeInTheDocument();
    expect(screen.getAllByText(/sources? · Updated/).length).toBeGreaterThan(0);

    const searchInput = screen.getByLabelText('Search notebooks');
    fireEvent.change(searchInput, { target: { value: 'Software' } });

    expect(screen.queryByText('EECS 3101 — Algorithms')).not.toBeInTheDocument();
    expect(screen.getByText('EECS 2031 — Software Tools')).toBeInTheDocument();
  });

  it('opens Create Subject modal and submits', async () => {
    const handleCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <DashboardView
        subjects={mockSubjects}
        loading={false}
        onOpenSubject={() => {}}
        onCreateSubject={handleCreate}
        onUpdateSubject={async () => {}}
        onArchiveSubject={async () => {}}
        onRestoreSubject={async () => {}}
        onDeleteSubject={async () => {}}
      />
    );

    const createBtn = screen.getByTestId('create-subject-btn');
    fireEvent.click(createBtn);

    expect(screen.getByText('Create New Subject Notebook')).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/Subject Name/i);
    fireEvent.change(nameInput, { target: { value: 'EECS 3311 — Software Design' } });

    const submitBtn = screen.getByRole('button', { name: /^Create Notebook$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'EECS 3311 — Software Design',
        })
      );
    });
  });

  it('calls onOpenSubject when a subject card is clicked', () => {
    const handleOpen = vi.fn();
    render(
      <DashboardView
        subjects={mockSubjects}
        loading={false}
        onOpenSubject={handleOpen}
        onCreateSubject={async () => {}}
        onUpdateSubject={async () => {}}
        onArchiveSubject={async () => {}}
        onRestoreSubject={async () => {}}
        onDeleteSubject={async () => {}}
      />
    );

    const card = screen.getByTestId('subject-card-sub-1');
    fireEvent.click(card);

    expect(handleOpen).toHaveBeenCalledWith('sub-1');
  });
});

describe('SubjectWorkspaceView component', () => {
  const activeSubject: Subject = {
    id: 'sub-1',
    name: 'EECS 3101 — Algorithms',
    course_code: 'EECS 3101',
    description: 'Design and Analysis of Algorithms',
    is_archived: false,
    source_count: 2,
    settings: { response_length: 'default', response_style: 'general' },
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-10T12:00:00Z',
  };

  const mockSources: Source[] = [
    {
      id: 'src-1',
      subject_id: 'sub-1',
      user_id: 'user-1',
      title: 'Syllabus.pdf',
      file_name: 'Syllabus.pdf',
      source_type: 'pdf',
      status: 'ready',
      page_count: 5,
      word_count: 1200,
      version: 1,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
    },
    {
      id: 'src-2',
      subject_id: 'sub-1',
      user_id: 'user-1',
      title: 'Lecture 1.pdf',
      file_name: 'Lecture 1.pdf',
      source_type: 'pdf',
      status: 'ready',
      page_count: 20,
      word_count: 4500,
      version: 1,
      created_at: '2026-10-02T10:00:00Z',
      updated_at: '2026-10-02T10:00:00Z',
    },
  ];

  const mockConversations: Conversation[] = [
    {
      id: 'conv-1',
      subject_id: 'sub-1',
      user_id: 'user-1',
      title: 'Midterm Grading',
      created_at: '2026-10-05T10:00:00Z',
      updated_at: '2026-10-05T10:00:00Z',
    },
  ];

  const mockMessages: MessageItem[] = [
    {
      id: 'msg-1',
      conversation_id: 'conv-1',
      user_id: 'user-1',
      role: 'user',
      content: 'What is the grading policy?',
      citations: [],
      conflicts: [],
      conflict_detected: false,
      abstained: false,
      retrieved: [],
      selected_source_ids: ['src-1'],
      source_versions: {},
      tokens: { input: 10, output: 0, total: 10 },
      latency: 0,
      created_at: '2026-10-05T10:00:00Z',
    },
    {
      id: 'msg-2',
      conversation_id: 'conv-1',
      user_id: 'user-1',
      role: 'assistant',
      content: 'The midterm is worth 25% according to [Syllabus.pdf p.2].',
      citations: [
        {
          file: 'Syllabus.pdf',
          page: 2,
          source_id: 'src-1',
          source_version: 1,
          excerpt: 'Midterm Exam: 25% of final grade.',
        },
      ],
      conflicts: [],
      conflict_detected: false,
      abstained: false,
      retrieved: [
        {
          id: 'chunk-1',
          source_id: 'src-1',
          file: 'Syllabus.pdf',
          file_name: 'Syllabus.pdf',
          page: 2,
          page_number: 2,
          chunk_text: 'Midterm Exam: 25% of final grade.',
          score: 0.88,
        },
      ],
      selected_source_ids: ['src-1'],
      source_versions: {},
      tokens: { input: 100, output: 25, total: 125 },
      latency: 450,
      created_at: '2026-10-05T10:00:05Z',
    },
  ];

  it.each([true, false])('shows one retryable provider failure for abstained=%s', (legacyAbstained) => {
    const retry = vi.fn();
    const failure: MessageItem = {
      ...mockMessages[1], id: 'failed', content: 'The AI service has reached its usage limit for now. Please try again later.',
      abstained: legacyAbstained, abstain_reason: 'generation_failed', citations: [], retrieved: [],
    };
    render(
      <SubjectWorkspaceView
        subject={activeSubject} sources={mockSources} selectedSourceIds={['src-1']}
        conversations={mockConversations} notes={[]} activeConversationId="conv-1"
        starterQuestions={[]} isDemoMode={false} onBackToDashboard={() => {}}
        onSelectSources={() => {}} onSelectConversation={() => {}}
        onCreateConversation={async () => {}} onRenameConversation={async () => {}}
        onDeleteConversation={async () => {}} onUploadFiles={async () => {}}
        onPasteText={async () => {}} onAddUrl={async () => {}} onRenameSource={async () => {}}
        onDeleteSource={async () => {}} onRetrySource={async () => {}} onReplaceSource={async () => {}}
        onSendMessage={retry} onUpdateSettings={async () => {}} onCreateNote={async () => {}}
        onSaveAnswerAsNote={async () => {}} onUpdateNote={async () => {}} onDeleteNote={async () => {}}
        messages={[mockMessages[0], failure]} chatLoading={false}
      />
    );
    expect(screen.getAllByText(failure.content)).toHaveLength(1);
    expect(screen.getByRole('heading', { name: "Couldn't generate an answer" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry question' }));
    expect(retry).toHaveBeenCalledWith(mockMessages[0].content, { is_retry: true, retry_message_id: 'failed' });
  });

  it('renders sources with checkboxes and toggles selection', () => {
    // The sources panel is docked from 1181px up; below that it is an on-demand overlay.
    const priorWidth = window.innerWidth;
    window.innerWidth = 1440;
    window.localStorage.clear();
    onTestFinished(() => { window.innerWidth = priorWidth; });
    const handleSelectSources = vi.fn();

    render(
      <SubjectWorkspaceView
        subject={activeSubject}
        sources={mockSources}
        selectedSourceIds={['src-1']}
        conversations={mockConversations}
        notes={[]}
        activeConversationId="conv-1"
        starterQuestions={[]}
        isDemoMode={false}
        onBackToDashboard={() => {}}
        onSelectSources={handleSelectSources}
        onSelectConversation={() => {}}
        onCreateConversation={async () => {}}
        onRenameConversation={async () => {}}
        onDeleteConversation={async () => {}}
        onUploadFiles={async () => {}}
        onPasteText={async () => {}}
        onAddUrl={async () => {}}
        onRenameSource={async () => {}}
        onDeleteSource={async () => {}}
        onRetrySource={async () => {}}
        onReplaceSource={async () => {}}
        onSendMessage={async () => {}}
        onUpdateSettings={async () => {}}
        onCreateNote={async () => {}}
        onSaveAnswerAsNote={async () => {}}
        onUpdateNote={async () => {}}
        onDeleteNote={async () => {}}
        messages={mockMessages}
        chatLoading={false}
      />
    );

    expect(screen.getAllByText('Syllabus.pdf').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Lecture 1.pdf').length).toBeGreaterThan(0);
    expect(screen.getByText(/1 of 2 selected/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Lecture 1.pdf' }));
    expect(handleSelectSources).toHaveBeenCalledWith(['src-1', 'src-2']);
  });

  it('renders chat message with citation and handles inline citation chip click', async () => {
    const handleSaveNote = vi.fn();
    vi.spyOn(api, 'getPassages').mockResolvedValue([]);

    render(
      <SubjectWorkspaceView
        subject={activeSubject}
        sources={mockSources}
        selectedSourceIds={['src-1', 'src-2']}
        conversations={mockConversations}
        notes={[]}
        activeConversationId="conv-1"
        starterQuestions={[]}
        isDemoMode={false}
        onBackToDashboard={() => {}}
        onSelectSources={() => {}}
        onSelectConversation={() => {}}
        onCreateConversation={async () => {}}
        onRenameConversation={async () => {}}
        onDeleteConversation={async () => {}}
        onUploadFiles={async () => {}}
        onPasteText={async () => {}}
        onAddUrl={async () => {}}
        onRenameSource={async () => {}}
        onDeleteSource={async () => {}}
        onRetrySource={async () => {}}
        onReplaceSource={async () => {}}
        onSendMessage={async () => {}}
        onUpdateSettings={async () => {}}
        onCreateNote={async () => {}}
        onSaveAnswerAsNote={handleSaveNote}
        onUpdateNote={async () => {}}
        onDeleteNote={async () => {}}
        messages={mockMessages}
        chatLoading={false}
      />
    );

    expect(screen.getByText(/What is the grading policy\?/i)).toBeInTheDocument();
    const citationChip = screen.getByRole('button', { name: /^Citation 1: Syllabus\.pdf, page 2/i });
    expect(citationChip).toBeInTheDocument();

    fireEvent.click(citationChip);

    // Inspector panel should display cited passage once loading settles
    await waitFor(() => {
      expect(screen.getByText(/Midterm Exam: 25% of final grade/i)).toBeInTheDocument();
    });

    // Test Save as Note
    const saveNoteBtn = screen.getByRole('button', { name: /^save to note$/i });
    await act(async () => { fireEvent.click(saveNoteBtn); });
    expect(handleSaveNote).toHaveBeenCalledWith(mockMessages[1]);
  });

  it('shows See retrieval link on assistant answer with retrieved passages', () => {
    render(
      <SubjectWorkspaceView
        subject={activeSubject}
        sources={mockSources}
        selectedSourceIds={['src-1', 'src-2']}
        conversations={mockConversations}
        notes={[]}
        activeConversationId="conv-1"
        starterQuestions={[]}
        isDemoMode={false}
        onBackToDashboard={() => {}}
        onSelectSources={() => {}}
        onSelectConversation={() => {}}
        onCreateConversation={async () => {}}
        onRenameConversation={async () => {}}
        onDeleteConversation={async () => {}}
        onUploadFiles={async () => {}}
        onPasteText={async () => {}}
        onAddUrl={async () => {}}
        onRenameSource={async () => {}}
        onDeleteSource={async () => {}}
        onRetrySource={async () => {}}
        onReplaceSource={async () => {}}
        onSendMessage={async () => {}}
        onUpdateSettings={async () => {}}
        onCreateNote={async () => {}}
        onSaveAnswerAsNote={async () => {}}
        onUpdateNote={async () => {}}
        onDeleteNote={async () => {}}
        messages={mockMessages}
        chatLoading={false}
      />
    );

    const seeRetrievalBtn = screen.getByTestId('see-retrieval-btn-msg-2');
    expect(seeRetrievalBtn).toBeInTheDocument();
    expect(seeRetrievalBtn).toHaveAccessibleName('Retrieval details');
  });

  it('hides See retrieval link when abstained with no retrieved passages, but shows when passages exist', () => {
    const abstainedNoPassages: MessageItem = {
      id: 'msg-abs-none',
      conversation_id: 'conv-1',
      user_id: 'user-1',
      role: 'assistant',
      content: 'NOT FOUND IN YOUR DOCUMENTS',
      citations: [],
      conflicts: [],
      conflict_detected: false,
      abstained: true,
      abstain_reason: 'not_found',
      retrieved: [],
      selected_source_ids: ['src-1'],
      source_versions: {},
      tokens: { input: 10, output: 0, total: 10 },
      latency: 100,
      created_at: '2026-10-05T10:01:00Z',
    };

    const abstainedWithPassages: MessageItem = {
      id: 'msg-abs-with',
      conversation_id: 'conv-1',
      user_id: 'user-1',
      role: 'assistant',
      content: 'NOT FOUND IN YOUR DOCUMENTS',
      citations: [],
      conflicts: [],
      conflict_detected: false,
      abstained: true,
      abstain_reason: 'not_found',
      retrieved: [
        {
          id: 'chunk-1',
          source_id: 'src-1',
          file: 'Syllabus.pdf',
          file_name: 'Syllabus.pdf',
          page: 2,
          page_number: 2,
          chunk_text: 'Midterm Exam: 25% of final grade.',
          score: 0.15,
        },
      ],
      selected_source_ids: ['src-1'],
      source_versions: {},
      tokens: { input: 10, output: 0, total: 10 },
      latency: 100,
      created_at: '2026-10-05T10:02:00Z',
    };

    render(
      <SubjectWorkspaceView
        subject={activeSubject}
        sources={mockSources}
        selectedSourceIds={['src-1', 'src-2']}
        conversations={mockConversations}
        notes={[]}
        activeConversationId="conv-1"
        starterQuestions={[]}
        isDemoMode={false}
        onBackToDashboard={() => {}}
        onSelectSources={() => {}}
        onSelectConversation={() => {}}
        onCreateConversation={async () => {}}
        onRenameConversation={async () => {}}
        onDeleteConversation={async () => {}}
        onUploadFiles={async () => {}}
        onPasteText={async () => {}}
        onAddUrl={async () => {}}
        onRenameSource={async () => {}}
        onDeleteSource={async () => {}}
        onRetrySource={async () => {}}
        onReplaceSource={async () => {}}
        onSendMessage={async () => {}}
        onUpdateSettings={async () => {}}
        onCreateNote={async () => {}}
        onSaveAnswerAsNote={async () => {}}
        onUpdateNote={async () => {}}
        onDeleteNote={async () => {}}
        messages={[abstainedNoPassages, abstainedWithPassages]}
        chatLoading={false}
      />
    );

    // Hidden for abstained answer with no retrieved passages
    expect(screen.queryByTestId('see-retrieval-btn-msg-abs-none')).toBeNull();

    // Shown for abstained answer with retrieved passages
    expect(screen.getByTestId('see-retrieval-btn-msg-abs-with')).toBeInTheDocument();
  });

  it('opens the Retrieval tab and loads retrieval map for THAT message on click and keyboard activation', async () => {
    const retrievalSpy = vi.spyOn(api, 'getRetrievalMap').mockResolvedValue({
      subject_id: 'sub-1',
      question: 'What is the grading policy?',
      query_position: { x: 0.1, y: 0.2, z: 0.0 },
      abstained: false,
      abstain_reason: null,
      support_min_score: 0.2,
      retrieved_chunk_ids: [1],
      chunks: [],
    });

    render(
      <SubjectWorkspaceView
        subject={activeSubject}
        sources={mockSources}
        selectedSourceIds={['src-1', 'src-2']}
        conversations={mockConversations}
        notes={[]}
        activeConversationId="conv-1"
        starterQuestions={[]}
        isDemoMode={false}
        onBackToDashboard={() => {}}
        onSelectSources={() => {}}
        onSelectConversation={() => {}}
        onCreateConversation={async () => {}}
        onRenameConversation={async () => {}}
        onDeleteConversation={async () => {}}
        onUploadFiles={async () => {}}
        onPasteText={async () => {}}
        onAddUrl={async () => {}}
        onRenameSource={async () => {}}
        onDeleteSource={async () => {}}
        onRetrySource={async () => {}}
        onReplaceSource={async () => {}}
        onSendMessage={async () => {}}
        onUpdateSettings={async () => {}}
        onCreateNote={async () => {}}
        onSaveAnswerAsNote={async () => {}}
        onUpdateNote={async () => {}}
        onDeleteNote={async () => {}}
        messages={mockMessages}
        chatLoading={false}
      />
    );

    const seeRetrievalBtn = screen.getByTestId('see-retrieval-btn-msg-2');
    expect(seeRetrievalBtn).toBeInTheDocument();

    // Keyboard activation: focus and press Enter/click
    seeRetrievalBtn.focus();
    expect(document.activeElement).toBe(seeRetrievalBtn);

    await act(async () => {
      fireEvent.click(seeRetrievalBtn);
    });

    // Right panel inspector should now be visible and on Retrieval tab
    const retrievalTab = screen.getByTestId('right-panel-tab-evidence');
    expect(retrievalTab).toHaveClass('active');

    // api.getRetrievalMap should have been called with messageId: 'msg-2'
    await waitFor(() => {
      expect(retrievalSpy).toHaveBeenCalledWith(
        'sub-1',
        expect.objectContaining({
          conversationId: 'conv-1',
          messageId: 'msg-2',
        })
      );
    });
  });
});

describe('Guest Workspace & Access Flow', () => {
  it('renders guest workspace notice banner on the dashboard explaining browser privacy', () => {
    render(
      <DashboardView
        subjects={[]}
        loading={false}
        onOpenSubject={() => {}}
        onCreateSubject={async () => {}}
        onUpdateSubject={async () => {}}
        onArchiveSubject={async () => {}}
        onRestoreSubject={async () => {}}
        onDeleteSubject={async () => {}}
      />
    );

    const banner = screen.getByTestId('guest-workspace-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/Private Browser Workspace/i);
    expect(banner).toHaveTextContent(/private to this browser session/i);
  });
});
