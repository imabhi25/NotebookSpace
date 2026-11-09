import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

describe('getSourceDetail', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  // The client may call the guest-session endpoint first; look only at the source request.
  const sourceUrls = (f: ReturnType<typeof stub>) =>
    f.mock.calls.map(c => String(c[0])).filter(u => u.includes('/sources/'));
  it('keeps the default request unchanged', async () => {
    const f = stub();
    await api.getSourceDetail('s1', 'x1');
    expect(sourceUrls(f)[0]).toMatch(/\/subjects\/s1\/sources\/x1$/);
  });
  it('asks to leave passages out only when told to', async () => {
    const f = stub();
    await api.getSourceDetail('s1', 'x1', { includePassages: false });
    expect(sourceUrls(f)[0]).toMatch(/\/subjects\/s1\/sources\/x1\?include_passages=false$/);
    await api.getSourceDetail('s1', 'x1', { includePassages: true });
    expect(sourceUrls(f)[1]).toMatch(/sources\/x1$/);
  });
});
