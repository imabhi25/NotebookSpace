import React from 'react';

// Stands in for the workspace while its code or data loads; same three regions, so nothing jumps.
export const WorkspaceSkeleton: React.FC = () => (
  <div className="workspace-loading-state workspace-skeleton" role="status" aria-busy="true">
    <p className="loading-caption sr-only">Loading notebook...</p>
    <div className="workspace-skeleton-bar" aria-hidden="true">
      <span className="skeleton-line line-short" />
    </div>
    <div className="workspace-skeleton-body" aria-hidden="true">
      <div className="workspace-skeleton-panel skeleton-side">
        <span className="skeleton-line line-med" />
        <span className="skeleton-line line-long" />
        <span className="skeleton-line line-long" />
        <span className="skeleton-line line-short" />
      </div>
      <div className="workspace-skeleton-panel skeleton-sheet">
        <span className="skeleton-line line-short" />
        <span className="skeleton-line line-long" />
        <span className="skeleton-line line-long" />
        <span className="skeleton-line line-med" />
      </div>
      <div className="workspace-skeleton-panel skeleton-side skeleton-inspector">
        <span className="skeleton-line line-med" />
        <span className="skeleton-line line-long" />
        <span className="skeleton-line line-short" />
      </div>
    </div>
  </div>
);
