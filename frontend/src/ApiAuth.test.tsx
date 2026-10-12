import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SubjectWorkspaceView } from './components/SubjectWorkspaceView';
import { api, setToken, getToken } from './api';
import { Subject, SubjectSettings } from './types';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const subject: Subject = {
  id: 'sub-1',
  name: 'SYNTHETIC subject',
  course_code: null,
  description: null,
  is_archived: false,
  source_count: 0,
  settings: { response_length: 'default', response_style: 'general' },
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
};

const renderWorkspace = (
  onUpdateSettings: (settings: SubjectSettings) => Promise<void>,
  subjectOverride: Subject = subject
) =>
  render(
    <SubjectWorkspaceView
      subject={subjectOverride}
      sources={[]}
      selectedSourceIds={[]}
      conversations={[]}
      notes={[]}
      activeConversationId={null}
      starterQuestions={[]}
      isDemoMode={false}
      onBackToDashboard={() => {}}
      onSelectSources={() => {}}
      onSelectConversation={() => {}}
      onCreateConversation={async () => {}}
      onRenameConversation={async () => {}}
      onDeleteConversation={async () => {}}
      onUploadFiles={async () => {}}
      onPasteText={async () => {}}
      onAddUrl={async () => {}}
      onRenameSource={async () => {}}
      onDeleteSource={async () => {}}
      onRetrySource={async () => {}}
      onReplaceSource={async () => {}}
      onSendMessage={async () => {}}
      onUpdateSettings={onUpdateSettings}
      onCreateNote={async () => {}}
      onSaveAnswerAsNote={async () => {}}
      onUpdateNote={async () => {}}
      onDeleteNote={async () => {}}
      messages={[]}
      chatLoading={false}
    />
  );

describe('Notebook settings save', () => {
  it('shows a message when the save fails', async () => {
    const onUpdateSettings = vi
      .fn()
      .mockRejectedValue(new Error('Invalid settings: response_length must be one of concise, default, detailed.'));
    renderWorkspace(onUpdateSettings);

    fireEvent.click(screen.getAllByRole('button', { name: /Notebook settings/i })[0]);
    fireEvent.change(screen.getByLabelText('Response Length'), { target: { value: 'detailed' } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Settings were not saved.');
    expect(alert).toHaveTextContent('response_length must be one of concise, default, detailed');
  });

  it('clears the message after a later save succeeds', async () => {
    const onUpdateSettings = vi.fn().mockRejectedValueOnce(new Error('Request failed (500)')).mockResolvedValue(undefined);
    renderWorkspace(onUpdateSettings);

    fireEvent.click(screen.getAllByRole('button', { name: /Notebook settings/i })[0]);
    fireEvent.change(screen.getByLabelText('Response Length'), { target: { value: 'detailed' } });
    await screen.findByRole('alert');

    fireEvent.change(screen.getByLabelText('Response Style'), { target: { value: 'learning-guide' } });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('sends only the two known settings, with valid values', async () => {
    const onUpdateSettings = vi.fn().mockResolvedValue(undefined);
    const stale = {
      ...subject,
      settings: { response_length: 'gigantic', response_style: 'general', system_prompt: 'x' } as unknown as SubjectSettings,
    };
    renderWorkspace(onUpdateSettings, stale);

    fireEvent.click(screen.getAllByRole('button', { name: /Notebook settings/i })[0]);
    fireEvent.change(screen.getByLabelText('Response Style'), { target: { value: 'learning-guide' } });

    await waitFor(() => expect(onUpdateSettings).toHaveBeenCalledTimes(1));
    expect(onUpdateSettings).toHaveBeenCalledWith({ response_length: 'default', response_style: 'learning-guide' });
  });
});

describe('API client and the 404-for-no-access rule', () => {
  beforeEach(() => {
    setToken('stale-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setToken(null);
  });

  it('starts a new guest session when a 404 was caused by an expired session', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const url = String(input);
      const auth = init?.headers?.Authorization || '';
      calls.push(`${init?.method || 'GET'} ${url.replace(/^https?:\/\/[^/]+/, '')} ${auth}`);
      if (url.endsWith('/auth/me')) return jsonResponse(401, { detail: 'Invalid or expired session token.' });
      if (url.endsWith('/auth/guest-session')) return jsonResponse(200, { token: 'fresh-token', user: { id: 'u1' } });
      if (url.includes('/subjects')) {
        return auth === 'Bearer fresh-token' ? jsonResponse(200, []) : jsonResponse(404, { detail: 'Not found.' });
      }
      return jsonResponse(500, {});
    });

    const subjects = await api.getSubjects();

    expect(subjects).toEqual([]);
    expect(getToken()).toBe('fresh-token');
    expect(calls.filter((c) => c.includes('/auth/guest-session'))).toHaveLength(1);
  });

  it('keeps the session when a 404 really means not found', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/auth/me')) return jsonResponse(200, { id: 'u1' });
      return jsonResponse(404, { detail: 'Subject not found.' });
    });

    await expect(api.getSubject('missing')).rejects.toThrow('Subject not found.');
    expect(getToken()).toBe('stale-token');
    expect(calls.some((u) => u.endsWith('/auth/guest-session'))).toBe(false);
  });

  it('sends the session with passage requests and treats a refusal as empty', async () => {
    const seen: Record<string, string> = {};
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      seen[String(input)] = init?.headers?.Authorization || '';
      return jsonResponse(404, { detail: 'Not found.' });
    });

    const passages = await api.getPassages('SYNTHETIC note', 1);

    expect(passages).toEqual([]);
    const url = Object.keys(seen).find((u) => u.includes('/passages?file=SYNTHETIC%20note&page=1'));
    expect(url).toBeDefined();
    expect(seen[url as string]).toBe('Bearer stale-token');
  });
});
