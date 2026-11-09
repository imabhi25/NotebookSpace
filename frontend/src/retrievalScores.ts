// Hybrid retrieval scoring for the inspector. The backend ranks with
//   final = cosine + keyword boost
// and reports both `raw_cosine` and `score` (final). Scaling the boost by a weight alpha lets a student
// see how much of the ranking comes from keywords: alpha 0 is pure vector similarity, 1 is the
// backend's own ranking, 2 leans heavily on lexical matches.

export const ALPHA_MIN = 0;
export const ALPHA_MAX = 2;
export const ALPHA_DEFAULT = 1;
export const ALPHA_STEP = 0.05;

interface Scored { id: number; raw_cosine?: number | null; score?: number | null }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** raw + alpha * (final - raw). At the default weight it is the backend's score, untouched. */
export function adjustScore(raw: number | null | undefined, final: number | null | undefined, alpha: number): number | null {
  if (!isNum(final)) return null;
  if (!isNum(raw) || alpha === ALPHA_DEFAULT) return final;
  return raw + alpha * (final - raw);
}

export interface ScoreParts {
  raw: number;
  /** The keyword boost after weighting; zero when no keyword matched. */
  boost: number;
  total: number;
}

export function scoreParts(raw: number | null | undefined, final: number | null | undefined, alpha: number): ScoreParts | null {
  const total = adjustScore(raw, final, alpha);
  if (total === null || !isNum(raw)) return null;
  return { raw, boost: total - raw, total };
}

/** Best adjusted score first; ties fall back to raw cosine, then to the original order. */
export function rankByAlpha<T extends Scored>(chunks: T[], alpha: number): T[] {
  return chunks
    .map((chunk, order) => ({ chunk, order, adjusted: adjustScore(chunk.raw_cosine, chunk.score, alpha) ?? -Infinity }))
    .sort((a, b) => b.adjusted - a.adjusted
      || (b.chunk.raw_cosine ?? -Infinity) - (a.chunk.raw_cosine ?? -Infinity)
      || a.order - b.order)
    .map((s) => s.chunk);
}

/** 1-based rank of every chunk at the weight given. */
export function ranksAt<T extends Scored>(chunks: T[], alpha: number): Map<number, number> {
  return new Map(rankByAlpha(chunks, alpha).map((c, i) => [c.id, i + 1]));
}

/** "0.0x", "1.0x" -- the weight as a multiplier. */
export const formatAlpha = (alpha: number): string => `${alpha.toFixed(2)}x`;

/** Width of a bar segment as a percentage of a 0 to 1 scale, kept inside the track. */
export const barPercent = (value: number): number => Math.max(0, Math.min(1, value)) * 100;
