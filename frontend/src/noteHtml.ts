// Notes are stored as a small, sanitized HTML subset. Older notes are plain text / light markdown and are
// converted on open, so nothing already saved is lost or shown as raw symbols.

const ALLOWED = new Set(['P', 'H1', 'H2', 'H3', 'STRONG', 'EM', 'CODE', 'PRE', 'A', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'BR']);
const RENAME: Record<string, string> = { B: 'STRONG', I: 'EM', DIV: 'P' };
const HTML_HINT = /<(p|h[1-3]|ul|ol|li|blockquote|pre|hr|strong|em|code|a|br|div|b|i)(\s[^>]*)?\/?>/i;

export const looksLikeHtml = (s: string) => HTML_HINT.test(s);

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function plainToHtml(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flushList = () => { if (list.length) { out.push(`<ul>${list.map((l) => `<li>${l}</li>`).join('')}</ul>`); list = []; } };
  const flushPara = () => { if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^[-*•]\s+(.*)$/.exec(line);
    if (!line.trim()) { flushList(); flushPara(); continue; }
    if (h) { flushList(); flushPara(); out.push(`<h${h[1].length}>${escapeHtml(h[2])}</h${h[1].length}>`); continue; }
    if (li) { flushPara(); list.push(escapeHtml(li[1])); continue; }
    flushList();
    para.push(escapeHtml(line));
  }
  flushList(); flushPara();
  return out.join('');
}

function cleanNode(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent ?? '');
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as Element;
  const tag = RENAME[el.tagName] ?? el.tagName;
  if (!ALLOWED.has(tag)) {
    // Unknown wrapper: keep its children, drop the element (and anything scripty entirely).
    if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'].includes(el.tagName)) return null;
    const frag = doc.createDocumentFragment();
    el.childNodes.forEach((c) => { const k = cleanNode(c, doc); if (k) frag.appendChild(k); });
    return frag;
  }
  const out = doc.createElement(tag.toLowerCase());
  if (tag === 'A') {
    const href = el.getAttribute('href') ?? '';
    if (/^(https?:|mailto:)/i.test(href.trim())) {
      out.setAttribute('href', href.trim());
      out.setAttribute('target', '_blank');
      out.setAttribute('rel', 'noopener noreferrer');
    }
  }
  if (tag !== 'HR' && tag !== 'BR') el.childNodes.forEach((c) => { const k = cleanNode(c, doc); if (k) out.appendChild(k); });
  return out;
}

export function sanitizeNoteHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const host = doc.createElement('div');
  doc.body.childNodes.forEach((c) => { const k = cleanNode(c, doc); if (k) host.appendChild(k); });
  return host.innerHTML;
}

/** HTML for the editor: stored HTML is sanitized, legacy plain text is converted. */
export function toEditorHtml(content: string): string {
  if (!content.trim()) return '';
  return looksLikeHtml(content) ? sanitizeNoteHtml(content) : plainToHtml(content);
}

/** Plain text for snippets, search and the command palette. */
export function noteToText(content: string): string {
  if (!looksLikeHtml(content)) return content;
  const doc = new DOMParser().parseFromString(content.replace(/<\/(p|h[1-3]|li|blockquote|pre)>|<br\s*\/?>|<hr\s*\/?>/gi, ' $&'), 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}
