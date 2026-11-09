import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { HealthMonitor, SLOW_AFTER_MS } from './backendHealth';
import { BackendStatus } from './components/BackendStatus';
import { backendHealth } from './backendHealth';

describe('HealthMonitor', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const monitor = (ping: (s: AbortSignal) => Promise<boolean>) => new HealthMonitor(ping, () => Date.now());

  it('goes straight to online, without ever saying "waking", when the backend answers quickly', async () => {
    const m = monitor(async () => true);
    const phases: string[] = [];
    m.subscribe(() => phases.push(m.getState().phase));
    m.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(m.getState().phase).toBe('online');
    expect(phases).not.toContain('waking');
    expect(m.getState().latencyMs).not.toBeNull();
  });

  it('reports "waking" with a counting elapsed time once the backend is slower than 1.2 seconds', async () => {
    let release: (v: boolean) => void = () => {};
    const m = monitor(() => new Promise<boolean>((resolve) => { release = resolve; }));
    m.start();
    await vi.advanceTimersByTimeAsync(SLOW_AFTER_MS - 200);
    expect(m.getState().phase).toBe('checking');
    await vi.advanceTimersByTimeAsync(1000);
    expect(m.getState().phase).toBe('waking');
    await vi.advanceTimersByTimeAsync(13000);
    expect(Math.floor(m.getState().elapsedMs / 1000)).toBeGreaterThanOrEqual(14);
    release(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(m.getState().phase).toBe('online');
  });

  it('retries failures and aborted attempts until the backend answers', async () => {
    let calls = 0;
    const m = monitor(async () => { calls++; if (calls < 3) throw new Error('502'); return true; });
    m.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toBe(3);
    expect(m.getState().phase).toBe('online');
  });

  it('whenOnline resolves at once if already online, and after the first success otherwise', async () => {
    let ok = false;
    const m = monitor(async () => ok);
    let resolved = false;
    void m.whenOnline().then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(2500);
    expect(resolved).toBe(false);
    ok = true;
    await vi.advanceTimersByTimeAsync(2500);
    expect(resolved).toBe(true);
    await expect(m.whenOnline()).resolves.toBeUndefined();
  });

  it('checks again only when the last good answer is old', async () => {
    const ping = vi.fn(async () => true);
    const m = monitor(ping);
    m.start();
    await vi.advanceTimersByTimeAsync(10);
    m.recheckIfStale();
    await vi.advanceTimersByTimeAsync(10);
    expect(ping).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
    m.recheckIfStale();
    await vi.advanceTimersByTimeAsync(10);
    expect(ping).toHaveBeenCalledTimes(2);
  });
});

describe('BackendStatus pill', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); backendHealth.stop(); });

  it('shows nothing at first, an amber counter when slow, then a green "Online"', async () => {
    let release: (ok: boolean) => void = () => {};
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>((resolve) => {
      release = (ok) => resolve(new Response('{}', { status: ok ? 200 : 503 }));
    }));
    // A fresh run of the shared monitor.
    (backendHealth as unknown as { state: unknown }).state = { phase: 'checking', elapsedMs: 0, latencyMs: null };
    render(<BackendStatus />);
    expect(screen.queryByTestId('backend-status')).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(3200); });
    const waking = screen.getByTestId('backend-status');
    expect(waking).toHaveAttribute('data-phase', 'waking');
    expect(waking).toHaveTextContent('Waking up ONNX + pgvector node (~30s cold start)');
    expect(waking).toHaveTextContent(/\[3s\]/);
    expect(screen.getByRole('status')).toHaveTextContent(/Waking up the backend/);

    await act(async () => { release(true); await vi.advanceTimersByTimeAsync(20); });
    const online = screen.getByTestId('backend-status');
    expect(online).toHaveAttribute('data-phase', 'online');
    expect(online).toHaveTextContent('ONNX + pgvector Online');
  });
});
