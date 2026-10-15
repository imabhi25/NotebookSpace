import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DashboardView } from './components/DashboardView';
import { SubjectWorkspaceView } from './components/SubjectWorkspaceView';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { AssistantMessage } from './components/AssistantMessage';
import { Sidebar } from './components/Sidebar';
import { SourcePanel } from './components/SourcePanel';
import { Subject, Source, Conversation, MessageItem, AskResponse } from './types';

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
    expect(screen.getByText(/3\s+sources/i)).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/search notebooks/i);
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

  it('renders sources with checkboxes and toggles selection', () => {
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

    expect(screen.getByText('Syllabus.pdf')).toBeInTheDocument();
    expect(screen.getByText('Lecture 1.pdf')).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 selected/i)).toBeInTheDocument();

    const selectAllBtn = screen.getByRole('button', { name: /Select all/i });
    fireEvent.click(selectAllBtn);
    expect(handleSelectSources).toHaveBeenCalledWith(['src-1', 'src-2']);
  });

  it('renders chat message with citation and handles inline citation chip click', async () => {
    const handleSaveNote = vi.fn();

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
    const citationChip = screen.getByRole('button', { name: /Syllabus\.pdf p\.2/i });
    expect(citationChip).toBeInTheDocument();

    fireEvent.click(citationChip);

    // Inspector panel should display cited passage once loading settles
    await waitFor(() => {
      expect(screen.getByText(/Midterm Exam: 25% of final grade/i)).toBeInTheDocument();
    });

    // Test Save as Note
    const saveNoteBtn = screen.getByRole('button', { name: /save to note/i });
    fireEvent.click(saveNoteBtn);
    expect(handleSaveNote).toHaveBeenCalledWith(mockMessages[1]);
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
    expect(banner).toHaveTextContent(/private to this browser/i);
    expect(banner).toHaveTextContent(/No sign-in needed/i);
  });
});

describe('Phase 1: Conflict Resolution (Current vs Superseded)', () => {
  const resolvedResult: AskResponse = {
    answer: 'Assignment 1 is due October 21 [announcement_update.pdf p.1].',
    citations: [{ file: 'announcement_update.pdf', page: 1 }],
    conflict_detected: true,
    conflicts: [
      {
        topic: 'Assignment 1 deadline',
        claims: [
          { file: 'syllabus.pdf', page: 3, value: 'October 15' },
          { file: 'announcement_update.pdf', page: 1, value: 'October 21' },
        ],
        resolution: {
          current_file: 'announcement_update.pdf',
          current_page: 1,
          basis: 'newer_source_explicit_override',
          evidence: 'Announcement dated Oct 10 explicitly extends the deadline.',
        },
      },
    ],
    tokens: { input: 10, output: 20, total: 30 },
    latency: 0.1,
    retrieved: [],
    abstained: false,
  };

  it('renders Current and Superseded badges, evidence, and top summary banner', () => {
    const handleSelect = vi.fn();
    render(
      <AssistantMessage
        result={resolvedResult}
        onSelectCitation={handleSelect}
        sources={[
          { id: '1', title: 'Course Syllabus', file_name: 'syllabus.pdf', status: 'ready', created_at: '', updated_at: '' } as Source,
          { id: '2', title: 'Announcement Update', file_name: 'announcement_update.pdf', status: 'ready', created_at: '', updated_at: '' } as Source,
        ]}
      />
    );

    // Top summary banner above answer
    const summaryBanner = screen.getByTestId('conflict-summary-banner');
    expect(summaryBanner).toBeInTheDocument();
    expect(summaryBanner).toHaveTextContent(/Announcement Update updates the Assignment 1 deadline/i);

    // Current badge on winning source
    const currentBadge = screen.getByTestId('badge-current');
    expect(currentBadge).toBeInTheDocument();
    expect(currentBadge).toHaveTextContent('Current');

    // Superseded badge on outdated source
    const supersededBadge = screen.getByTestId('badge-superseded');
    expect(supersededBadge).toBeInTheDocument();
    expect(supersededBadge).toHaveTextContent('Superseded');

    // Evidence display
    const evidence = screen.getByTestId('conflict-evidence');
    expect(evidence).toBeInTheDocument();
    expect(evidence).toHaveTextContent(/Announcement dated Oct 10 explicitly extends the deadline/i);

    // Clicking claim selects citation
    const claimBtn = screen.getByRole('button', { name: /Claim: October 21 in announcement_update\.pdf page 1/i });
    fireEvent.click(claimBtn);
    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ file: 'announcement_update.pdf', page: 1 }),
      ''
    );
  });

  it('renders neutral disclaimer when conflict has no resolution', () => {
    const unresolvedResult: AskResponse = {
      answer: 'Conflicting dates found.',
      citations: [{ file: 'doc_a.pdf', page: 1 }],
      conflict_detected: true,
      conflicts: [
        {
          topic: 'exam date',
          claims: [
            { file: 'doc_a.pdf', page: 1, value: 'Dec 10' },
            { file: 'doc_b.pdf', page: 2, value: 'Dec 15' },
          ],
          resolution: null,
        },
      ],
      tokens: { input: 10, output: 20, total: 30 },
      latency: 0.1,
      retrieved: [],
      abstained: false,
    };

    render(
      <AssistantMessage
        result={unresolvedResult}
        onSelectCitation={() => {}}
      />
    );

    expect(screen.queryByTestId('badge-current')).not.toBeInTheDocument();
    expect(screen.queryByTestId('badge-superseded')).not.toBeInTheDocument();
    const unresolvedNote = screen.getByTestId('conflict-unresolved-note');
    expect(unresolvedNote).toBeInTheDocument();
    expect(unresolvedNote).toHaveTextContent(/The sources don’t say which is newer\. Check with your instructor\./i);
  });
});

describe('Phase 2: Conventions & Convention Mismatch', () => {
  const conventionResult: AskResponse = {
    answer: 'Arrays are processed from index 1 to n.',
    citations: [{ file: 'tutorial_02_arrays.pdf', page: 1 }],
    conflict_detected: false,
    conflicts: [],
    conventions: [
      {
        topic: 'array_indexing',
        value: '1-indexed',
        file: 'tutorial_02_arrays.pdf',
        page: 1,
        adopted: true,
      },
    ],
    convention_mismatches: [
      {
        topic: 'array_indexing',
        conventions: [
          {
            topic: 'array_indexing',
            value: '0-indexed',
            file: 'lecture_algorithms_math_code.pdf',
            page: 1,
            adopted: false,
          },
          {
            topic: 'array_indexing',
            value: '1-indexed',
            file: 'tutorial_02_arrays.pdf',
            page: 1,
            adopted: true,
          },
        ],
        adopted_file: 'tutorial_02_arrays.pdf',
        adopted_value: '1-indexed',
      },
    ],
    tokens: { input: 10, output: 20, total: 30 },
    latency: 0.1,
    retrieved: [],
    abstained: false,
  };

  it('renders convention pills at top of answer and handles click', () => {
    const handleSelect = vi.fn();
    render(
      <AssistantMessage
        result={conventionResult}
        onSelectCitation={handleSelect}
        sources={[
          { id: '1', title: 'Tutorial 02 Arrays', file_name: 'tutorial_02_arrays.pdf', status: 'ready', created_at: '', updated_at: '' } as Source,
          { id: '2', title: 'Lecture Algorithms', file_name: 'lecture_algorithms_math_code.pdf', status: 'ready', created_at: '', updated_at: '' } as Source,
        ]}
      />
    );

    const pill = screen.getByTestId('convention-pill-0');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveTextContent(/1-indexed · Tutorial 02 Arrays/i);

    fireEvent.click(pill);
    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ file: 'tutorial_02_arrays.pdf', page: 1 }),
      ''
    );
  });

  it('renders softer convention mismatch card with adopted badge and alternative card', () => {
    const handleSelect = vi.fn();
    render(
      <AssistantMessage
        result={conventionResult}
        onSelectCitation={handleSelect}
        sources={[
          { id: '1', title: 'Tutorial 02 Arrays', file_name: 'tutorial_02_arrays.pdf', status: 'ready', created_at: '', updated_at: '' } as Source,
          { id: '2', title: 'Lecture Algorithms', file_name: 'lecture_algorithms_math_code.pdf', status: 'ready', created_at: '', updated_at: '' } as Source,
        ]}
      />
    );

    const mismatchView = screen.getByTestId('convention-mismatch-view');
    expect(mismatchView).toBeInTheDocument();
    expect(screen.getByText(/Convention Mismatch Noted/i)).toBeInTheDocument();
    expect(screen.getByText(/Topic: array indexing/i)).toBeInTheDocument();

    const summary = screen.getByTestId('convention-mismatch-summary');
    expect(summary).toHaveTextContent(/Lecture Algorithms uses 0-indexed; Tutorial 02 Arrays uses 1-indexed\. This answer follows Tutorial 02 Arrays\./i);

    const adoptedBadge = screen.getByTestId('badge-adopted');
    expect(adoptedBadge).toHaveTextContent('✓ Followed in answer');
    expect(screen.getByText('Alternative')).toBeInTheDocument();

    // Clicking alternative convention selects its citation
    const altConvCard = screen.getByRole('button', { name: /Convention: 0-indexed in Lecture Algorithms page 1/i });
    fireEvent.click(altConvCard);
    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ file: 'lecture_algorithms_math_code.pdf', page: 1 }),
      ''
    );
  });
});

describe('Superseded Badges in Sidebar and SourcePanel', () => {
  it('renders Superseded badge on document in Sidebar when marked in supersededMap', () => {
    const docs = [
      { file_name: 'syllabus.pdf', page_count: 3, chunk_count: 5 },
      { file_name: 'announcement_update.pdf', page_count: 1, chunk_count: 2 },
    ];
    const supersededMap = {
      'syllabus.pdf': { supersededBy: 'announcement_update.pdf', topic: 'deadline' },
    };

    render(
      <Sidebar
        documents={docs}
        isDemoMode={true}
        onNewChat={() => {}}
        onUpload={() => {}}
        uploadFile={null}
        setUploadFile={() => {}}
        uploading={false}
        uploadMsg={null}
        isOpenMobile={false}
        onCloseMobile={() => {}}
        supersededMap={supersededMap}
      />
    );

    const supersededBadge = screen.getByTestId('doc-superseded-badge');
    expect(supersededBadge).toBeInTheDocument();
    expect(supersededBadge).toHaveTextContent('Superseded');
    expect(supersededBadge).toHaveAttribute('title', 'Superseded by Announcement update');
  });

  it('renders Superseded badge in SourcePanel header when selected document is superseded', () => {
    const supersededMap = {
      'syllabus.pdf': { supersededBy: 'announcement_update.pdf', topic: 'deadline' },
    };

    render(
      <SourcePanel
        selectedCitation={{ file: 'syllabus.pdf', page: 3 }}
        citations={[{ file: 'syllabus.pdf', page: 3 }]}
        passages={[{ file_name: 'syllabus.pdf', page_number: 3, chunk_index: 0, text: 'Old deadline October 15' }]}
        passageLoading={false}
        onSelectCitation={() => {}}
        onClose={() => {}}
        isOpen={true}
        supersededMap={supersededMap}
      />
    );

    const panelBadge = screen.getByTestId('panel-superseded-badge');
    expect(panelBadge).toBeInTheDocument();
    expect(panelBadge).toHaveTextContent('Superseded');
  });
});

