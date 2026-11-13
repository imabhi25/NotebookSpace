import React from 'react';

export const BrandLogo: React.FC<{ size?: number; className?: string }> = ({ size = 26, className = '' }) => {
  return (
    <svg
      className={`brand-logo-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* Left stem (rounded top-left, parallel angled bottom) */}
      <path
        d="M2.2 10.2C2.2 8.212 3.812 6.6 5.8 6.6H7.8V21.2L3.32 22.85C2.73 23.07 2.2 22.63 2.2 22.0V10.2Z"
        fill="#1A3454"
      />
      {/* Right curved arch (bold stem, parallel angled bottom) */}
      <path
        d="M10.4 6.6H13.4C18.039 6.6 21.8 10.361 21.8 15.0V21.2L17.32 22.85C16.73 23.07 16.2 22.63 16.2 22.0V15.2C16.2 13.322 14.678 11.8 12.8 11.8H10.4V6.6Z"
        fill="#1A3454"
      />
      {/* Warm Amber Idea Dot */}
      <circle cx="19.6" cy="3.2" r="2.5" fill="#EB984E" />
    </svg>
  );
};
