import { MessageItem } from './types';

export interface AbstainCopy {
  tone: 'info' | 'error';
  title: string;
  body: string;
  hint?: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Plain-language text for an answer that is not an answer. The stored `content` of such a message is a
 * machine code (for example NOT_FOUND), so it is never shown, except for a failed generation, whose text
 * is a human sentence from the service. Retrieval scores are not part of this text; they live in
 * Retrieval details.
 */
export function abstainCopy(msg: MessageItem, fallbackSelectedCount = 0): AbstainCopy {
  const used = msg.selected_source_ids?.length || fallbackSelectedCount;
  const materials = used > 0 ? `your ${plural(used, 'selected material', 'selected materials')}` : 'your selected materials';

  switch (msg.abstain_reason) {
    case 'generation_failed':
      return {
        tone: 'error',
        title: "Couldn't generate an answer",
        body: msg.content?.trim() || 'The answer service did not respond. Your question is kept; try again.',
      };
    case 'stopped':
      return { tone: 'info', title: 'Stopped', body: 'You stopped this answer before it finished. Retry to ask again.' };
    case 'low_retrieval_score':
      return {
        tone: 'info',
        title: 'Nothing matched closely enough',
        body: `The passages I found in ${materials} were not relevant enough to answer this reliably.`,
        hint: 'Try rephrasing, or check that the right materials are selected.',
      };
    case 'invalid_citation':
      return {
        tone: 'info',
        title: "I couldn't back that answer with your materials",
        body: `The draft answer cited something I could not check against ${materials}, so it is not shown.`,
        hint: 'Try asking again, or ask about one part at a time.',
      };
    case 'bad_output':
      return { tone: 'info', title: "I couldn't read the reply", body: 'The response came back in a format I could not use. Try again.' };
    default:
      return { tone: 'info', title: "I couldn't find this in your materials.", body: '' };
  }
}

const LEGACY_BOILERPLATE = /\s*I checked \d+ passages?.*?answer this\.?|\s*Try rephrasing with terms your materials use, or select more materials\.?/gis;
const MACHINE_CODE = /^[A-Z][A-Z0-9_]*$/;

const withPeriod = (t: string) => (/[.!?…]$/.test(t) ? t : `${t}.`);

/**
 * The text shown for a message that is not a grounded answer: the assistant's own content when it is a
 * human sentence (with the old "I checked N passages..." boilerplate removed from saved messages), otherwise
 * short plain wording for the reason. Sentences are always joined with punctuation.
 */
export function abstainText(msg: MessageItem, fallbackSelectedCount = 0): string {
  const content = (msg.content || '').replace(LEGACY_BOILERPLATE, '').trim();
  if (msg.abstain_reason !== 'stopped' && msg.abstain_reason !== 'generation_failed' && content && !MACHINE_CODE.test(content)) {
    return withPeriod(content);
  }
  const copy = abstainCopy(msg, fallbackSelectedCount);
  return [copy.title, copy.body, copy.hint].filter(Boolean).map((t) => withPeriod(t as string)).join(' ');
}
