import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../api';
import { RetrievalMapResponse, RetrievalMapChunk, Source } from '../types';

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
          // Auto-select first retrieved chunk if available
          if (res.retrieved_chunk_ids && res.retrieved_chunk_ids.length > 0) {
            setSelectedChunkId(res.retrieved_chunk_ids[0]);
          } else if (res.chunks.length > 0) {
            setSelectedChunkId(res.chunks[0].id);
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
    return data.chunks.find((c) => c.id === targetId) || data.chunks[0] || null;
  }, [data, hoveredChunkId, selectedChunkId]);

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

  const supportMin = data.support_min_score ?? 0.20;

  return (
    <div className="retrieval-map-root" data-testid="retrieval-map-view">
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
            const isRetrieved = pt.is_retrieved;
            const color = sourceColorMap.get(pt.source_id) || 'var(--color-accent)';
            const radius = isSelected ? 8 : isRetrieved ? 6.5 : 5;

            return (
              <g
                key={pt.id}
                className={`retrieval-chunk-node ${isRetrieved ? 'retrieved' : ''} ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedChunkId(pt.id)}
                onMouseEnter={() => setHoveredChunkId(pt.id)}
                onMouseLeave={() => setHoveredChunkId(null)}
                style={{ cursor: 'pointer' }}
                tabIndex={0}
                role="button"
                aria-label={`${pt.file_name} p.${pt.page_number} chunk ${pt.chunk_index}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setSelectedChunkId(pt.id);
                }}
              >
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

      {/* Selected Chunk Details Inspector */}
      {activeChunk && (
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
                  {typeof activeChunk.score === 'number' ? activeChunk.score.toFixed(3) : 'N/A'}
                </span>
                {typeof activeChunk.score === 'number' &&
                  typeof activeChunk.raw_cosine === 'number' &&
                  activeChunk.score > activeChunk.raw_cosine && (
                    <span className="boost-badge" title="Keyword match boost applied">
                      +0.30 boost
                    </span>
                  )}
              </div>
            </div>

            {/* Weak Match Badge */}
            {typeof activeChunk.score === 'number' && activeChunk.score < supportMin && (
              <div className="score-alert-box" role="note">
                <span className="weak-match-badge" data-testid="weak-match-badge">
                  Weak match (&lt; {supportMin.toFixed(2)})
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
                Open in Passage Inspector &rarr;
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
