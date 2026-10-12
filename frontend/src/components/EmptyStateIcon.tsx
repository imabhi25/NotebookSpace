/** Shared visual cue; existing empty-state copy and actions stay in their owners. */
export function EmptyStateIcon() {
  return (
    <span className="empty-state-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M6 3h8l4 4v14H6V3Z" />
        <path d="M14 3v5h4M9 12h6M9 16h4" />
      </svg>
    </span>
  );
}
