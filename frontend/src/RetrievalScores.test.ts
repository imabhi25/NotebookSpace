import { describe, expect, it } from 'vitest';
import { adjustScore, barPercent, formatAlpha, rankByAlpha, ranksAt, scoreParts } from './retrievalScores';

describe('adjustScore', () => {
  it('is the backend score untouched at the default weight, even above 1', () => {
    expect(adjustScore(0.72, 1.02, 1)).toBe(1.02);
  });
  it('is pure cosine at 0 and doubles the boost at 2', () => {
    expect(adjustScore(0.4, 0.7, 0)).toBeCloseTo(0.4);
    expect(adjustScore(0.4, 0.7, 2)).toBeCloseTo(1.0);
    expect(adjustScore(0.4, 0.7, 0.5)).toBeCloseTo(0.55);
  });
  it('leaves a chunk with no keyword match unchanged at every weight', () => {
    for (const a of [0, 0.5, 1, 2]) expect(adjustScore(0.3, 0.3, a)).toBeCloseTo(0.3);
  });
  it('returns null without a final score and the final score without a raw one', () => {
    expect(adjustScore(0.3, null, 1)).toBeNull();
    expect(adjustScore(undefined, 0.6, 0)).toBe(0.6);
  });
});

describe('scoreParts', () => {
  it('splits a score into cosine and weighted boost', () => {
    const p = scoreParts(0.412, 0.712, 0.5)!;
    expect(p.raw).toBeCloseTo(0.412);
    expect(p.boost).toBeCloseTo(0.15);
    expect(p.total).toBeCloseTo(0.562);
  });
  it('is null when the cosine is unknown', () => {
    expect(scoreParts(null, 0.5, 1)).toBeNull();
  });
});

describe('rankByAlpha', () => {
  // A: strong vector match, no keywords.  B: weaker vector match that matched keywords (boosted).
  const chunks = [
    { id: 1, raw_cosine: 0.62, score: 0.62 },
    { id: 2, raw_cosine: 0.4, score: 0.7 },
    { id: 3, raw_cosine: 0.5, score: 0.5 },
  ];
  it('ranks by the backend score at the default weight', () => {
    expect(rankByAlpha(chunks, 1).map((c) => c.id)).toEqual([2, 1, 3]);
  });
  it('promotes the vector-strong chunk once the boost is removed', () => {
    expect(rankByAlpha(chunks, 0).map((c) => c.id)).toEqual([1, 3, 2]);
  });
  it('lets keywords dominate at the top of the range', () => {
    expect(rankByAlpha(chunks, 2).map((c) => c.id)).toEqual([2, 1, 3]);
  });
  it('does not mutate its input and keeps order on ties', () => {
    const copy = [...chunks];
    rankByAlpha(chunks, 0);
    expect(chunks).toEqual(copy);
    expect(rankByAlpha([{ id: 9, raw_cosine: 0.5, score: 0.5 }, { id: 8, raw_cosine: 0.5, score: 0.5 }], 1).map((c) => c.id)).toEqual([9, 8]);
  });
  it('puts chunks without a score last', () => {
    expect(rankByAlpha([{ id: 1 }, { id: 2, raw_cosine: 0.1, score: 0.1 }], 1).map((c) => c.id)).toEqual([2, 1]);
  });
  it('ranksAt gives 1-based ranks', () => {
    expect(ranksAt(chunks, 0).get(2)).toBe(3);
    expect(ranksAt(chunks, 1).get(2)).toBe(1);
  });
});

describe('formatting', () => {
  it('formats the weight and clamps bar widths', () => {
    expect(formatAlpha(1)).toBe('1.00x');
    expect(formatAlpha(0.05)).toBe('0.05x');
    expect(barPercent(1.02)).toBe(100);
    expect(barPercent(-0.2)).toBe(0);
    expect(barPercent(0.25)).toBe(25);
  });
});
