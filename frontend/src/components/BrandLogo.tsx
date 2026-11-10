import React from 'react';

export const BrandLogo: React.FC<{ size?: number; className?: string }> = ({ size = 22, className = '' }) => {
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
      {/* Left Page (Dominant / Shaded) */}
      <path
        className="logo-page-left"
        d="M10.8 2.2C6.8 0.8 3.2 1.3 1.5 2.5C0.6 3.1 0 4.1 0 5.2V19.8C0 21.2 1.1 22.3 2.5 22.5C4.8 22.9 8.2 23.4 10.8 24V2.2Z"
        fill="currentColor"
      />
      {/* Right Page (Lighter Duo-Tone) */}
      <path
        className="logo-page-right"
        d="M13.2 2.2C17.2 0.8 20.8 1.3 22.5 2.5C23.4 3.1 24 4.1 24 5.2V19.8C24 21.2 22.9 22.3 21.5 22.5C19.2 22.9 15.8 23.4 13.2 24V2.2Z"
        fill="currentColor"
      />
    </svg>
  );
};
