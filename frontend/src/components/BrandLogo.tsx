import React from 'react';

export const BrandLogo: React.FC<{ size?: number; className?: string }> = ({ size = 26, className = '' }) => {
  return (
    <svg
      className={`brand-logo-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Left Page (Dominant) */}
      <path
        className="logo-page-left"
        d="M14.5 7.2C10.8 5.8 7.2 6.3 5.4 7.2C4.5 7.7 4 8.6 4 9.6V23.4C4 24.6 4.9 25.5 6.1 25.7C8.2 26.1 11.5 26.5 14.5 27.8V7.2Z"
        fill="currentColor"
      />
      {/* Right Page (Lighter / Duo-Tone) */}
      <path
        className="logo-page-right"
        d="M17.5 7.2C21.2 5.8 24.8 6.3 26.6 7.2C27.5 7.7 28 8.6 28 9.6V23.4C28 24.6 27.1 25.5 25.9 25.7C23.8 26.1 20.5 26.5 17.5 27.8V7.2Z"
        fill="currentColor"
      />
    </svg>
  );
};
