import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Citation, normalizeFileName } from '../types';

interface MarkdownRendererProps {
  content: string;
  citations?: Citation[];
  isThisMessageSelected?: boolean;
  selectedCitation?: { file: string; page: number; messageId?: string } | null;
  onSelectCitation?: (cit: Citation) => void;
}

/**
 * Safely parse inline markdown formatting (**bold**, *italic*, and `code`).
 */
function renderInlineFormatting(text: string): React.ReactNode[] {
  if (!text) return [];
  const parts: React.ReactNode[] = [];
  // Regex to match `code`, **bold**, or *italic*
  const inlineRegex = /(`[^`]+`|\*\*[^*]+?\*\*|\*[^*]+?\*)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    const start = match.index;
    const end = inlineRegex.lastIndex;
    const raw = match[0];

    if (start > lastIdx) {
      parts.push(text.slice(lastIdx, start));
    }

    if (raw.startsWith('`') && raw.endsWith('`')) {
      parts.push(
        <code key={`code-${start}`} className="inline-code">
          {raw.slice(1, -1)}
        </code>
      );
    } else if (raw.startsWith('**') && raw.endsWith('**')) {
      parts.push(
        <strong key={`bold-${start}`} className="md-strong">
          {raw.slice(2, -2)}
        </strong>
      );
    } else if (raw.startsWith('*') && raw.endsWith('*')) {
      parts.push(
        <em key={`em-${start}`} className="md-em">
          {raw.slice(1, -1)}
        </em>
      );
    } else {
      parts.push(raw);
    }

    lastIdx = end;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts;
}

/**
 * Safely parse and render math expressions ($...$ and $$...$$).
 */
function renderMath(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match $$...$$ or $...$
  const mathRegex = /(\$\$[\s\S]+?\$\$|\$[^\$\n]+?\$)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = mathRegex.exec(text)) !== null) {
    const start = match.index;
    const end = mathRegex.lastIndex;
    const raw = match[0];

    if (start > lastIdx) {
      parts.push(...renderInlineFormatting(text.slice(lastIdx, start)));
    }

    const isDisplay = raw.startsWith('$$');
    const mathContent = isDisplay ? raw.slice(2, -2) : raw.slice(1, -1);

    try {
      const html = katex.renderToString(mathContent, {
        displayMode: isDisplay,
        throwOnError: false,
      });
      parts.push(
        <span
          key={`math-${start}`}
          className={isDisplay ? 'math-display' : 'math-inline'}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    } catch {
      parts.push(raw);
    }

    lastIdx = end;
  }

  if (lastIdx < text.length) {
    parts.push(...renderInlineFormatting(text.slice(lastIdx)));
  }

  return parts;
}

/**
 * Render text with interactive inline citation buttons: [filename p.N] or [Title p.N].
 */
export function renderTextWithCitations(
  text: string,
  citations?: Citation[],
  isThisMessageSelected: boolean = false,
  selectedCitation?: { file: string; page: number; messageId?: string } | null,
  onSelectCitation?: (cit: Citation) => void
): React.ReactNode {
  if (!text) return null;

  const elements: React.ReactNode[] = [];
  // Match [document.pdf p.1], [lecture.txt p.2], [Syllabus p.1]
  const citRegex = /\[\s*([^\[\]\r\n]+?)\s*,?\s*(?:p\.|page\.?|p)\s*(\d+)\s*\]/giu;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citRegex.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = citRegex.lastIndex;
    const rawMatchedText = match[0];
    const file = match[1].trim();
    const page = parseInt(match[2], 10);

    if (matchStart > lastIndex) {
      const chunk = text.slice(lastIndex, matchStart);
      elements.push(...renderMath(chunk));
    }

    // Match citation against available validated citations
    const availableCitations = citations || [];
    const matchedCitation = availableCitations.find((c) => {
      const citFileNorm = normalizeFileName(c.file);
      const citTitleNorm = normalizeFileName(c.title || c.file);
      const targetNorm = normalizeFileName(file);
      return (citFileNorm === targetNorm || citTitleNorm === targetNorm) && c.page === page;
    }) || (onSelectCitation ? { file, page } : undefined);

    if (matchedCitation && onSelectCitation) {
      const isActive =
        isThisMessageSelected &&
        normalizeFileName(selectedCitation?.file) === normalizeFileName(matchedCitation.file) &&
        selectedCitation?.page === matchedCitation.page;

      elements.push(
        <button
          key={`cit-${matchStart}`}
          type="button"
          className={`inline-citation-btn ${isActive ? 'active' : ''}`}
          onClick={() => onSelectCitation(matchedCitation)}
          data-testid="inline-citation"
          aria-label={`Citation: ${matchedCitation.file} page ${matchedCitation.page}`}
        >
          {rawMatchedText}
        </button>
      );
    } else {
      elements.push(...renderMath(rawMatchedText));
    }

    lastIndex = matchEnd;
  }

  if (lastIndex < text.length) {
    elements.push(...renderMath(text.slice(lastIndex)));
  }

  return elements;
}

/**
 * Simple markdown blocks renderer supporting headings, code blocks, lists, and paragraphs
 * without dangerous raw HTML injection.
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  citations = [],
  isThisMessageSelected = false,
  selectedCitation,
  onSelectCitation,
}) => {
  if (!content) return null;

  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLanguage = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block start / end
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        blocks.push(
          <pre key={`code-${i}`} className="code-block" data-language={codeLanguage || undefined}>
            <code className={codeLanguage ? `language-${codeLanguage}` : undefined}>{codeBuffer.join('\n')}</code>
          </pre>
        );
        codeBuffer = [];
        codeLanguage = '';
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLanguage = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Headings
    if (line.startsWith('# ')) {
      blocks.push(
        <h2 key={`h1-${i}`} className="md-heading-1">
          {renderTextWithCitations(line.slice(2), citations, isThisMessageSelected, selectedCitation, onSelectCitation)}
        </h2>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push(
        <h3 key={`h2-${i}`} className="md-heading-2">
          {renderTextWithCitations(line.slice(3), citations, isThisMessageSelected, selectedCitation, onSelectCitation)}
        </h3>
      );
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push(
        <h4 key={`h3-${i}`} className="md-heading-3">
          {renderTextWithCitations(line.slice(4), citations, isThisMessageSelected, selectedCitation, onSelectCitation)}
        </h4>
      );
      continue;
    }

    // Bullet points
    if (line.startsWith('- ') || line.startsWith('* ')) {
      blocks.push(
        <li key={`li-${i}`} className="md-list-item">
          {renderTextWithCitations(line.slice(2), citations, isThisMessageSelected, selectedCitation, onSelectCitation)}
        </li>
      );
      continue;
    }

    // Numbered list
    const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      blocks.push(
        <div key={`num-${i}`} className="md-numbered-item">
          <span className="md-num-badge">{numMatch[1]}.</span>
          <span>
            {renderTextWithCitations(numMatch[2], citations, isThisMessageSelected, selectedCitation, onSelectCitation)}
          </span>
        </div>
      );
      continue;
    }

    // Table row detection
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableLines = [line];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|') && lines[i + 1].trim().endsWith('|')) {
        i++;
        tableLines.push(lines[i]);
      }
      if (tableLines.length >= 2) {
        const headerRow = tableLines[0].trim().slice(1, -1).split('|').map((c) => c.trim());
        const hasDelimiter = tableLines[1].trim().includes('---');
        const bodyLines = hasDelimiter ? tableLines.slice(2) : tableLines.slice(1);
        blocks.push(
          <div key={`tbl-${i}`} className="table-responsive">
            <table className="md-table">
              <thead>
                <tr>
                  {headerRow.map((cell, cIdx) => (
                    <th key={cIdx}>{renderTextWithCitations(cell, citations, isThisMessageSelected, selectedCitation, onSelectCitation)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyLines.map((rowStr, rIdx) => {
                  const cells = rowStr.trim().slice(1, -1).split('|').map((c) => c.trim());
                  return (
                    <tr key={rIdx}>
                      {cells.map((cell, cIdx) => (
                        <td key={cIdx}>{renderTextWithCitations(cell, citations, isThisMessageSelected, selectedCitation, onSelectCitation)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // Empty line
    if (!line.trim()) {
      blocks.push(<div key={`sp-${i}`} className="md-spacer" />);
      continue;
    }

    // Paragraph
    blocks.push(
      <p key={`p-${i}`} className="md-paragraph">
        {renderTextWithCitations(line, citations, isThisMessageSelected, selectedCitation, onSelectCitation)}
      </p>
    );
  }

  // Flush open code block if any
  if (inCodeBlock && codeBuffer.length > 0) {
    blocks.push(
      <pre key="code-final" className="code-block">
        <code>{codeBuffer.join('\n')}</code>
      </pre>
    );
  }

  return <div className="markdown-content">{blocks}</div>;
};
