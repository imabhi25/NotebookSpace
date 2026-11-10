/** Yield to the browser so pending input and paints run before more work (INP). Falls back to setTimeout. */
export function yieldToMain(): Promise<void> {
  const sched = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof sched?.yield === 'function') return sched.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}
