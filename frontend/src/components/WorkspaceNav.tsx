import { forwardRef } from 'react';
import { Conversation } from '../types';

interface WorkspaceNavProps {
  subjectName: string;
  courseCode?: string | null;
  conversations: Conversation[];
  activeConversationId?: string | null;
  notesCount: number;
  onBackToDashboard: () => void;
  onNewSession?: () => void;
  onSelectSession?: (conversationId: string) => void;
  onOpenNotes: () => void;
  onCollapse: () => void;
  collapsed: boolean;
}

/** Left navigation: where this notebook is, its study sessions, and saved notes. Sources live on the right. */
export const WorkspaceNav = forwardRef<HTMLElement, WorkspaceNavProps>(function WorkspaceNav(
  {
    subjectName,
    courseCode,
    conversations,
    activeConversationId,
    notesCount,
    onBackToDashboard,
    onNewSession,
    onSelectSession,
    onOpenNotes,
    onCollapse,
    collapsed,
  },
  ref
) {
  const sessions = [...conversations].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
  return (
    <aside className="workspace-nav" id="workspace-nav-panel" aria-label="Navigation" aria-hidden={collapsed} ref={ref} tabIndex={-1}>
      <div className="workspace-nav-header">
        <button
          type="button"
          className="workspace-nav-notebook"
          onClick={onBackToDashboard}
          title="Switch notebook"
          aria-label={`Switch notebook. Current notebook: ${subjectName}`}
        >
          <span className="workspace-nav-notebook-text">
            <span className="workspace-nav-notebook-name">{subjectName}</span>
            {courseCode && <span className="workspace-nav-notebook-code">{courseCode}</span>}
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
          </svg>
        </button>
        <button type="button" className="panel-toggle-btn workspace-nav-collapse" onClick={onCollapse}
          title="Hide navigation" aria-label="Hide navigation">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="3.5" />
            <line x1="9" y1="9" x2="9" y2="15" />
          </svg>
        </button>
      </div>

      <button type="button" className="workspace-nav-new" onClick={onNewSession} disabled={!onNewSession} data-testid="nav-new-session">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>New session</span>
      </button>

      <nav className="workspace-nav-section workspace-nav-sessions" aria-labelledby="workspace-nav-sessions-title">
        <h2 id="workspace-nav-sessions-title" className="workspace-nav-heading">Recent sessions</h2>
        {sessions.length === 0 ? (
          <p className="workspace-nav-empty">No sessions yet. Ask a question to start one.</p>
        ) : (
          <ul className="workspace-nav-list">
            {sessions.map((c) => {
              const active = c.id === activeConversationId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`workspace-nav-row ${active ? 'active' : ''}`}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => onSelectSession?.(c.id)}
                    title={c.title || 'Untitled session'}
                  >
                    <span className="workspace-nav-row-label">{c.title || 'Untitled session'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div className="workspace-nav-footer">
        <button type="button" className="workspace-nav-row" onClick={onOpenNotes} data-testid="nav-saved-notes">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="workspace-nav-row-label">Saved notes</span>
          <span className="workspace-nav-count">{notesCount}</span>
        </button>
      </div>
    </aside>
  );
});
