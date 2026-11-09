// Tracks whether the backend is awake. The free-tier host sleeps when idle and takes 30 to 50
// seconds to start, so the app pings /health as soon as it mounts and says what is happening
// instead of hanging.
import { useSyncExternalStore } from 'react';
import { api } from './api';
import type { HealthDetail } from './types';

export type HealthPhase = 'checking' | 'waking' | 'online';

export interface HealthState {
  phase: HealthPhase;
  /** Milliseconds since the current check began (frozen once online). */
  elapsedMs: number;
  /** How long the answering probe took, once online. */
  latencyMs: number | null;
  /** Readiness reported by /health; undefined until known or when the backend does not report it. */
  database?: string;
  embedding?: string;
}

/** True when /health says a query would fail or stall right now (an older backend reports nothing, so is never "not ready"). */
export const isFullyReady = (s: Pick<HealthState, 'database' | 'embedding'>): boolean =>
  (s.database === undefined || s.database === 'ready') && (s.embedding === undefined || s.embedding === 'ready');

/** Slower than this and the student is told the backend is starting up. */
export const SLOW_AFTER_MS = 1200;
const RETRY_AFTER_MS = 2000;
const ATTEMPT_TIMEOUT_MS = 12000;
const TICK_MS = 500;
/** A backend that has been quiet this long may have gone back to sleep. */
const RECHECK_AFTER_MS = 10 * 60 * 1000;

/** True/false for liveness only, or the readiness detail (null when not OK). */
type Ping = (signal: AbortSignal) => Promise<boolean | HealthDetail | null>;
/** Re-poll this often while the backend is up but still warming its embedding model. */
const WARMUP_POLL_MS = 2000;

export class HealthMonitor {
  private state: HealthState = { phase: 'checking', elapsedMs: 0, latencyMs: null };
  private listeners = new Set<() => void>();
  private startedAt = 0;
  private lastOkAt = 0;
  private running = false;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private abort: AbortController | null = null;
  private waiters: Array<() => void> = [];

  constructor(private ping: Ping, private now: () => number = () => Date.now()) {}

  getState = (): HealthState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private set(next: Partial<HealthState>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((l) => l());
  }

  /** Begin checking. Safe to call repeatedly; it does nothing while a check is already running. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.startedAt = this.now();
    this.set({ phase: 'checking', elapsedMs: 0, latencyMs: null, database: undefined, embedding: undefined });
    this.ticker = setInterval(() => {
      const elapsedMs = this.now() - this.startedAt;
      this.set({ elapsedMs, phase: elapsedMs >= SLOW_AFTER_MS ? 'waking' : 'checking' });
    }, TICK_MS);
    void this.attempt();
  }

  private async attempt(): Promise<void> {
    if (!this.running) return;
    const controller = new AbortController();
    this.abort = controller;
    const timeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    const began = this.now();
    let ok = false;
    let detail: HealthDetail = {};
    try {
      const result = await this.ping(controller.signal);
      ok = result !== false && result !== null;
      if (result && typeof result === 'object') detail = result;
    } catch {
      ok = false;
    } finally {
      clearTimeout(timeout);
    }
    if (!this.running) return;
    if (ok) {
      const finished = this.now();
      this.running = false;
      this.lastOkAt = finished;
      if (this.ticker) clearInterval(this.ticker);
      this.ticker = null;
      this.set({ phase: 'online', elapsedMs: finished - this.startedAt, latencyMs: finished - began, database: detail.database, embedding: detail.embedding });
      if (!isFullyReady(detail)) this.pollReadiness();
      const waiting = this.waiters;
      this.waiters = [];
      waiting.forEach((w) => w());
    } else {
      this.retry = setTimeout(() => { void this.attempt(); }, RETRY_AFTER_MS);
    }
  }

  /** The backend is up but not ready (model still loading, or the database down): keep asking, quietly. */
  private pollReadiness(): void {
    if (this.retry) clearTimeout(this.retry);
    this.retry = setTimeout(async () => {
      if (this.running || this.state.phase !== 'online') return;
      let detail: HealthDetail | null = null;
      try {
        const result = await this.ping(new AbortController().signal);
        if (result && typeof result === 'object') detail = result;
      } catch { /* keep the last known state */ }
      if (this.running || this.state.phase !== 'online') return;
      if (detail) this.set({ database: detail.database, embedding: detail.embedding });
      if (!isFullyReady(detail ?? this.state)) this.pollReadiness();
    }, WARMUP_POLL_MS);
  }

  /** Resolves as soon as the backend answers; immediately if it already has. */
  whenOnline(): Promise<void> {
    if (this.state.phase === 'online') return Promise.resolve();
    this.start();
    return new Promise((resolve) => { this.waiters.push(resolve); });
  }

  /** Check again if the last good answer is old: the host may have put the backend back to sleep. */
  recheckIfStale(): void {
    if (this.state.phase === 'online' && this.now() - this.lastOkAt > RECHECK_AFTER_MS) this.start();
  }

  stop(): void {
    this.running = false;
    if (this.ticker) clearInterval(this.ticker);
    if (this.retry) clearTimeout(this.retry);
    this.abort?.abort();
    this.ticker = null;
    this.retry = null;
  }
}

export const backendHealth = new HealthMonitor((signal) => api.getHealth(signal));

/** Starts the check on first use and returns its live state. */
export function useBackendHealth(): HealthState {
  const state = useSyncExternalStore(backendHealth.subscribe, backendHealth.getState, backendHealth.getState);
  return state;
}
