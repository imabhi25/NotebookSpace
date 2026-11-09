import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { getCachedPages, ParsedPages, parseSourcePages, setCachedPages } from './sourcePages';

export type SourceTextStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface SourceText {
  status: SourceTextStatus;
  pages: Map<number, string>;
  order: number[];
  /** Version the pages belong to (from the response, or the known version on a cache hit). */
  version: number | null;
  retry: () => void;
}

const NONE: ParsedPages = { pages: new Map(), order: [] };

/**
 * Loads a source's stored text for the reader, without the chunk list, and parses it into pages.
 * `knownVersion` is the version the workspace already knows; with it a cached source needs no request.
 * A late response for a previous source or retry is dropped.
 */
export function useSourceText(
  subjectId: string,
  sourceId: string | null,
  knownVersion: number | null,
  enabled: boolean,
): SourceText {
  const [state, setState] = useState<{ status: SourceTextStatus; parsed: ParsedPages; version: number | null }>(
    { status: 'idle', parsed: NONE, version: null },
  );
  const [attempt, setAttempt] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    const id = ++requestRef.current;
    if (!enabled || !sourceId) {
      setState({ status: 'idle', parsed: NONE, version: null });
      return;
    }
    if (knownVersion !== null) {
      const hit = getCachedPages(`${sourceId}:${knownVersion}`);
      if (hit) {
        setState({ status: hit.order.length ? 'ready' : 'empty', parsed: hit, version: knownVersion });
        return;
      }
    }
    setState({ status: 'loading', parsed: NONE, version: null });
    api.getSourceDetail(subjectId, sourceId, { includePassages: false })
      .then((detail) => {
        if (id !== requestRef.current) return;
        const parsed = parseSourcePages(detail.raw_content);
        const version = typeof detail.version === 'number' ? detail.version : knownVersion;
        if (version !== null && parsed.order.length) setCachedPages(`${sourceId}:${version}`, parsed);
        setState({ status: parsed.order.length ? 'ready' : 'empty', parsed, version });
      })
      .catch(() => {
        if (id !== requestRef.current) return;
        setState({ status: 'error', parsed: NONE, version: null });
      });
  }, [subjectId, sourceId, knownVersion, enabled, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { status: state.status, pages: state.parsed.pages, order: state.parsed.order, version: state.version, retry };
}
