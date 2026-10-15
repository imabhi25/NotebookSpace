import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useState } from 'react';
import { Composer, ProofDraft, initialProofDraft } from './components/Composer';
import { SubjectWorkspaceView } from './components/SubjectWorkspaceView';
import { escapeLatex, formatProofAsLatex, MessageItem, Subject, Source, Conversation } from './types';

describe('Proof Check: LaTeX Escaping and Formatting', () => {
  it('escapes &, %, #, _ outside math blocks but preserves math untouched', () => {
    const raw = 'Variable a & b with 50% discount #1 in file_name, where $a < b$ & $x_1 = 0$.';
    const escaped = escapeLatex(raw);
    expect(escaped).toBe('Variable a \\& b with 50\\% discount \\#1 in file\\_name, where $a < b$ \\& $x_1 = 0$.');
  });

  it('formats loop invariant proof as LaTeX with proper bold section titles', () => {
    const sub = {
      statement: 'Sum of 1 to n',
      format: 'loop_invariant' as const,
      initialization: 'Before loop, $s = 0$ & $i = 1$.',
      maintenance: 'At loop step, $s\' = s + i$ with 100% precision.',
      termination: 'When $i > n$, total is returned #done.',
    };
    const latex = formatProofAsLatex(sub);
    expect(latex).toBe(
      '\\begin{proof} \\textbf{Initialization.} Before loop, $s = 0$ \\& $i = 1$. \\textbf{Maintenance.} At loop step, $s\' = s + i$ with 100\\% precision. \\textbf{Termination.} When $i > n$, total is returned \\#done. \\end{proof}'
    );
  });

  it('formats free-form proof as LaTeX inside proof environment', () => {
    const sub = {
      statement: 'Direct proof',
      format: 'free_form' as const,
      body: 'Assume $P(k)$ holds. Then $P(k+1)$ follows directly & trivially.',
    };
    const latex = formatProofAsLatex(sub);
    expect(latex).toBe(
      '\\begin{proof} Assume $P(k)$ holds. Then $P(k+1)$ follows directly \\& trivially. \\end{proof}'
    );
  });
});

describe('Proof Check: Composer State & Draft Persistence', () => {
  function ComposerWrapper() {
    const [mode, setMode] = useState<'ask' | 'proof'>('ask');
    const [draft, setDraft] = useState<ProofDraft>(initialProofDraft);
    const [question, setQuestion] = useState('');

    return (
      <div>
        <button data-testid="external-proof-mode-toggle" onClick={() => setMode(mode === 'ask' ? 'proof' : 'ask')}>
          Toggle Mode
        </button>
        <Composer
          question={question}
          setQuestion={setQuestion}
          onSubmit={vi.fn()}
          loading={false}
          mode={mode}
          onModeChange={setMode}
          proofDraft={draft}
          setProofDraft={setDraft}
          onSubmitProof={vi.fn()}
          selectedSourceCount={1}
        />
      </div>
    );
  }

  it('preserves drafts across mode switching and format toggling', () => {
    render(<ComposerWrapper />);

    // Switch to proof mode
    fireEvent.click(screen.getByTestId('external-proof-mode-toggle'));
    expect(screen.getByTestId('proof-composer-card')).toBeInTheDocument();

    // Fill in statement and loop invariant fields
    const statementInput = screen.getByTestId('proof-statement-input');
    fireEvent.change(statementInput, { target: { value: 'Invariant for insertion sort' } });

    const initInput = screen.getByTestId('proof-init-input');
    fireEvent.change(initInput, { target: { value: 'Base case is sorted' } });

    const maintInput = screen.getByTestId('proof-maint-input');
    fireEvent.change(maintInput, { target: { value: 'Preserves sorted order' } });

    const termInput = screen.getByTestId('proof-term-input');
    fireEvent.change(termInput, { target: { value: 'Terminates when i = n' } });

    // Switch format to free_form
    fireEvent.click(screen.getByTestId('toggle-free-form'));
    expect(screen.queryByTestId('proof-init-input')).not.toBeInTheDocument();

    const bodyInput = screen.getByTestId('proof-body-input');
    fireEvent.change(bodyInput, { target: { value: 'Free-form body attempt' } });

    // Switch back to loop_invariant format
    fireEvent.click(screen.getByTestId('toggle-loop-invariant'));
    expect(screen.getByTestId('proof-init-input')).toHaveValue('Base case is sorted');
    expect(screen.getByTestId('proof-maint-input')).toHaveValue('Preserves sorted order');
    expect(screen.getByTestId('proof-term-input')).toHaveValue('Terminates when i = n');

    // Switch mode back to ask via chip close
    const chipRemove = screen.getByTestId('proof-mode-remove');
    fireEvent.click(chipRemove);
    expect(screen.queryByTestId('proof-composer-card')).not.toBeInTheDocument();

    // Reopen proof mode
    fireEvent.click(screen.getByTestId('external-proof-mode-toggle'));
    expect(screen.getByTestId('proof-statement-input')).toHaveValue('Invariant for insertion sort');
    expect(screen.getByTestId('proof-init-input')).toHaveValue('Base case is sorted');

    // Switch back to free_form to confirm body was also kept
    fireEvent.click(screen.getByTestId('toggle-free-form'));
    expect(screen.getByTestId('proof-body-input')).toHaveValue('Free-form body attempt');
  });
});

describe('Proof Check: Assistant Turn & Verdict Badges', () => {
  const mockSubject: Subject = {
    id: 'sub-1',
    name: 'EECS 3101',
    course_code: 'EECS 3101',
    description: 'Algorithms',
    is_archived: false,
    source_count: 1,
    settings: { response_length: 'default', response_style: 'general' },
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-10T12:00:00Z',
  };

  const mockSources: Source[] = [
    {
      id: 'src-1',
      subject_id: 'sub-1',
      user_id: 'u-1',
      file_name: 'lecture_algorithms_math_code.pdf',
      title: 'Algorithms Lecture Notes',
      source_type: 'pdf',
      status: 'ready',
      version: 1,
      page_count: 10,
      word_count: 500,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
    } as Source,
  ];

  const mockConversations: Conversation[] = [
    {
      id: 'conv-1',
      subject_id: 'sub-1',
      user_id: 'u-1',
      title: 'Insertion Sort Proof',
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
    },
  ];

  it('renders verdict badges with text and color classes, and toggles hints', () => {
    const messages: MessageItem[] = [
      {
        id: 'msg-u1',
        conversation_id: 'conv-1',
        user_id: 'u-1',
        role: 'user',
        content: 'Proof attempt',
        citations: [],
        conflicts: [],
        conflict_detected: false,
        proof_check: {
          statement: 'Loop invariant for insertion sort',
          format: 'loop_invariant',
          initialization: 'A[1..1] sorted',
          maintenance: 'Inserting preserves order',
          termination: 'Terminates when i = n',
        },
        abstained: false,
        retrieved: [],
        selected_source_ids: ['src-1'],
        source_versions: { 'src-1': 1 },
        tokens: { input: 10, output: 20, total: 30 },
        latency: 0.8,
        created_at: '2026-10-01T10:00:00Z',
      },
      {
        id: 'msg-a1',
        conversation_id: 'conv-1',
        user_id: 'u-1',
        role: 'assistant',
        content: 'Overall feedback summary',
        citations: [],
        conflicts: [],
        conflict_detected: false,
        proof_check: {
          supported: true,
          overall: 'Your proof is mostly solid, but termination needs attention.',
          sections: [
            {
              part: 'initialization',
              verdict: 'correct',
              feedback: 'Initialization is cleanly established for single-element subarray.',
              hint: 'Double-check base case index bounds.',
              citations: [{ file: 'lecture_algorithms_math_code.pdf', page: 4 }],
            },
            {
              part: 'maintenance',
              verdict: 'partially_correct',
              feedback: 'Maintenance correctly outlines inductive step but skips key exchange step.',
              hint: 'Consider how elements shift right.',
              citations: [],
            },
            {
              part: 'termination',
              verdict: 'incorrect',
              feedback: 'Loop terminates at i = n + 1, not i = n.',
              hint: 'Check the for-loop upper bound in the pseudocode.',
              citations: [{ file: 'lecture_algorithms_math_code.pdf', page: 5 }],
            },
          ],
        },
        abstained: false,
        retrieved: [],
        selected_source_ids: ['src-1'],
        source_versions: { 'src-1': 1 },
        tokens: { input: 100, output: 120, total: 220 },
        latency: 1.2,
        created_at: '2026-10-01T10:00:02Z',
      },
    ];

    render(
      <SubjectWorkspaceView
        subject={mockSubject}
        sources={mockSources}
        selectedSourceIds={['src-1']}
        conversations={mockConversations}
        notes={[]}
        activeConversationId="conv-1"
        starterQuestions={[]}
        isDemoMode={false}
        onBackToDashboard={() => {}}
        onSelectSources={vi.fn()}
        onSelectConversation={vi.fn()}
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
        messages={messages}
        chatLoading={false}
      />
    );

    // Verify overall banner
    expect(screen.getByTestId('proof-overall-banner')).toHaveTextContent(
      'Your proof is mostly solid, but termination needs attention.'
    );

    // Verify verdict badges text and classes
    const initBadge = screen.getByTestId('verdict-initialization');
    expect(initBadge).toHaveTextContent('✓ Correct');
    expect(initBadge).toHaveClass('verdict-correct');

    const maintBadge = screen.getByTestId('verdict-maintenance');
    expect(maintBadge).toHaveTextContent('⚠ Partially Correct');
    expect(maintBadge).toHaveClass('verdict-partially_correct');

    const termBadge = screen.getByTestId('verdict-termination');
    expect(termBadge).toHaveTextContent('✕ Incorrect');
    expect(termBadge).toHaveClass('verdict-incorrect');

    // Verify hint is hidden initially
    expect(screen.queryByTestId('hint-content-initialization')).not.toBeInTheDocument();

    // Click hint toggle to expand
    const hintToggle = screen.getByTestId('hint-toggle-initialization');
    expect(hintToggle).toHaveTextContent('Show hint');
    fireEvent.click(hintToggle);

    // Now hint is visible
    expect(screen.getByTestId('hint-content-initialization')).toBeInTheDocument();
    expect(screen.getByTestId('hint-content-initialization')).toHaveTextContent(
      'Double-check base case index bounds.'
    );
    expect(hintToggle).toHaveTextContent('Hide hint');

    // Click again to collapse
    fireEvent.click(hintToggle);
    expect(screen.queryByTestId('hint-content-initialization')).not.toBeInTheDocument();
  });

  it('renders Copy as LaTeX button on user proof submission and writes formatted LaTeX to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const messages: MessageItem[] = [
      {
        id: 'msg-u2',
        conversation_id: 'conv-1',
        user_id: 'u-1',
        role: 'user',
        content: 'User proof attempt',
        citations: [],
        conflicts: [],
        conflict_detected: false,
        proof_check: {
          statement: 'Binary Search invariant',
          format: 'loop_invariant',
          initialization: '$low = 0$ & $high = n - 1$',
          maintenance: 'Mid calculation retains target in range with 100% certainty',
          termination: 'Exits when $low > high$',
        },
        abstained: false,
        retrieved: [],
        selected_source_ids: ['src-1'],
        source_versions: { 'src-1': 1 },
        tokens: { input: 10, output: 20, total: 30 },
        latency: 0.5,
        created_at: '2026-10-01T10:00:00Z',
      },
    ];

    render(
      <SubjectWorkspaceView
        subject={mockSubject}
        sources={mockSources}
        selectedSourceIds={['src-1']}
        conversations={mockConversations}
        notes={[]}
        activeConversationId="conv-1"
        starterQuestions={[]}
        isDemoMode={false}
        onBackToDashboard={() => {}}
        onSelectSources={vi.fn()}
        onSelectConversation={vi.fn()}
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
        messages={messages}
        chatLoading={false}
      />
    );

    const copyBtn = screen.getByTestId('copy-as-latex-btn');
    expect(copyBtn).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalledWith(
      '\\begin{proof} \\textbf{Initialization.} $low = 0$ \\& $high = n - 1$ \\textbf{Maintenance.} Mid calculation retains target in range with 100\\% certainty \\textbf{Termination.} Exits when $low > high$ \\end{proof}'
    );
  });
});
