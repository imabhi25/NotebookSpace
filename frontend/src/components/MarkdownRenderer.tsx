import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Citation } from '../types';
import { stripCitationMarkers } from '../citationRefs';

interface MarkdownRendererProps {
  content: string;
  citations?: Citation[];
  isThisMessageSelected?: boolean;
  selectedCitation?: { file: string; page: number; messageId?: string } | null;
  onSelectCitation?: (cit: Citation) => void;
  /** Marks a citation whose source has been replaced or removed, so the marker can say so. */
  citationState?: (cit: Citation) => 'replaced' | 'removed' | undefined;
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

interface MathSpan {
  start: number;
  end: number;
  tex: string;
  display: boolean;
}

const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);
const isDigit = (ch: string | undefined) => ch !== undefined && /\d/.test(ch);

/**
 * Find $...$ and $$...$$ spans, pairing delimiters left to right. An inline span opens only
 * on a "$" followed by a non-space and closes only on a "$" preceded by a non-space and not
 * followed by a digit, so prices like "$5 and $10" stay text. "\$" is a literal dollar,
 * backtick code is never math, and inline math never crosses a line break.
 */
function findMathSpans(text: string): MathSpan[] {
  const spans: MathSpan[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\' && text[i + 1] === '$') {
      i += 2;
      continue;
    }
    if (ch === '`') {
      const close = text.indexOf('`', i + 1);
      i = close === -1 ? i + 1 : close + 1;
      continue;
    }
    if (ch !== '$') {
      i++;
      continue;
    }
    if (text[i + 1] === '$') {
      const close = text.indexOf('$$', i + 2);
      if (close > i + 2) {
        spans.push({ start: i, end: close + 2, tex: text.slice(i + 2, close), display: true });
        i = close + 2;
      } else {
        i += 2;
      }
      continue;
    }
    if (isSpace(text[i + 1])) {
      i++;
      continue;
    }
    let close = -1;
    for (let j = i + 1; j < text.length && text[j] !== '\n'; j++) {
      if (text[j] === '\\') {
        j++;
        continue;
      }
      if (text[j] === '$' && !isSpace(text[j - 1]) && !isDigit(text[j + 1])) {
        close = j;
        break;
      }
    }
    if (close === -1) {
      i++;
      continue;
    }
    spans.push({ start: i, end: close + 1, tex: text.slice(i + 1, close), display: false });
    i = close + 1;
  }
  return spans;
}

function renderPlainText(text: string): React.ReactNode[] {
  return renderInlineFormatting(text).map((part) =>
    typeof part === 'string' ? part.replace(/\\\$/g, '$') : part
  );
}

/**
 * Render $...$ and $$...$$ with KaTeX. HTML output only, so the hidden MathML copy can never
 * show up as duplicated text; the TeX source is the accessible name instead. If KaTeX cannot
 * parse an expression, its source is shown as plain text.
 */
function renderMath(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;

  for (const span of findMathSpans(text)) {
    if (span.start > lastIdx) {
      parts.push(...renderPlainText(text.slice(lastIdx, span.start)));
    }
    try {
      const html = katex.renderToString(span.tex, {
        displayMode: span.display,
        throwOnError: true,
        output: 'html',
      });
      parts.push(
        <span
          key={`math-${span.start}`}
          className={span.display ? 'math-display' : 'math-inline'}
          role="math"
          aria-label={span.tex}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    } catch {
      parts.push(text.slice(span.start, span.end));
    }
    lastIdx = span.end;
  }

  if (lastIdx < text.length) {
    parts.push(...renderPlainText(text.slice(lastIdx)));
  }

  return parts;
}

/**
 * Render text with interactive inline citation buttons: [filename p.N] or [Title p.N].
 */
export function renderTextWithCitations(
  text: string,
  _citations?: Citation[],
  _isThisMessageSelected: boolean = false,
  _selectedCitation?: { file: string; page: number; messageId?: string } | null,
  _onSelectCitation?: (cit: Citation) => void,
  _citationState?: (cit: Citation) => 'replaced' | 'removed' | undefined
): React.ReactNode {
  if (!text) return null;

  // Citations stay in the Citations panel; the visible prose carries no markers.
  return renderMath(stripCitationMarkers(text));
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
  citationState,
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
          {renderTextWithCitations(line.slice(2), citations, isThisMessageSelected, selectedCitation, onSelectCitation, citationState)}
        </h2>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push(
        <h3 key={`h2-${i}`} className="md-heading-2">
          {renderTextWithCitations(line.slice(3), citations, isThisMessageSelected, selectedCitation, onSelectCitation, citationState)}
        </h3>
      );
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push(
        <h4 key={`h3-${i}`} className="md-heading-3">
          {renderTextWithCitations(line.slice(4), citations, isThisMessageSelected, selectedCitation, onSelectCitation, citationState)}
        </h4>
      );
      continue;
    }

    // Bullet points
    if (line.startsWith('- ') || line.startsWith('* ')) {
      blocks.push(
        <li key={`li-${i}`} className="md-list-item">
          {renderTextWithCitations(line.slice(2), citations, isThisMessageSelected, selectedCitation, onSelectCitation, citationState)}
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
            {renderTextWithCitations(numMatch[2], citations, isThisMessageSelected, selectedCitation, onSelectCitation, citationState)}
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
                    <th key={cIdx}>{renderTextWithCitations(cell, citations, isThisMessageSelected, selectedCitation, onSelectCitation, citationState)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyLines.map((rowStr, rIdx) => {
                  const cells = rowStr.trim().slice(1, -1).split('|').map((c) => c.trim());
                  return (
                    <tr key={rIdx}>
                      {cells.map((cell, cIdx) => (
                        <td key={cIdx}>{renderTextWithCitations(cell, citations, isThisMessageSelected, selectedCitation, onSelectCitation, citationState)}</td>
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
        {renderTextWithCitations(line, citations, isThisMessageSelected, selectedCitation, onSelectCitation, citationState)}
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
