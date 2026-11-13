import { Conversation } from '../types';

interface SessionsViewProps {
  conversations: Conversation[];
  activeConversationId?: string | null;
  onNewSession?: () => void;
  onSelectSession?: (conversationId: string) => void;
}

/** Study sessions for this notebook: start a new one or return to an earlier one. Lives in the study panel. */
export function SessionsView({ conversations, activeConversationId, onNewSession, onSelectSession }: SessionsViewProps) {
  const sessions = [...conversations].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
  return (
    <div className="right-panel-body sessions-panel-body">
      <button type="button" className="study-action-btn" onClick={onNewSession} disabled={!onNewSession} data-testid="nav-new-session">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>New session</span>
      </button>
      <h3 className="study-section-label" id="study-sessions-title">Recent sessions</h3>
      {sessions.length === 0 ? (
        <p className="study-empty">No sessions yet. Ask a question to start one.</p>
      ) : (
        <ul className="study-list" aria-labelledby="study-sessions-title">
          {sessions.map((c) => {
            const active = c.id === activeConversationId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={`study-row ${active ? 'active' : ''}`}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onSelectSession?.(c.id)}
                  title={c.title || 'Untitled session'}
                >
                  <span className="study-row-label">{c.title || 'Untitled session'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const dayLabel = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** Compact session list for the History popover under the header clock button. */
export function SessionsPopoverList({ conversations, activeConversationId, onNewSession, onSelectSession }: SessionsViewProps) {
  const sessions = [...conversations].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  return (
    <>
      <button type="button" className="history-new-btn" onClick={onNewSession} disabled={!onNewSession} data-testid="nav-new-session">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        <span>New session</span>
      </button>
      <div className="history-divider" role="separator" />
      <h3 className="history-label" id="history-sessions-title">Recent sessions</h3>
      {sessions.length === 0 ? (
        <p className="history-empty">No sessions yet. Ask a question to start one.</p>
      ) : (
        <ul className="history-list" aria-labelledby="history-sessions-title">
          {sessions.map((c) => {
            const active = c.id === activeConversationId;
            const sub = [dayLabel(c.updated_at), c.message_count ? `${c.message_count} message${c.message_count === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
            return (
              <li key={c.id}>
                <button type="button" className={`history-row${active ? ' active' : ''}`} aria-current={active ? 'true' : undefined}
                  onClick={() => onSelectSession?.(c.id)} title={c.title || 'Untitled session'} aria-label={c.title || 'Untitled session'}>
                  <span className="history-row-text">
                    <span className="history-row-title">{c.title || 'Untitled session'}</span>
                    {sub && <span className="history-row-sub">{sub}</span>}
                  </span>
                  {active && <svg className="history-row-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
