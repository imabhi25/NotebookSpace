import React, { useEffect, useRef, useState, useMemo } from 'react';
import { api } from '../api';
import { RetrievalMapResponse, RetrievalMapChunk, Source } from '../types';
import {
  ALPHA_DEFAULT, ALPHA_MAX, ALPHA_MIN, ALPHA_STEP, adjustScore, barPercent, formatAlpha, rankByAlpha, ranksAt, scoreParts, ScoreParts,
} from '../retrievalScores';

interface RetrievalMapViewProps {
  subjectId: string;
  conversationId?: string | null;
  messageId?: string | null;
  question?: string | null;
  selectedSourceIds?: string[];
  sources?: Source[];
  onSelectPassage?: (file: string, page: number) => void;
  onClose?: () => void;
}

const PALETTE = [
  '#38bdf8', // sky
  '#4ade80', // emerald
  '#f472b6', // pink
  '#fbbf24', // amber
  '#a78bfa', // purple
  '#fb923c', // orange
  '#2dd4bf', // teal
  '#818cf8', // indigo
];

/** The part of a score that comes from vector similarity, stacked with the part that comes from keywords. */
const ScoreBar: React.FC<{ parts: ScoreParts; threshold?: number | null }> = ({ parts, threshold }) => {
  const rawPct = barPercent(parts.raw);
  const totalPct = barPercent(parts.total);
  return (
    <div className="score-bar" data-testid="score-bar">
      <div
        className="score-bar-track" role="img"
        aria-label={`Raw cosine ${parts.raw.toFixed(3)} plus keyword boost ${parts.boost.toFixed(3)} equals ${parts.total.toFixed(3)}`}
      >
        <span className="score-bar-raw" style={{ width: `${rawPct}%` }} />
        <span className="score-bar-boost" style={{ left: `${rawPct}%`, width: `${Math.max(0, totalPct - rawPct)}%` }} />
        {typeof threshold === 'number' && (
          <span className="score-bar-threshold" style={{ left: `${barPercent(threshold)}%` }} title={`Support threshold ${threshold.toFixed(2)}`} />
        )}
      </div>
      <div className="score-bar-legend" aria-hidden="true">
        <span className="score-bar-key score-bar-key-raw">cosine {parts.raw.toFixed(3)}</span>
        <span className="score-bar-key score-bar-key-boost">+ boost {parts.boost.toFixed(3)}</span>
      </div>
    </div>
  );
};

/** Scales the keyword boost: 0 is pure vector similarity, 1 the backend's ranking, 2 heavily lexical. */
const HybridWeightControl: React.FC<{ alpha: number; onChange: (alpha: number) => void; disabled: boolean }> = ({ alpha, onChange, disabled }) => (
  <div className="hybrid-weight" data-testid="hybrid-weight">
    <div className="hybrid-weight-head">
      <label htmlFor="hybrid-weight-slider" className="hybrid-weight-label">
        Hybrid Boost Weight: <span className="hybrid-weight-value" data-testid="hybrid-weight-value">{formatAlpha(alpha)}</span>
      </label>
      <button type="button" className="hybrid-weight-reset" onClick={() => onChange(ALPHA_DEFAULT)} disabled={disabled || alpha === ALPHA_DEFAULT}>
        Reset
      </button>
    </div>
    <input
      id="hybrid-weight-slider" type="range" min={ALPHA_MIN} max={ALPHA_MAX} step={ALPHA_STEP} value={alpha} disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-valuetext={`${formatAlpha(alpha)}${alpha === 0 ? ', pure vector' : alpha === ALPHA_DEFAULT ? ', default' : alpha === ALPHA_MAX ? ', heavy lexical' : ''}`}
    />
    <div className="hybrid-weight-scale" aria-hidden="true">
      <span>0.0x <small>Pure Vector</small></span>
      <span>1.0x <small>Default</small></span>
      <span>2.0x <small>Heavy Lexical</small></span>
    </div>
    <p className="hybrid-weight-formula">
      {disabled ? 'Ask a question to score chunks against it.' : <>final = cosine + <b>{formatAlpha(alpha)}</b> &middot; keyword boost</>}
    </p>
  </div>
);

/** Scrolls the nearest scrolling ancestor, never a clipped one, so a hover cannot shove the panel out of place. */
function scrollIntoNearestScroller(el: HTMLElement) {
  let parent = el.parentElement;
  while (parent) {
    const overflowY = getComputedStyle(parent).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
      const box = parent.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      if (rect.top < box.top) parent.scrollTop -= box.top - rect.top + 8;
      else if (rect.bottom > box.bottom) parent.scrollTop += rect.bottom - box.bottom + 8;
      return;
    }
    parent = parent.parentElement;
  }
}

export const RetrievalMapView: React.FC<RetrievalMapViewProps> = ({
  subjectId,
  conversationId,
  messageId,
  question,
  selectedSourceIds,
  sources = [],
  onSelectPassage,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RetrievalMapResponse | null>(null);
  const [selectedChunkId, setSelectedChunkId] = useState<number | null>(null);
  const [hoveredChunkId, setHoveredChunkId] = useState<number | null>(null);
  const [alpha, setAlpha] = useState(ALPHA_DEFAULT);
  // Which side started the highlight: only a dot should scroll a card into view, never the reverse.
  const highlightOrigin = useRef<'dot' | 'card' | null>(null);
  const cardRefs = useRef(new Map<number, HTMLElement>());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .getRetrievalMap(subjectId, {
        conversationId: conversationId || undefined,
        messageId: messageId || undefined,
        question: question || undefined,
        selectedSourceIds,
      })
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
          // Auto-select retrieved chunk with highest final score if available
          const retrievedIds = res.retrieved_chunk_ids || [];
          if (retrievedIds.length > 0) {
            const retrievedSet = new Set(retrievedIds);
            const retrieved = res.chunks.filter((c) => retrievedSet.has(c.id));
            const ranked = [...retrieved].sort((a, b) => {
              const scoreA = typeof a.score === 'number' ? a.score : -Infinity;
              const scoreB = typeof b.score === 'number' ? b.score : -Infinity;
              if (scoreB !== scoreA) return scoreB - scoreA;
              const rawA = typeof a.raw_cosine === 'number' ? a.raw_cosine : -Infinity;
              const rawB = typeof b.raw_cosine === 'number' ? b.raw_cosine : -Infinity;
              return rawB - rawA;
            });
            if (ranked.length > 0) {
              setSelectedChunkId(ranked[0].id);
            } else {
              setSelectedChunkId(null);
            }
          } else {
            setSelectedChunkId(null);
          }
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err?.message || 'Failed to load retrieval map');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [subjectId, conversationId, messageId, question, selectedSourceIds?.join(',')]);

  // Color map for source files
  const sourceColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const uniqueSourceIds = Array.from(new Set(data?.chunks.map((c) => c.source_id) || []));
    uniqueSourceIds.forEach((sid, idx) => {
      map.set(sid, PALETTE[idx % PALETTE.length]);
    });
    return map;
  }, [data]);

  // SVG coordinate projection
  const svgWidth = 520;
  const svgHeight = 340;
  const padding = 45;

  const { points, queryPoint } = useMemo(() => {
    if (!data || data.chunks.length === 0) {
      return { points: [], queryPoint: null };
    }

    const allX = data.chunks.map((c) => c.position.x);
    const allY = data.chunks.map((c) => c.position.y);
    if (data.query_position) {
      allX.push(data.query_position.x);
      allY.push(data.query_position.y);
    }

    let minX = Math.min(...allX);
    let maxX = Math.max(...allX);
    let minY = Math.min(...allY);
    let maxY = Math.max(...allY);

    // Guard against 0 range
    if (maxX - minX < 1e-4) {
      minX -= 1;
      maxX += 1;
    }
    if (maxY - minY < 1e-4) {
      minY -= 1;
      maxY += 1;
    }

    const scaleX = (x: number) => padding + ((x - minX) / (maxX - minX)) * (svgWidth - 2 * padding);
    const scaleY = (y: number) => svgHeight - (padding + ((y - minY) / (maxY - minY)) * (svgHeight - 2 * padding));

    const pts = data.chunks.map((c) => ({
      ...c,
      svgX: scaleX(c.position.x),
      svgY: scaleY(c.position.y),
    }));

    const qPt = data.query_position
      ? {
          svgX: scaleX(data.query_position.x),
          svgY: scaleY(data.query_position.y),
        }
      : null;

    return { points: pts, queryPoint: qPt };
  }, [data]);

  const activeChunk: RetrievalMapChunk | null = useMemo(() => {
    if (!data) return null;
    const targetId = hoveredChunkId ?? selectedChunkId;
    if (targetId === null || targetId === undefined) return null;
    return data.chunks.find((c) => c.id === targetId) || null;
  }, [data, hoveredChunkId, selectedChunkId]);

  const retrievedChunks = useMemo(() => {
    if (!data) return [];
    const retrievedSet = new Set(data.retrieved_chunk_ids || []);
    return data.chunks.filter((c) => retrievedSet.has(c.id));
  }, [data]);
  const rankedRetrievedChunks = useMemo(() => rankByAlpha(retrievedChunks, alpha), [retrievedChunks, alpha]);
  const baselineRanks = useMemo(() => ranksAt(retrievedChunks, ALPHA_DEFAULT), [retrievedChunks]);
  const canWeight = retrievedChunks.some((c) => typeof c.raw_cosine === 'number' && typeof c.score === 'number');

  // A hover or click on a dot brings its passage card into view.
  useEffect(() => {
    if (highlightOrigin.current !== 'dot') return;
    const id = hoveredChunkId ?? selectedChunkId;
    const el = id === null ? null : cardRefs.current.get(id);
    if (el) scrollIntoNearestScroller(el);
  }, [hoveredChunkId, selectedChunkId]);

  if (loading) {
    return (
      <div className="retrieval-map-loading" role="status" aria-live="polite" data-testid="retrieval-map-loading">
        <div className="step-spinner" aria-hidden="true" />
        <p className="retrieval-loading-text">Computing 2D PCA embedding projection...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="retrieval-map-error" role="alert">
        <p>{error}</p>
      </div>
    );
  }

  if (!data || data.chunks.length === 0) {
    return (
      <div className="retrieval-map-empty" data-testid="retrieval-map-empty">
        <div className="empty-icon-circle" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="12" cy="12" r="3" />
            <circle cx="19" cy="5" r="2" />
            <circle cx="5" cy="19" r="2" />
          </svg>
        </div>
        <h3>No embedding chunks available</h3>
        <p>Upload or select course materials to view their semantic vector projection.</p>
      </div>
    );
  }

  return (
    <div className="retrieval-map-root" data-testid="retrieval-map-view">
      <HybridWeightControl alpha={alpha} onChange={setAlpha} disabled={!canWeight} />

      {/* Header Info */}
      <div className="retrieval-map-header">
        <div className="retrieval-map-meta">
          <span className="retrieval-chunk-count">
            {data.chunks.length} chunk{data.chunks.length === 1 ? '' : 's'} indexed
          </span>
          {data.retrieved_chunk_ids && data.retrieved_chunk_ids.length > 0 && (
            <span className="retrieval-matched-count">
              &bull; {data.retrieved_chunk_ids.length} retrieved passage{data.retrieved_chunk_ids.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {data.question && (
          <div className="retrieval-query-bar" title={data.question}>
            <span className="query-badge">Query:</span>
            <span className="query-text">&ldquo;{data.question}&rdquo;</span>
          </div>
        )}
      </div>

      {/* SVG Canvas */}
      <div className="retrieval-canvas-container">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="retrieval-svg"
          role="img"
          aria-label="2D Retrieval Embedding Scatter Plot"
        >
          {/* Subtle grid lines */}
          <line x1={padding} y1={svgHeight / 2} x2={svgWidth - padding} y2={svgHeight / 2} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="4 4" />
          <line x1={svgWidth / 2} y1={padding} x2={svgWidth / 2} y2={svgHeight - padding} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="4 4" />

          {/* Concentric rings around Query position */}
          {queryPoint && (
            <g className="query-radii">
              <circle cx={queryPoint.svgX} cy={queryPoint.svgY} r="32" fill="none" stroke="var(--color-accent)" strokeOpacity="0.18" strokeDasharray="3 3" />
              <circle cx={queryPoint.svgX} cy={queryPoint.svgY} r="64" fill="none" stroke="var(--color-accent)" strokeOpacity="0.12" strokeDasharray="3 3" />
            </g>
          )}

          {/* Chunks */}
          {points.map((pt) => {
            const isSelected = selectedChunkId === pt.id;
            const isHovered = hoveredChunkId === pt.id;
            const isRetrieved = pt.is_retrieved;
            const color = sourceColorMap.get(pt.source_id) || 'var(--color-accent)';
            const radius = isSelected || isHovered ? 9 : isRetrieved ? 6.5 : 5;

            return (
              <g
                key={pt.id}
                className={`retrieval-chunk-node ${isRetrieved ? 'retrieved' : ''} ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}`}
                data-testid={`chunk-dot-${pt.id}`}
                onClick={() => { highlightOrigin.current = 'dot'; setSelectedChunkId(pt.id); }}
                onMouseEnter={() => { highlightOrigin.current = 'dot'; setHoveredChunkId(pt.id); }}
                onMouseLeave={() => setHoveredChunkId(null)}
                onFocus={() => { highlightOrigin.current = 'dot'; setHoveredChunkId(pt.id); }}
                onBlur={() => setHoveredChunkId(null)}
                style={{ cursor: 'pointer' }}
                tabIndex={0}
                role="button"
                aria-label={`${pt.file_name} p.${pt.page_number} chunk ${pt.chunk_index}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    highlightOrigin.current = 'dot';
                    setSelectedChunkId(pt.id);
                  }
                }}
              >
                {isHovered && !isSelected && (
                  <circle cx={pt.svgX} cy={pt.svgY} r={radius + 5} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeOpacity="0.9" />
                )}
                {/* Outer halo for retrieved or selected */}
                {isRetrieved && (
                  <circle
                    cx={pt.svgX}
                    cy={pt.svgY}
                    r={radius + 4}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="2"
                    strokeOpacity="0.75"
                  />
                )}
                {isSelected && (
                  <circle
                    cx={pt.svgX}
                    cy={pt.svgY}
                    r={radius + 6}
                    fill="none"
                    stroke="var(--color-text-primary)"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                )}

                {/* Point */}
                <circle
                  cx={pt.svgX}
                  cy={pt.svgY}
                  r={radius}
                  fill={color}
                  stroke="var(--color-surface)"
                  strokeWidth="1.5"
                />
              </g>
            );
          })}

          {/* Query Point Marker */}
          {queryPoint && (
            <g className="query-node" transform={`translate(${queryPoint.svgX}, ${queryPoint.svgY})`}>
              <polygon
                points="0,-8 7,0 0,8 -7,0"
                fill="var(--color-accent)"
                stroke="var(--color-text-primary)"
                strokeWidth="1.5"
              />
              <text x="10" y="4" fill="var(--color-accent-bright)" fontSize="11" fontWeight="600">
                Query
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Required Note */}
      <p className="retrieval-map-note" data-testid="retrieval-note">
        2D projection is an approximation; ranking uses cosine similarity plus a keyword boost.
      </p>

      {/* Legend */}
      <div className="retrieval-map-legend">
        {queryPoint && (
          <div className="legend-item">
            <span className="legend-mark legend-query" aria-hidden="true" />
            <span>Query</span>
          </div>
        )}
        <div className="legend-item">
          <span className="legend-mark legend-retrieved" aria-hidden="true" />
          <span>Retrieved candidate</span>
        </div>
        {Array.from(sourceColorMap.entries()).map(([sid, col]) => {
          const src = sources.find((s) => s.id === sid);
          const name = src?.title || src?.file_name || 'Document';
          return (
            <div key={sid} className="legend-item" title={name}>
              <span className="legend-mark" style={{ background: col }} aria-hidden="true" />
              <span className="legend-name">{name}</span>
            </div>
          );
        })}
      </div>

      {/* Ranked Retrieved Passages List */}
      {rankedRetrievedChunks.length > 0 && (
        <div className="retrieved-passages-card" data-testid="retrieved-passages-list">
          <div className="retrieved-passages-header">
            <h4>Retrieved passages</h4>
            <span className="retrieved-passages-hint">Ranked by final score &bull; Click to inspect</span>
          </div>
          <div className="retrieved-passages-list" role="list">
            {rankedRetrievedChunks.map((chunk, idx) => {
              const isSelected = selectedChunkId === chunk.id;
              const isLinked = hoveredChunkId === chunk.id;
              const rank = idx + 1;
              const moved = (baselineRanks.get(chunk.id) ?? rank) - rank;
              const docTitle = chunk.title || chunk.file_name;
              const parts = scoreParts(chunk.raw_cosine, chunk.score, alpha);
              const adjusted = adjustScore(chunk.raw_cosine, chunk.score, alpha);
              const rawCosStr = typeof chunk.raw_cosine === 'number' ? chunk.raw_cosine.toFixed(3) : 'N/A';
              const scoreStr = typeof adjusted === 'number' ? adjusted.toFixed(3) : 'N/A';

              return (
                <div
                  key={chunk.id}
                  ref={(el) => { if (el) cardRefs.current.set(chunk.id, el); else cardRefs.current.delete(chunk.id); }}
                  className={`retrieved-passage-row ${isSelected ? 'selected' : ''} ${isLinked ? 'linked' : ''}`}
                  onClick={() => { highlightOrigin.current = 'card'; setSelectedChunkId(chunk.id); }}
                  onMouseEnter={() => { highlightOrigin.current = 'card'; setHoveredChunkId(chunk.id); }}
                  onMouseLeave={() => setHoveredChunkId(null)}
                  onFocus={() => { highlightOrigin.current = 'card'; setHoveredChunkId(chunk.id); }}
                  onBlur={() => setHoveredChunkId(null)}
                  data-testid={`retrieved-passage-row-${chunk.id}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`Rank ${rank}: ${docTitle} page ${chunk.page_number}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      highlightOrigin.current = 'card';
                      setSelectedChunkId(chunk.id);
                    }
                  }}
                >
                  <div className="passage-row-main">
                    <span className={`rank-badge rank-${rank}`}>#{rank}</span>
                    <span
                      className="passage-file-name"
                      title={chunk.file_name || docTitle}
                      data-testid={`passage-file-${chunk.id}`}
                    >
                      {docTitle}
                    </span>
                    {alpha !== ALPHA_DEFAULT && moved !== 0 && (
                      <span
                        className={`rank-move ${moved > 0 ? 'rank-up' : 'rank-down'}`}
                        data-testid={`rank-move-${chunk.id}`}
                        aria-label={`${moved > 0 ? 'Moved up' : 'Moved down'} ${Math.abs(moved)} compared to the default weight`}
                      >
                        {moved > 0 ? '\u25B2' : '\u25BC'} {Math.abs(moved)}
                      </span>
                    )}
                  </div>
                  <div className="passage-row-meta">
                    <span className="passage-page-cell">p. {chunk.page_number}</span>
                    <div className="passage-scores-cell">
                      <span className="passage-cosine-cell" data-testid={`passage-raw-${chunk.id}`}>
                        raw {rawCosStr}
                      </span>
                      <span className="passage-score-cell" data-testid={`passage-score-${chunk.id}`}>
                        score <span className="final-score-val">{scoreStr}</span>
                      </span>
                    </div>
                  </div>
                  {parts && <ScoreBar parts={parts} threshold={data.support_min_score} />}
                  {chunk.matched_terms && chunk.matched_terms.length > 0 && (
                    <div className="passage-row-terms" aria-label="Matched keywords">
                      {chunk.matched_terms.map((t) => (
                        <span key={t} className="term-chip">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Chunk Details Inspector */}
      {activeChunk ? (
        <div className="retrieval-inspector-card" data-testid="retrieval-inspector">
          <div className="inspector-top-row">
            <div className="inspector-title-area">
              <span className="inspector-doc-name" title={activeChunk.file_name}>
                {activeChunk.title || activeChunk.file_name}
              </span>
              <span className="inspector-page-pill">Page {activeChunk.page_number}</span>
              <span className="inspector-chunk-pill">Chunk {activeChunk.chunk_index}</span>
            </div>
            {activeChunk.is_retrieved && (
              <span className="retrieved-tag" title="Passage was provided to the LLM">
                Retrieved
              </span>
            )}
          </div>

          {/* Scores Breakdown: Raw Cosine & Final Boosted Score */}
          <div className="inspector-scores-grid">
            <div className="score-box">
              <span className="score-label">Raw cosine similarity</span>
              <span className="score-value" data-testid="raw-cosine-val">
                {typeof activeChunk.raw_cosine === 'number'
                  ? activeChunk.raw_cosine.toFixed(3)
                  : 'N/A'}
              </span>
            </div>

            <div className="score-box">
              <span className="score-label">Final score (with boost)</span>
              <div className="score-with-tag">
                <span className="score-value" data-testid="final-score-val">
                  {(() => {
                    const v = adjustScore(activeChunk.raw_cosine, activeChunk.score, alpha);
                    return typeof v === 'number' ? v.toFixed(3) : 'N/A';
                  })()}
                </span>
                {(() => {
                  const parts = scoreParts(activeChunk.raw_cosine, activeChunk.score, alpha);
                  return parts && parts.boost > 0.0005 ? (
                    <span className="boost-badge" title="Keyword match boost applied">
                      +{parts.boost.toFixed(2)} boost
                    </span>
                  ) : null;
                })()}
              </div>
            </div>

            {/* Low similarity badge */}
            {typeof activeChunk.raw_cosine === 'number' && activeChunk.raw_cosine < 0.35 && (
              <div className="score-alert-box" role="note">
                <span
                  className="weak-match-badge"
                  data-testid="weak-match-badge"
                  title="Heuristic only; answers are still checked against the passages."
                >
                  Low similarity
                </span>
              </div>
            )}
          </div>

          {/* Matched keywords if any */}
          {activeChunk.matched_terms && activeChunk.matched_terms.length > 0 && (
            <div className="matched-terms-row">
              <span className="matched-terms-label">Matched terms:</span>
              <div className="matched-terms-tags">
                {activeChunk.matched_terms.map((t, idx) => (
                  <span key={idx} className="term-chip">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Chunk Text Preview */}
          <div className="inspector-chunk-text">
            <p>{activeChunk.text}</p>
          </div>

          {onSelectPassage && (
            <div className="inspector-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onSelectPassage(activeChunk.file_name, activeChunk.page_number)}
              >
                Show passage and source &rarr;
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="retrieval-no-retrieved-card" data-testid="no-retrieved-passages-note">
          <p className="retrieval-map-note" style={{ fontStyle: 'normal' }}>
            No passages were retrieved for this answer.
          </p>
        </div>
      )}
    </div>
  );
};
