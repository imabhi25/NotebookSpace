import React from 'react';

/** NotebookSpace mark: a stitched notebook spine with a single evidence marker. */
export const BrandMark: React.FC<{ size?: number }> = ({ size = 30 }) => (
  <svg
    className="brand-mark-svg"
    width={size}
    height={size}
    viewBox="0 0 32 32"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="3" y="2" width="26" height="28" rx="6" fill="var(--accent)" />
    <g stroke="var(--text-on-accent)" strokeWidth="2" strokeLinecap="round" opacity="0.55">
      <line x1="8.5" y1="9" x2="8.5" y2="11.5" />
      <line x1="8.5" y1="15" x2="8.5" y2="17.5" />
      <line x1="8.5" y1="21" x2="8.5" y2="23.5" />
    </g>
    <g stroke="var(--text-on-accent)" strokeWidth="2.2" strokeLinecap="round">
      <line x1="13.5" y1="10.5" x2="23" y2="10.5" />
      <line x1="13.5" y1="16" x2="19" y2="16" />
    </g>
    <circle cx="22" cy="22" r="3.2" fill="var(--text-on-accent)" />
  </svg>
);
