import React, { useEffect } from 'react';
import { backendHealth, SLOW_AFTER_MS, useBackendHealth } from '../backendHealth';

/**
 * A small engineering status pill. Nothing shows for the first moment (a fast backend needs no
 * explaining); a slow one gets an amber, pulsing "waking up" message with a live second counter; a
 * healthy one gets a quiet green dot.
 */
export const BackendStatus: React.FC<{ className?: string }> = ({ className = '' }) => {
  const health = useBackendHealth();

  useEffect(() => {
    backendHealth.start();
    const onVisible = () => { if (document.visibilityState === 'visible') backendHealth.recheckIfStale(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (health.phase === 'checking' || (health.phase === 'waking' && health.elapsedMs < SLOW_AFTER_MS)) return null;

  if (health.phase === 'waking') {
    const seconds = Math.floor(health.elapsedMs / 1000);
    return (
      <div className={`backend-status backend-status-waking ${className}`} data-testid="backend-status" data-phase="waking"
        title="The free-tier host sleeps when idle. FastAPI and the ONNX runtime take about 30 to 50 seconds to start.">
        <span className="backend-status-dot" aria-hidden="true" />
        {/* Announced once; the counter below changes every second and is hidden from screen readers. */}
        <span className="sr-only" role="status">Waking up the backend. This can take about 30 seconds.</span>
        <span className="backend-status-text" aria-hidden="true">
          <span className="backend-status-long">Waking up ONNX + pgvector node (~30s cold start)&hellip; </span>
          <span className="backend-status-short">Waking up&hellip; </span>
          <span className="backend-status-count">[{seconds}s]</span>
        </span>
      </div>
    );
  }

  return (
    <div className={`backend-status backend-status-online ${className}`} data-testid="backend-status" data-phase="online"
      title={`FastAPI answered /health${health.latencyMs !== null ? ` in ${health.latencyMs} ms` : ''}. The embedding model loads on the first query.`}>
      <span className="backend-status-dot" aria-hidden="true" />
      <span className="backend-status-text">
        <span className="backend-status-long">ONNX + pgvector Online</span>
        <span className="backend-status-short sr-only">Backend online</span>
      </span>
    </div>
  );
};
