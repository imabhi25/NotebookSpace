// Pure helpers for the command palette: what an entry is, how a query ranks entries, and how a
// keyboard shortcut is written for the current platform.

export type CommandGroup = 'Actions' | 'Sessions' | 'Sources' | 'Notes';

/** Groups are shown in this order. */
export const COMMAND_GROUP_ORDER: CommandGroup[] = ['Actions', 'Sessions', 'Sources', 'Notes'];

export interface CommandItem {
  id: string;
  group: CommandGroup;
  label: string;
  /** Quiet second line, e.g. the source type or a note's first words. */
  hint?: string;
  /** Extra words that should match but are not shown. */
  keywords?: string;
  /** Written as "B" or "\\"; shown with the platform's modifier. */
  shortcut?: string;
  run: () => void;
}

const normalize = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

/**
 * Every word of the query must appear somewhere in the entry. A word at the start of the label ranks
 * highest, a word at the start of any label word next, and any other match last. Entries keep their
 * original order when scores tie, so results do not shuffle as the student types.
 */
export function scoreCommand(item: CommandItem, query: string): number {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const label = normalize(item.label);
  const rest = normalize(`${item.hint ?? ''} ${item.keywords ?? ''}`);
  let total = 0;
  for (const word of words) {
    if (label.startsWith(word)) total += 4;
    else if (new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(label)) total += 3;
    else if (label.includes(word)) total += 2;
    else if (rest.includes(word)) total += 1;
    else return 0;
  }
  return total;
}

/** Items that match, best first within each group, groups in a fixed order. */
export function rankCommands(items: CommandItem[], query: string, limitPerGroup = 8): CommandItem[] {
  const out: CommandItem[] = [];
  for (const group of COMMAND_GROUP_ORDER) {
    const scored = items
      .filter((i) => i.group === group)
      .map((item, order) => ({ item, order, score: scoreCommand(item, query) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || a.order - b.order);
    out.push(...scored.slice(0, limitPerGroup).map((s) => s.item));
  }
  return out;
}

export const isMacLike = (): boolean =>
  typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(`${navigator.platform || ''} ${navigator.userAgent || ''}`);

/** "K" -> "⌘K" on Apple platforms, "Ctrl+K" elsewhere. */
export const shortcutLabel = (key: string): string => (isMacLike() ? `⌘${key}` : `Ctrl+${key}`);

export type WorkspaceShortcut = 'palette' | 'sources' | 'study';

/**
 * Which workspace shortcut a key press is, if any: the platform modifier with K (palette), B (sources
 * panel) or \ (study panel). Anything with Shift or Alt, a repeat, or an IME composition is left alone
 * so browser and system shortcuts keep working.
 */
export function matchShortcut(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'repeat' | 'isComposing'>): WorkspaceShortcut | null {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.repeat || e.isComposing) return null;
  const key = e.key.toLowerCase();
  if (key === 'k') return 'palette';
  if (key === 'b') return 'sources';
  if (key === '\\') return 'study';
  return null;
}
