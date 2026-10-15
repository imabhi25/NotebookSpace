import React from 'react';

interface FileTypeIconProps {
  sourceType?: string;
  className?: string;
}

const TYPE_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  pdf: { label: 'PDF', badgeClass: 'badge-pdf' },
  docx: { label: 'DOC', badgeClass: 'badge-docx' },
  doc: { label: 'DOC', badgeClass: 'badge-doc' },
  pptx: { label: 'PPT', badgeClass: 'badge-pptx' },
  ppt: { label: 'PPT', badgeClass: 'badge-ppt' },
  xlsx: { label: 'XLS', badgeClass: 'badge-xlsx' },
  xls: { label: 'XLS', badgeClass: 'badge-xls' },
  csv: { label: 'CSV', badgeClass: 'badge-csv' },
  markdown: { label: 'MD', badgeClass: 'badge-markdown' },
  md: { label: 'MD', badgeClass: 'badge-md' },
  txt: { label: 'TXT', badgeClass: 'badge-txt' },
  text: { label: 'TXT', badgeClass: 'badge-text' },
  pasted: { label: 'TXT', badgeClass: 'badge-pasted' },
  url: { label: 'WEB', badgeClass: 'badge-url' },
  web: { label: 'WEB', badgeClass: 'badge-web' },
  html: { label: 'WEB', badgeClass: 'badge-html' },
  code: { label: '</>', badgeClass: 'badge-code' },
};

export const FileTypeIcon: React.FC<FileTypeIconProps> = ({ sourceType, className }) => {
  const norm = (sourceType || '').toLowerCase();
  const config = TYPE_CONFIG[norm] || { label: 'TXT', badgeClass: 'badge-txt' };
  const isCode = config.label === '</>';
  const isTwoLetter = config.label.length === 2;
  const fontSize = isCode ? '5.2' : isTwoLetter ? '7.5' : '6.8';
  const letterSpacing = isCode || isTwoLetter ? '0' : '-0.3';

  return (
    <span
      className={`file-type-icon ${config.badgeClass} ${className || ''}`.trim()}
      aria-hidden="true"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="file-type-icon-svg"
      >
        <path
          d="M 5 2 H 15 L 20 7 V 21 C 20 21.55 19.55 22 19 22 H 5 C 4.45 22 4 21.55 4 21 V 3 C 4 2.45 4.45 2 5 2 Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d="M 15 2 V 7 H 20"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <text
          x="12"
          y="16"
          textAnchor="middle"
          fontSize={fontSize}
          fontWeight="800"
          letterSpacing={letterSpacing}
          fill="currentColor"
        >
          {config.label}
        </text>
      </svg>
    </span>
  );
};
