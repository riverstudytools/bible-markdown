/** Shared document model. Every format parses into this and serializes out of it. */

export type Format = 'usfm' | 'biblemd' | 'biblehtml';

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** 1-based source line, when known */
  line?: number;
  code?: string;
}

export type Attrs = Record<string, string>;

export interface Text { type: 'text'; text: string }
export interface Verse { type: 'verse'; number: string }
export interface Char { type: 'char'; marker: string; attrs?: Attrs; children: Inline[] }
export interface Note { type: 'note'; marker: string; caller: string; children: Inline[] }
export interface Milestone { type: 'ms'; marker: string; attrs?: Attrs }
export interface Break { type: 'br' }
/** Internal: a footnote anchor waiting for its definition (Bible Markdown only). */
export interface PendingNote {
  type: 'pending-note'; key: string; flat: string; chapter: string; verse: string; seq: number; line: number;
}
/** Internal: a chapter marker found inline by the Bible Markdown parser. */
export interface InlineChapter { type: 'chapter-mark'; number: string }

export type Inline = Text | Verse | Char | Note | Milestone | Break | PendingNote | InlineChapter;

export interface Block { type: 'block'; marker: string; children: Inline[]; line?: number; attrs?: Attrs }
export interface ChapterBlock { type: 'chapter'; number: string; children: Inline[]; line?: number }
export interface Sidebar { type: 'sidebar'; blocks: Block[]; line?: number }
export type Node = Block | ChapterBlock | Sidebar;

export interface Book {
  id: string;
  idText: string;
  blocks: Node[];
}

export interface Doc {
  meta: [string, string][];
  books: Book[];
  diagnostics: Diagnostic[];
}

export function emptyDoc(): Doc { return { meta: [], books: [], diagnostics: [] }; }

export function text(t: string): Text { return { type: 'text', text: t }; }

/** Plain text of inline nodes (verse numbers and notes excluded). */
export function plainText(nodes: Inline[]): string {
  let s = '';
  for (const n of nodes) {
    if (n.type === 'text') s += n.text;
    else if (n.type === 'char') s += plainText(n.children);
  }
  return s;
}

export function mergeText(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    if (n.type === 'text' && last && last.type === 'text') { last.text += n.text; continue; }
    if (n.type === 'text' && n.text === '') continue;
    out.push(n);
  }
  return out;
}

/** Trim whitespace at the outer edges of an inline run. */
export function trimInline(nodes: Inline[]): Inline[] {
  const out = mergeText(nodes);
  const first = out[0];
  if (first && first.type === 'text') first.text = first.text.replace(/^[ \t\r\n\f]+/, '');   // not \s: a no-break space is content
  const last = out[out.length - 1];
  if (last && last.type === 'text') last.text = last.text.replace(/[ \t\r\n\f]+$/, '');
  return mergeText(out);
}

/** Attribute values are stored encoded in USFM so quotes, backslashes and ampersands survive. */
export const encodeAttr = (v: string): string => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\\/g, '&#92;');
export const decodeAttr = (v: string): string => v.replace(/&#92;/g, '\\').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
