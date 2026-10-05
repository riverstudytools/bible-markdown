import {
  Attrs, Block, Book, ChapterBlock, Char, Diagnostic, Doc, Inline, Node, Note, Sidebar,
  decodeAttr, emptyDoc, encodeAttr, mergeText, plainText, text, trimInline,
} from './model.js';
import { BLOCK_MS, isQuoteMs, isBlockMarker, isImplicitChar, isKnownChar, isNote, normalizeMarker } from './markers.js';

type Tok =
  | { k: 'text'; s: string }
  | { k: 'm'; name: string; close: boolean }
  | { k: 'ms'; name: string; attrs: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const msRe = /\\([A-Za-z][A-Za-z0-9]*(?:-[se])?)(?:[ \t]*\|([^\\]*))?[ \t]*\\\*/y;
  const mRe = /\\\+?([A-Za-z][A-Za-z0-9-]*)(\*?)/y;
  let i = 0;
  for (;;) {
    const p = src.indexOf('\\', i);
    if (p < 0) break;
    if (p > i) out.push({ k: 'text', s: src.slice(i, p) });
    msRe.lastIndex = p;
    const ms = msRe.exec(src);
    if (ms) { out.push({ k: 'ms', name: ms[1], attrs: ms[2] ?? '' }); i = p + ms[0].length; continue; }
    mRe.lastIndex = p;
    const m = mRe.exec(src);
    if (m) {
      const close = m[2] === '*';
      out.push({ k: 'm', name: m[1], close });
      i = p + m[0].length;
      if (!close && /[ \t\r\n]/.test(src[i] ?? '')) i++;
      continue;
    }
    out.push({ k: 'text', s: '\\' });
    i = p + 1;
  }
  if (i < src.length) out.push({ k: 'text', s: src.slice(i) });
  return out;
}

const DEFAULT_ATTR: Record<string, string> = { w: 'lemma', wg: 'strong', wh: 'strong', wa: 'strong', rb: 'gloss', jmp: 'link-href' };

export function parseAttrs(s: string, marker: string): Attrs | undefined {
  const attrs: Attrs = {};
  const re = /([A-Za-z][\w:-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  let any = false;
  while ((m = re.exec(s))) { attrs[m[1]] = decodeAttr(m[2]); any = true; }
  if (!any) {
    const t = s.trim();
    if (!t) return undefined;
    attrs[DEFAULT_ATTR[marker] ?? 'default'] = t;
  }
  return attrs;
}

export function formatAttrs(a: Attrs | undefined): string {
  if (!a) return '';
  return Object.entries(a).map(([k, v]) => (k === 'default' ? v : `${k}="${encodeAttr(v)}"`)).join(' ');
}

interface Frame { node: Char | Note; implicit: boolean }

export function parseUsfm(srcIn: string): Doc {
  const doc = emptyDoc();
  const diag = (severity: Diagnostic['severity'], message: string, code?: string) => doc.diagnostics.push({ severity, message, code });
  const toks = tokenize(srcIn.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'));

  let book: Book | null = null;
  let sidebar: Sidebar | null = null;
  let cur: Block | ChapterBlock | null = null;
  let stack: Frame[] = [];
  let pendingId = false;
  let pendingVerse = false;
  let pendingChapter: ChapterBlock | null = null;
  let pendingCaller: Note | null = null;
  const openBible = new Set<string>();

  const ensureBook = (): Book => (book ??= (doc.books.push({ id: '', idText: '', blocks: [] }), doc.books[doc.books.length - 1]));
  const list = (): Node[] | Block[] => (sidebar ? sidebar.blocks : ensureBook().blocks);
  const addBlock = (b: Block | ChapterBlock) => { (list() as Node[]).push(b); cur = b; };
  const target = (): Inline[] => {
    if (stack.length) return stack[stack.length - 1].node.children;
    if (!cur) addBlock({ type: 'block', marker: 'p', children: [] });
    return cur!.children;
  };

  const extractAttrs = (c: Char) => {
    const last = c.children[c.children.length - 1];
    if (last && last.type === 'text') {
      const bar = last.text.lastIndexOf('|');
      if (bar >= 0) {
        const a = parseAttrs(last.text.slice(bar + 1), c.marker);
        last.text = last.text.slice(0, bar);
        if (a) c.attrs = a;
      }
    }
  };
  const popFrame = () => {
    const f = stack.pop()!;
    if (f.implicit || f.node.type === 'note') f.node.children = trimInline(f.node.children);
    if (f.node.type === 'char') extractAttrs(f.node);
  };
  const finishBlock = () => {
    while (stack.length) {
      const f = stack[stack.length - 1];
      if (!f.implicit) diag('warning', `Unclosed \\${f.node.marker} was closed at the end of its paragraph`, 'unclosed');
      popFrame();
    }
    if (cur) cur.children = trimInline(cur.children);
    cur = null; pendingVerse = false; pendingCaller = null;
  };
  const firstWord = (s: string): [string, string] => {
    const m = s.match(/^[ \t\r\n]*([^ \t\r\n]+)[ \t\r\n]*([\s\S]*)$/);
    return m ? [m[1], m[2]] : ['', s];
  };

  const handleText = (raw: string) => {
    let s = raw;
    if (pendingId) {
      pendingId = false;
      const [code, rest] = firstWord(s);
      const b = ensureBook();
      b.id = code; b.idText = rest.replace(/\s+/g, ' ').trim();
      return;
    }
    if (pendingChapter) {
      const [n, rest] = firstWord(s);
      pendingChapter.number = n; pendingChapter = null; s = rest;
      if (!s.trim()) return;
    }
    if (pendingCaller) {
      const [c, rest] = firstWord(s);
      pendingCaller.caller = c; pendingCaller = null; s = rest;
      if (!s) return;
    }
    if (pendingVerse) {
      const [n, rest] = firstWord(s);
      pendingVerse = false;
      target().push({ type: 'verse', number: n });
      s = rest;
      if (!s) return;
    }
    const norm = s.replace(/[ \t\r\n\f]+/g, ' ').replace(/~/g, '\u00A0');
    if (norm === ' ' && !cur && !stack.length) return;   // whitespace between blocks
    const t = target();
    if (norm === ' ' && t.length === 0) return;
    const parts = norm.split(' // ');
    parts.forEach((part, k) => {
      if (k > 0) { t.push({ type: 'br' }); part = part.replace(/^ /, ''); }
      if (k < parts.length - 1) part = part.replace(/ $/, '');
      if (part) t.push(text(part));
    });
  };

  for (const tok of toks) {
    if (tok.k === 'text') { handleText(tok.s); continue; }
    if (tok.k === 'ms') {
      if (!stack.some((f) => !f.implicit) && isQuoteMs(tok.name)) {
        const a = parseAttrs(tok.attrs, tok.name);
        const start = tok.name === 'qt-s' && a?.['x-quote'] === 'bible';
        const end = tok.name === 'qt-e' && !!a?.eid && openBible.has(a.eid);
        if (start || end) {
          finishBlock();
          if (start && a?.sid) openBible.add(a.sid);
          if (end && a?.eid) openBible.delete(a.eid);
          (list() as Node[]).push({ type: 'block', marker: tok.name, children: [], ...(a ? { attrs: a } : {}) });
          continue;
        }
      }
      if (BLOCK_MS.has(tok.name)) {
        finishBlock();
        const b: Block = { type: 'block', marker: tok.name, children: [] };
        const a = parseAttrs(tok.attrs, tok.name);
        if (a) b.attrs = a;
        (list() as Node[]).push(b);
        continue;
      }
      target().push({ type: 'ms', marker: tok.name, attrs: parseAttrs(tok.attrs, tok.name) });
      continue;
    }
    const name = tok.name;
    if (tok.close) {
      if (isNote(name)) {
        let found = false;
        for (let i = stack.length - 1; i >= 0; i--) if (stack[i].node.type === 'note' && stack[i].node.marker === name) { found = true; break; }
        if (!found) { diag('warning', `Stray closing marker \\${name}*`, 'stray-close'); continue; }
        while (stack.length) { const f = stack[stack.length - 1]; popFrame(); if (f.node.type === 'note' && f.node.marker === name) break; }
      } else {
        let idx = -1;
        for (let i = stack.length - 1; i >= 0; i--) if (stack[i].node.type === 'char' && stack[i].node.marker === name) { idx = i; break; }
        if (idx < 0) { diag('warning', `Stray closing marker \\${name}*`, 'stray-close'); continue; }
        while (stack.length > idx + 1) popFrame();
        popFrame();
      }
      continue;
    }
    if (name === 'id') {
      finishBlock(); sidebar = null;
      book = { id: '', idText: '', blocks: [] };
      doc.books.push(book);
      pendingId = true;
      continue;
    }
    if (name === 'c') {
      finishBlock();
      const ch: ChapterBlock = { type: 'chapter', number: '', children: [] };
      addBlock(ch); pendingChapter = ch;
      continue;
    }
    if (name === 'v') { target(); pendingVerse = true; continue; }
    if (name === 'esb') { finishBlock(); sidebar = { type: 'sidebar', blocks: [] }; ensureBook().blocks.push(sidebar); continue; }
    if (name === 'esbe') { finishBlock(); sidebar = null; continue; }
    if (isBlockMarker(name)) {
      finishBlock();
      addBlock({ type: 'block', marker: normalizeMarker(name), children: [] });
      continue;
    }
    if (isNote(name)) {
      const note: Note = { type: 'note', marker: name, caller: '', children: [] };
      target().push(note);
      stack.push({ node: note, implicit: false });
      pendingCaller = note;
      continue;
    }
    if (isImplicitChar(name)) {
      while (stack.length && stack[stack.length - 1].implicit) popFrame();
      const ch: Char = { type: 'char', marker: name, children: [] };
      target().push(ch);
      stack.push({ node: ch, implicit: true });
      continue;
    }
    if (!isKnownChar(name)) diag('warning', `Unknown marker \\${name} (a literal backslash in text? write it as \\\\ in Bible Markdown)`, 'unknown-marker');
    const ch: Char = { type: 'char', marker: name, children: [] };
    target().push(ch);
    stack.push({ node: ch, implicit: false });
  }
  finishBlock();

  // Metadata stored as `\rem meta Key: Value`
  const first = doc.books[0];
  if (first) {
    first.blocks = first.blocks.filter((n) => {
      if (n.type === 'block' && n.marker === 'rem') {
        const t = plainText(n.children);
        const m = t.match(/^meta\s+([^:]+):\s*(.*)$/);
        if (m) { doc.meta.push([m[1].trim(), m[2].trim()]); return false; }
      }
      return true;
    });
  }
  return doc;
}

/* ------------------------------------------------------------------ */

function inline(nodes: Inline[], nested: boolean): string {
  let s = '';
  for (const n of nodes) {
    switch (n.type) {
      case 'text': s += n.text.replace(/\u00A0/g, '~'); break;
      case 'verse': s += `\n\\v ${n.number} `; break;
      case 'br': s += ' // '; break;
      case 'ms': {
        const a = formatAttrs(n.attrs);
        s += `\\${n.marker}${a ? ' |' + a : ''}\\*`;
        break;
      }
      case 'char': {
        if (isImplicitChar(n.marker)) { s += `\\${n.marker} ${inline(n.children, true).trim()} `; break; }
        const p = nested ? '+' : '';
        const a = formatAttrs(n.attrs);
        s += `\\${p}${n.marker} ${inline(n.children, true)}${a ? '|' + a : ''}\\${p}${n.marker}*`;
        break;
      }
      case 'note': {
        const parts = n.children.map((c) => {
          if (c.type === 'char' && isImplicitChar(c.marker)) return `\\${c.marker} ${inline(c.children, true).trim()}`;
          return inline([c], true);
        });
        s += `\\${n.marker} ${n.caller || '+'} ${parts.join(' ')}\\${n.marker}*`;
        break;
      }
      default: break;
    }
  }
  return s;
}

function blockLine(marker: string, children: Inline[], extra = ''): string {
  const body = inline(children, false);
  const head = `\\${marker}${extra}`;
  if (!body.trim()) return head;
  return body.startsWith('\n') ? head + body : `${head} ${body}`;
}

function nodeLines(n: Node): string {
  if (n.type === 'block' && (BLOCK_MS.has(n.marker) || isQuoteMs(n.marker))) {
    const a = formatAttrs(n.attrs);
    return `\\${n.marker}${a ? ' |' + a : ''}\\*`;
  }
  if (n.type === 'chapter') return blockLine('c', n.children, ` ${n.number}`);
  if (n.type === 'sidebar') return ['\\esb', ...n.blocks.map(nodeLines), '\\esbe'].join('\n');
  return blockLine(n.marker, n.children);
}

export function serializeUsfm(doc: Doc): string {
  const out: string[] = [];
  doc.books.forEach((b, i) => {
    const idText = b.idText || (i === 0 ? doc.meta.find(([k]) => k === 'Version')?.[1] ?? '' : '');
    out.push(`\\id ${b.id}${idText ? ' ' + idText : ''}`);
    if (i === 0) for (const [k, v] of doc.meta) if (!(k === 'Version' && v === idText)) out.push(`\\rem meta ${k}: ${v}`);
    for (const n of b.blocks) out.push(nodeLines(n));
  });
  return out.join('\n').replace(/[ \t]+\n/g, '\n').replace(/[ \t]+$/g, '') + '\n';
}

export { mergeText };

/** Serialize inline nodes as USFM (used by the Bible Markdown writer for raw spans). */
export const usfmInline = (nodes: Inline[]): string => inline(nodes, false).replace(/^\n/, '');
