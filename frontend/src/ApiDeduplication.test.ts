import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, setToken, clearInFlightRequests } from './api';
import { Subject, User } from './types';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('In-flight request deduplication', () => {
  beforeEach(() => {
    setToken('test-token');
    clearInFlightRequests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setToken(null);
    clearInFlightRequests();
  });

  it('deduplicates concurrent GET /subjects requests into a single network call', async () => {
    const mockSubjects: Subject[] = [
      {
        id: 'sub-1',
        name: 'Math 101',
        course_code: 'MATH101',
        description: null,
        is_archived: false,
        source_count: 1,
        settings: { response_length: 'default', response_style: 'general' },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];

    let fetchCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes('/subjects')) {
        fetchCount++;
        // Simulate network latency so concurrent calls overlap
        await new Promise((resolve) => setTimeout(resolve, 50));
        return jsonResponse(200, mockSubjects);
      }
      return jsonResponse(404, {});
    });

    // Fire 3 concurrent requests (simulating initial page load)
    const [res1, res2, res3] = await Promise.all([
      api.getSubjects(true),
      api.getSubjects(true),
      api.getSubjects(true),
    ]);

    expect(fetchCount).toBe(1);
    expect(res1).toEqual(mockSubjects);
    expect(res2).toEqual(mockSubjects);
    expect(res3).toEqual(mockSubjects);
  });

  it('deduplicates concurrent GET /auth/me calls into a single network call', async () => {
    const mockUser: User = { id: 'user-1', email: 'test@example.com' };

    let fetchCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        fetchCount++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return jsonResponse(200, mockUser);
      }
      return jsonResponse(404, {});
    });

    const [u1, u2] = await Promise.all([api.getMe(), api.getMe()]);

    expect(fetchCount).toBe(1);
    expect(u1).toEqual(mockUser);
    expect(u2).toEqual(mockUser);
  });

  it('ensures subsequent non-concurrent calls trigger fresh network requests', async () => {
    const mockSubjects: Subject[] = [
      {
        id: 'sub-1',
        name: 'Math 101',
        course_code: null,
        description: null,
        is_archived: false,
        source_count: 0,
        settings: { response_length: 'default', response_style: 'general' },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];

    let fetchCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes('/subjects')) {
        fetchCount++;
        return jsonResponse(200, mockSubjects);
      }
      return jsonResponse(404, {});
    });

    // First call
    const first = await api.getSubjects(true);
    expect(fetchCount).toBe(1);
    expect(first).toEqual(mockSubjects);

    // Subsequent call after first completed
    const second = await api.getSubjects(true);
    expect(fetchCount).toBe(2);
    expect(second).toEqual(mockSubjects);
  });

  it('clears failed in-flight request so subsequent calls can retry', async () => {
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes('/subjects')) {
        callCount++;
        if (callCount === 1) {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return jsonResponse(500, { detail: 'Database error' });
        }
        return jsonResponse(200, []);
      }
      return jsonResponse(404, {});
    });

    // Concurrent failing calls
    await expect(Promise.all([api.getSubjects(), api.getSubjects()])).rejects.toThrow('Database error');
    expect(callCount).toBe(1);

    // Subsequent call after failure should retry cleanly
    const retry = await api.getSubjects();
    expect(callCount).toBe(2);
    expect(retry).toEqual([]);
  });

  it('invalidates in-flight requests when a mutation or auth change occurs', async () => {
    let fetchCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes('/subjects')) {
        fetchCount++;
        if (init?.method === 'DELETE') {
          return jsonResponse(200, { ok: true });
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
        return jsonResponse(200, []);
      }
      return jsonResponse(404, {});
    });

    // Start a GET request
    const p1 = api.getSubjects(true);

    // Mutation occurs while GET was in flight
    await api.deleteSubject('sub-1');

    // A new GET request started after mutation should not latch onto the pre-mutation promise
    const p2 = api.getSubjects(true);

    await Promise.all([p1, p2]);
    // fetch was called for p1 (GET), deleteSubject (DELETE), and p2 (GET)
    expect(fetchCount).toBe(3);
  });
});
