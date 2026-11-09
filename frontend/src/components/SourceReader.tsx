import React, { useEffect, useMemo, useRef } from 'react';
import type { SourceType } from '../types';
import { locatePassages, PassageInput, pageLabel, toParagraphs } from '../sourcePages';
import type { SourceText } from '../useSourceText';

export type ReaderNotice = 'none' | 'current' | 'replaced';

export interface SourceReaderProps {
  title: string;
  sourceType: SourceType;
  /** Version shown (the cited version, or the current one). */
  version: number | null;
  /** The source's total page count, if known. */
  pageCount: number;
  page: number;
  expanded: boolean;
  /** 'cited' marks the retrieved passage; the others show current text with a banner and no mark. */
  notice: ReaderNotice;
  currentVersion?: number;
  /** Text to look for on the page: the saved retrieved chunks, or the saved excerpt. Empty = no marking. */
  passages: PassageInput[];
  text: SourceText;
  removed: boolean;
  onPage: (page: number) => void;
  onToggleExpanded: () => void;
  onBack: () => void;
  onViewPlain: () => void;
  expandButtonRef?: React.Ref<HTMLButtonElement>;
  headingRef?: React.Ref<HTMLHeadingElement>;
}

export const READER_BODY_ID = 'source-reader-body';

/** A source's stored page text at a readable size, with the retrieved passage marked when it can be found exactly. */
export const SourceReader: React.FC<SourceReaderProps> = ({
  title, sourceType, version, pageCount, page, expanded, notice, currentVersion, passages, text, removed,
  onPage, onToggleExpanded, onBack, onViewPlain, expandButtonRef, headingRef,
}) => {
  const { unit, hint } = pageLabel(sourceType);
  const { order, pages, status } = text;
  const total = pageCount > 0 ? pageCount : order.length;
  const index = order.indexOf(page);
  const pageText = pages.get(page);
  const hasPageText = typeof pageText === 'string' && pageText.trim().length > 0;

  const ranges = useMemo(
    () => (hasPageText && notice === 'none' && passages.length ? locatePassages(pageText as string, passages) : []),
    [hasPageText, pageText, notice, passages],
  );
  const paragraphs = useMemo(() => (hasPageText ? toParagraphs(pageText as string, sourceType) : []), [hasPageText, pageText, sourceType]);

  // Scroll to the mark when a page opens with one; never again on re-renders.
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string>('');
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const key = `${page}:${version}`;
    if (status !== 'ready' || scrolledFor.current === key) return;
    scrolledFor.current = key;
    const mark = el.querySelector<HTMLElement>('mark.reader-mark');
    if (mark) {
      // Scroll only the reader body: scrollIntoView would also scroll the clipped panel around it.
      const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const top = el.scrollTop + mark.getBoundingClientRect().top - el.getBoundingClientRect().top - (el.clientHeight - mark.offsetHeight) / 2;
      if (typeof el.scrollTo === 'function') el.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
      else el.scrollTop = Math.max(0, top);
    } else {
      el.scrollTop = 0;
    }
  }, [status, page, version, ranges.length]);

  const renderParagraph = (p: { start: number; end: number; text: string }, key: number) => {
    const inside = ranges.filter((r) => r.end > p.start && r.start < p.end);
    if (!inside.length) return <p className="reader-paragraph" key={key}>{p.text}</p>;
    const parts: React.ReactNode[] = [];
    let at = p.start;
    inside.forEach((r, i) => {
      const s = Math.max(r.start, p.start);
      const e = Math.min(r.end, p.end);
      if (s > at) parts.push(p.text.slice(at - p.start, s - p.start));
      parts.push(
        <mark className="reader-mark" data-kind={r.kind} key={`m${i}`}>
          <span className="sr-only">Start of retrieved passage. </span>
          {p.text.slice(s - p.start, e - p.start)}
          <span className="sr-only"> End of retrieved passage.</span>
        </mark>,
      );
      at = e;
    });
    if (at < p.end) parts.push(p.text.slice(at - p.start));
    return <p className="reader-paragraph" key={key}>{parts}</p>;
  };

  let body: React.ReactNode;
  if (removed) {
    body = <p className="reader-state" role="status">This source was removed from the notebook.</p>;
  } else if (status === 'loading' || status === 'idle') {
    body = (
      <div className="reader-state" role="status">
        <p>Loading source</p>
        <div className="skeleton-loader" aria-hidden="true">
          <span className="skeleton-line line-long" /><span className="skeleton-line line-long" /><span className="skeleton-line line-short" />
        </div>
      </div>
    );
  } else if (status === 'error') {
    body = (
      <div className="reader-state" role="alert">
        <p>The source text could not be loaded.</p>
        <div className="reader-state-actions">
          <button type="button" className="reader-btn" onClick={text.retry}>Retry</button>
          <button type="button" className="reader-btn" onClick={onViewPlain}>View as plain text</button>
        </div>
      </div>
    );
  } else if (status === 'empty') {
    body = (
      <div className="reader-state" role="status">
        <p>No text was stored for this source.</p>
        <div className="reader-state-actions">
          <button type="button" className="reader-btn" onClick={onViewPlain}>View as plain text</button>
        </div>
      </div>
    );
  } else if (!hasPageText) {
    body = <p className="reader-state" role="status">No text was stored for {unit.toLowerCase()} {page}.</p>;
  } else {
    body = (
      <>
        {notice === 'none' && passages.length > 0 && ranges.length === 0 && (
          <p className="reader-note">The retrieved passage could not be located on this {unit.toLowerCase()}.</p>
        )}
        {ranges.some((r) => r.kind === 'excerpt') && (
          <p className="reader-note">Marked from the excerpt saved with the answer.</p>
        )}
        {paragraphs.map((p, i) => renderParagraph(p, i))}
      </>
    );
  }

  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < order.length - 1;

  return (
    <section className="source-reader" aria-label={`Source reader: ${title}, ${unit.toLowerCase()} ${page}${total ? ` of ${total}` : ''}`} data-testid="source-reader">
      <div className="source-reader-header">
        <button type="button" className="reader-btn reader-back" onClick={onBack} aria-label="Back to answer">Back</button>
        <button
          type="button" className="reader-btn reader-expand" ref={expandButtonRef}
          aria-expanded={expanded} aria-controls={READER_BODY_ID} onClick={onToggleExpanded}
          title={expanded ? 'Collapse reader' : 'Expand reader'}
        >{expanded ? 'Collapse' : 'Expand reader'}</button>
      </div>
      <div className="source-reader-identity">
        <h3 className="source-reader-title" tabIndex={-1} ref={headingRef}>{title}</h3>
        <p className="source-reader-meta">
          {version !== null && <span>v{version}</span>}
          <span>{unit} {page}{total ? ` of ${total}` : ''}</span>
          {hint && <span>{hint}</span>}
        </p>
      </div>
      {notice === 'current' && (
        <p className="reader-banner" role="note">Current version{currentVersion ? ` (v${currentVersion})` : ''}, not what the answer used.</p>
      )}
      {notice === 'replaced' && (
        <p className="reader-banner" role="note">This source was replaced{currentVersion ? ` (now v${currentVersion})` : ''}. Showing the current text.</p>
      )}
      <div className="source-reader-body" id={READER_BODY_ID} ref={bodyRef} tabIndex={-1}>{body}</div>
      <div className="source-reader-pager">
        <button type="button" className="reader-btn" disabled={!hasPrev || removed} onClick={() => hasPrev && onPage(order[index - 1])}>
          Previous {unit.toLowerCase()}
        </button>
        <span className="reader-page-indicator" aria-hidden="true">{unit} {page}{total ? ` / ${total}` : ''}</span>
        <button type="button" className="reader-btn" disabled={!hasNext || removed} onClick={() => hasNext && onPage(order[index + 1])}>
          Next {unit.toLowerCase()}
        </button>
      </div>
    </section>
  );
};
