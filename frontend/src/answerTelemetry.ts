// What a grounded answer can say about how it was produced, built only from the saved response:
// the embedding model, the retrieved chunks and their scores, the verified citations, and which
// distinct sources the answer rests on.
import { ConflictItem, MessageItem, normalizeFileName } from './types';

/** The embedding model every notebook is indexed with (README: FastEmbed ONNX runtime). */
export const EMBEDDING_MODEL = 'ONNX MiniLM-L6-v2';

/**
 * The backend adds this to a chunk's cosine similarity when the question's key terms appear in it
 * (db/notebook_store.py: boosted = max(score + 0.30, 0.40), capped at 1.0).
 */
export const KEYWORD_BOOST = 0.3;
const BOOST_FLOOR = 0.4;
const SCORE_CAP = 1;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const scoreOf = (r: { score?: number; similarity_score?: number }): number | null =>
  isNum(r.score) ? r.score : isNum(r.similarity_score) ? r.similarity_score : null;

export type TopScoreKind =
  /** No keyword matched: the score is the raw cosine similarity. */
  | 'vector'
  /** A keyword matched and the score is clear of the floor and cap: raw is the score minus the boost. */
  | 'estimated'
  /** A keyword matched but the floor or cap hid the raw value, so only the final score is known. */
  | 'boosted';

export interface TopScore {
  score: number;
  raw: number | null;
  boost: number | null;
  kind: TopScoreKind;
}

export interface AnswerTelemetry {
  model: string;
  /** Chunks the retriever handed to the model, or null when the response did not record them. */
  chunks: number | null;
  top: TopScore | null;
  /** Citations that were checked against the retrieved passages. */
  citations: number;
}

/**
 * The saved passage keeps only the boosted score (the raw cosine is overwritten), so the split into
 * raw + boost is exact for a chunk with no keyword match and an estimate for one with a match.
 */
export function topScoreOf(retrieved: MessageItem['retrieved'] | undefined): TopScore | null {
  let best: { score: number; matched: boolean } | null = null;
  for (const r of retrieved ?? []) {
    const score = scoreOf(r);
    if (score === null) continue;
    if (!best || score > best.score) best = { score, matched: Array.isArray(r.matched_terms) && r.matched_terms.length > 0 };
  }
  if (!best) return null;
  if (!best.matched) return { score: best.score, raw: best.score, boost: 0, kind: 'vector' };
  // At the floor or the cap the boost was clipped, so the raw value cannot be recovered.
  if (best.score >= SCORE_CAP - 1e-6 || best.score <= BOOST_FLOOR + 1e-6) {
    return { score: best.score, raw: null, boost: null, kind: 'boosted' };
  }
  return { score: best.score, raw: best.score - KEYWORD_BOOST, boost: KEYWORD_BOOST, kind: 'estimated' };
}

export function buildTelemetry(msg: Pick<MessageItem, 'retrieved' | 'citations'>): AnswerTelemetry {
  const retrieved = msg.retrieved ?? [];
  return {
    model: EMBEDDING_MODEL,
    chunks: retrieved.length > 0 ? retrieved.length : null,
    top: topScoreOf(retrieved),
    citations: (msg.citations ?? []).length,
  };
}

/** A grounded answer: it was not an abstention and it cites something. */
export const isGrounded = (msg: Pick<MessageItem, 'role' | 'abstained' | 'citations'>): boolean =>
  msg.role === 'assistant' && !msg.abstained && (msg.citations ?? []).length > 0;

// ----------------------------------------------------------------------------------------------
// Cross-source evidence
// ----------------------------------------------------------------------------------------------

export type CrossSourceStatus = 'conflict' | 'update' | 'multi';

export interface CrossSourceEntry {
  key: string;
  file: string;
  title: string;
  pages: number[];
  version?: number;
  excerpt: string;
  claims: Array<{ value: string; page: number; topic: string }>;
  /** A citation to open when the student wants the evidence. */
  open: { file: string; page: number; source_id?: string | null; source_version?: number };
}

export interface CrossSourceCheck {
  status: CrossSourceStatus;
  sources: CrossSourceEntry[];
  topics: string[];
  conflicts: ConflictItem[];
}

const UPDATE_CUES =
  /\b(updated?|superseded|supersedes|no longer|instead|however|contradict\w*|conflict\w*|disagree\w*|changed|replaced|correction|revised|newer|earlier version)\b/i;

const EXCERPT_LENGTH = 180;
const clip = (text: string): string => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > EXCERPT_LENGTH ? `${t.slice(0, EXCERPT_LENGTH).trimEnd()}…` : t;
};

/**
 * Present when the answer rests on more than one distinct source, or the backend flagged a
 * contradiction. A cue word ("however", "updated") only upgrades the wording for an answer that
 * already cites several sources; on its own it proves nothing.
 */
export function crossSourceCheck(
  msg: Pick<MessageItem, 'content' | 'citations' | 'conflicts' | 'conflict_detected' | 'retrieved' | 'abstained'>,
): CrossSourceCheck | null {
  if (msg.abstained) return null;
  const conflicts = msg.conflict_detected && msg.conflicts ? msg.conflicts.filter((c) => c.claims?.length) : [];
  const entries = new Map<string, CrossSourceEntry>();
  const keyOf = (file: string, sourceId?: string | null) => (sourceId ? `id:${sourceId}` : `name:${normalizeFileName(file)}`);

  const retrievedText = (file: string): string => {
    const hit = (msg.retrieved ?? []).find((r) => normalizeFileName(r.file || r.file_name || '') === normalizeFileName(file));
    return hit ? (hit.text || hit.chunk_text || '') : '';
  };
  const entry = (file: string, sourceId?: string | null, version?: number, title?: string | null): CrossSourceEntry => {
    // The same source can arrive with an id (a citation) and without one (a conflict claim): match on either.
    const name = normalizeFileName(file);
    let e = [...entries.values()].find((x) => (sourceId && x.key === `id:${sourceId}`) || normalizeFileName(x.file) === name);
    if (!e) {
      const key = keyOf(file, sourceId);
      e = { key, file, title: title || file, pages: [], version, excerpt: '', claims: [], open: { file, page: 1, source_id: sourceId, source_version: version } };
      entries.set(key, e);
    }
    return e;
  };

  for (const c of msg.citations ?? []) {
    const e = entry(c.file, c.source_id, c.source_version, c.title);
    if (!e.pages.includes(c.page)) e.pages.push(c.page);
    if (!e.excerpt) {
      e.excerpt = clip(c.excerpt || retrievedText(c.file));
      e.open = { file: c.file, page: c.page, source_id: c.source_id, source_version: c.source_version };
    }
  }
  for (const conflict of conflicts) {
    for (const claim of conflict.claims) {
      const e = entry(claim.file, claim.source_id, claim.source_version);
      if (!e.pages.includes(claim.page)) e.pages.push(claim.page);
      e.claims.push({ value: claim.value, page: claim.page, topic: conflict.topic });
      if (!e.excerpt) e.excerpt = clip(retrievedText(claim.file));
    }
  }

  const sources = [...entries.values()].map((e) => ({ ...e, pages: [...e.pages].sort((a, b) => a - b) }));
  if (conflicts.length === 0 && sources.length < 2) return null;
  const status: CrossSourceStatus = conflicts.length > 0 ? 'conflict' : UPDATE_CUES.test(msg.content) ? 'update' : 'multi';
  return { status, sources, topics: conflicts.map((c) => c.topic), conflicts };
}
