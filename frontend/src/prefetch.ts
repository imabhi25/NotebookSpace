import { api } from './api';
import type { Conversation, MessageItem, Note, Source, Subject } from './types';

export interface NotebookSnapshot {
  subject: Subject;
  sources: Source[];
  conversations: Conversation[];
  notes: Note[];
  starterQuestions: string[];
  /** Messages of the first conversation (the one the workspace opens on), if any. */
  firstMessages: MessageItem[] | null;
}

const DEBOUNCE_MS = 60;
const TTL_MS = 20_000;

interface Entry { at: number; promise: Promise<NotebookSnapshot | null>; }
const cache = new Map<string, Entry>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

async function fetchSnapshot(id: string): Promise<NotebookSnapshot | null> {
  try {
    const [subject, sources, conversations, notes, starterQuestions] = await Promise.all([
      api.getSubject(id), api.getSources(id), api.getConversations(id), api.getNotes(id), api.getStarterQuestions(id),
    ]);
    const firstMessages = conversations.length > 0 ? await api.getMessages(id, conversations[0].id) : null;
    return { subject, sources, conversations, notes, starterQuestions, firstMessages };
  } catch {
    return null; // a failed warm-up must never surface; the real open will refetch and handle errors
  }
}

/** Start warming a notebook now (deduplicated; fresh entries and in-flight requests are reused). */
export function prefetchNotebook(id: string): void {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return;
  const promise = fetchSnapshot(id);
  const entry: Entry = { at: Date.now(), promise };
  cache.set(id, entry);
  void promise.then((snap) => { if (!snap && cache.get(id) === entry) cache.delete(id); });
}

/** Debounced hover/focus entry point. */
export function schedulePrefetch(id: string): void {
  if (timers.has(id)) return;
  timers.set(id, setTimeout(() => { timers.delete(id); prefetchNotebook(id); }, DEBOUNCE_MS));
}

export function cancelPrefetch(id: string): void {
  const t = timers.get(id);
  if (t) { clearTimeout(t); timers.delete(id); }
}

/**
 * One-shot: returns the warmed (or still in-flight) snapshot and evicts it so a later open
 * never shows stale data. Null when nothing fresh was prefetched.
 */
export function takePrefetched(id: string): Promise<NotebookSnapshot | null> | null {
  cancelPrefetch(id);
  const hit = cache.get(id);
  cache.delete(id);
  if (!hit || Date.now() - hit.at >= TTL_MS) return null;
  return hit.promise;
}

export function clearPrefetchCache(): void {
  cache.clear();
  timers.forEach(clearTimeout);
  timers.clear();
}
