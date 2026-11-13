import React from 'react';

export const BrandLogo: React.FC<{ size?: number; className?: string }> = ({ size = 24, className = '' }) => {
  return (
    <svg
      className={`brand-logo-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: 'block', width: `${size}px`, height: `${size}px`, flexShrink: 0 }}
    >
      {/* Left stem (rounded top-left, parallel angled bottom) */}
      <path
        d="M2.2 10.1C2.2 8.112 3.812 6.5 5.8 6.5H7.8V19.85L3.32 21.5C2.73 21.72 2.2 21.28 2.2 20.65V10.1Z"
        fill="#1A3454"
      />
      {/* Right curved arch (bold stem, parallel angled bottom) */}
      <path
        d="M10.4 6.5H13.4C18.039 6.5 21.8 10.261 21.8 14.9V19.85L17.32 21.5C16.73 21.72 16.2 21.28 16.2 20.65V15.1C16.2 13.222 14.678 11.7 12.8 11.7H10.4V6.5Z"
        fill="#1A3454"
      />
      {/* Warm Amber Idea Dot */}
      <circle cx="19.5" cy="3.5" r="2.2" fill="#EB984E" />
    </svg>
  );
};
