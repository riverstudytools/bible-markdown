import {
  Block, Book, Char, Diagnostic, Doc, Inline, Node, Note, PendingNote, Sidebar,
  emptyDoc, plainText, text, trimInline,
} from './model.js';
import { BOOK_CODES, INTRO_PARA, isBlockMarker, isContainer, isImplicitChar, isNote, normalizeMarker } from './markers.js';
import { decodeEntities, protect, smart, stripTrailingPunct, unprotect } from './typography.js';
import { MdEnv, mdBlocks, mdNoteBody } from './markdown.js';
import { parseUsfm } from './usfm.js';

export interface BibleMdOptions {
  /** Convert `---`, `--` and straight quotes (default true). */
  typography?: boolean;
}

type SpanKind = 'add' | 'em' | 'bd' | 'em_' | 'raw' | 'fn' | 'html';
interface Span { kind: SpanKind; node: Char; start: number; tag?: string }

interface Def { key: string; nodes: Inline[]; seq: number; line: number; used: boolean }

interface Ctx {
  typography: boolean;
  chapter: string;
  verse: string;
  seq: number;
  diag: (severity: Diagnostic['severity'], message: string, line: number, code?: string) => void;
  pending: PendingNote[];
}

interface InlineOpts {
  mode: 'scripture' | 'md';
  verses: boolean;
  chapters: boolean;
  reopen?: SpanKind[];
  line: number;
}
interface InlineResult { nodes: Inline[]; open: SpanKind[] }

const VERSE_RE = /^(\d+[a-z]?(?:-\d+[a-z]?)?)(?=\s|$)/;
const CHAPTER_RE = /^(\d+):(\d+[a-z]?(?:-\d+[a-z]?)?)?(?=\s|$)/;
const MS_RE = /^\\([A-Za-z][A-Za-z0-9]*(?:-[se])?)(?:[ \t]*\|([^\\]*))?[ \t]*\\\*/;
const RAW_RE = /^\\\+?([a-z][a-z0-9-]*)(\*?)/;
const TAG_RE = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[a-zA-Z_:][-a-zA-Z0-9_:.]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/;
const BLOCK_HTML_RE = /^<(?:\/?(?:div|section|article|aside|blockquote|table|thead|tbody|tfoot|tr|td|th|ul|ol|li|dl|dt|dd|pre|figure|figcaption|details|summary|hr|h[1-6]|p|form|nav|header|footer|style|script|iframe|img|video|audio|center|main|fieldset)(?=[\s>\/])|!--)/i;

function mapHtmlTag(name: string, attrs: string): { marker: string; attrs?: Record<string, string> } | null {
  const bare = attrs.trim() === '';
  if (bare) {
    const m: Record<string, string> = { em: 'em', i: 'it', strong: 'bd', b: 'bd', sup: 'sup' };
    return m[name] ? { marker: m[name] } : null;
  }
  const one = /^\s*(class|href)\s*=\s*(?:"([^"]*)"|'([^']*)')\s*$/.exec(attrs);
  if (!one) return null;
  const v = one[2] ?? one[3] ?? '';
  if (name === 'span' && one[1] === 'class' && /^[a-z][a-z0-9-]*$/.test(v)) return { marker: v };
  if (name === 'a' && one[1] === 'href') return { marker: 'jmp', attrs: { 'link-href': v } };
  return null;
}

function parseInline(src: string, ctx: Ctx, o: InlineOpts): InlineResult {
  const scripture = o.mode === 'scripture';
  const root: Inline[] = [];
  const stack: Span[] = [];
  let buf = '';
  let last = '';
  let lineBegin = 0;
  const top = (): Inline[] => (stack.length ? stack[stack.length - 1].node.children : root);

  const flush = () => {
    if (!buf) return;
    let t = buf; buf = '';
    const inRaw = stack.length > 0 && stack[stack.length - 1].kind === 'raw';
    const bar = inRaw ? t.indexOf('|') : -1;
    const attrPart = bar >= 0 ? t.slice(bar) : '';
    if (bar >= 0) t = t.slice(0, bar);
    t = decodeEntities(t);
    if (/(^| )\/\/( |$)/.test(unprotect(t))) ctx.diag('warning', 'A standalone // is an optional line break in USFM; USFM software will read it that way', o.line, 'usfm-slashes');
    if (t.includes('~')) ctx.diag('warning', 'USFM software reads ~ as a no-break space', o.line, 'usfm-tilde');
    if (ctx.typography) t = smart(t, last);
    t = unprotect(t) + attrPart;
    if (t) { top().push(text(t)); last = t[t.length - 1]; }
  };
  const openSpan = (kind: SpanKind, marker: string, start = 0) => {
    flush();
    const node: Char = { type: 'char', marker, children: [] };
    if (kind !== 'fn') top().push(node);
    stack.push({ kind, node, start });
    last = kind === 'add' ? '[' : kind === 'fn' ? '{' : ' ';
  };
  const closeTop = () => {
    flush();
    const sp = stack.pop()!;
    if (sp.kind === 'raw') extractAttrs(sp.node, (m) => ctx.diag('warning', m, o.line, 'pipe'));
    last = sp.kind === 'add' ? ']' : last;
    return sp;
  };
  const closeTo = (idx: number, warn: boolean) => {
    while (stack.length > idx + 1) {
      const sp = closeTop();
      if (warn) ctx.diag('warning', `Unclosed ${describe(sp)} was closed early`, o.line, 'unclosed');
    }
    return closeTop();
  };
  const findSpan = (kind: SpanKind, marker?: string): number => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].kind === kind && (marker === undefined || stack[i].node.marker === marker)) return i;
    }
    return -1;
  };
  const isLineStart = (i: number) => src.slice(lineBegin, i).trim() === '';
  const skipSpaces = (i: number) => { while (i < src.length && (src[i] === ' ' || src[i] === '\t')) i++; return i; };

  for (const k of o.reopen ?? []) {
    openSpan(k, k === 'add' ? 'add' : k === 'bd' ? 'bd' : 'em');
  }

  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];

    if (c === '\n') {
      if (/ {2,}$/.test(buf)) { buf = buf.replace(/ +$/, ''); flush(); top().push({ type: 'br' }); last = ' '; }
      else buf += ' ';
      i = skipSpaces(i + 1);
      lineBegin = i;
      continue;
    }

    if (scripture && (o.chapters || o.verses) && (i === 0 || /\s/.test(src[i - 1]))) {
      const rest = src.slice(i);
      if (o.chapters && isLineStart(i)) {
        const m = CHAPTER_RE.exec(rest);
        if (m) {
          flush();
          let j = skipSpaces(i + m[0].length);
          const textFollows = j < n && src[j] !== '\n';
          ctx.chapter = m[1];
          top().push({ type: 'chapter-mark', number: m[1] });
          const v = m[2] ?? (textFollows ? '1' : '');
          if (v) { top().push({ type: 'verse', number: v }); ctx.verse = v; } else ctx.verse = '';
          last = ' ';
          i = j;
          continue;
        }
      }
      if (o.verses) {
        const m = VERSE_RE.exec(rest);
        if (m) {
          flush();
          top().push({ type: 'verse', number: m[1] });
          ctx.verse = m[1];
          last = ' ';
          i = skipSpaces(i + m[0].length);
          continue;
        }
      }
    }

    if (c === '\\') {
      const nx = src[i + 1] ?? '';
      if (/\d/.test(src[i - 1] ?? '') && !/[A-Za-z]/.test(nx)) { i++; continue; }   // numeral escape
      if (/[A-Za-z]/.test(nx)) {
        if (!scripture) { buf += c; i++; continue; }
        const rest = src.slice(i);
        const ms = MS_RE.exec(rest);
        if (ms) {
          flush();
          top().push({ type: 'ms', marker: ms[1], attrs: parseAttrsLoose(ms[2] ?? '', ms[1]) });
          i += ms[0].length;
          continue;
        }
        const m = RAW_RE.exec(rest);
        if (m) {
          const name = m[1];
          if (m[2] === '*') {
            const idx = findSpan('raw', name);
            if (idx < 0) { ctx.diag('warning', `Stray closing marker \\${name}*`, o.line, 'stray-close'); }
            else closeTo(idx, true);
            i += m[0].length;
            continue;
          }
          if (name === 'v' && m[2] !== '*') {
            const vm = /^\\v[ \t]+(\d+[a-z]?(?:-\d+[a-z]?)?)(?=\s|$)[ \t]*/.exec(rest);
            if (vm) { flush(); top().push({ type: 'verse', number: vm[1] }); ctx.verse = vm[1]; last = ' '; i += vm[0].length; continue; }
          }
          if (isBlockMarker(name) && name !== 'v') {
            ctx.diag('warning', `Block marker \\${name} in the middle of text is not at the start of a line`, o.line, 'mid-line-block');
            buf += m[0]; i += m[0].length; continue;
          }
          if (isNote(name) || isContainer(name)) {
            const closer = `\\${name}*`;
            const end = src.indexOf(closer, i + m[0].length);
            if (end >= 0) {
              flush();
              const sub = src.slice(i, end + closer.length);
              const node = extractFirstInline(sub);
              if (node) top().push(node); else buf += sub;
              i = end + closer.length;
              continue;
            }
            ctx.diag('warning', `Unclosed \\${name}`, o.line, 'unclosed');
          }
          if (isImplicitChar(name)) {
            while (stack.length && stack[stack.length - 1].kind === 'raw' && isImplicitChar(stack[stack.length - 1].node.marker)) closeTop();
          }
          openSpan('raw', name);
          i += m[0].length;
          if (src[i] === ' ') i++;
          continue;
        }
      }
      if (/[!-\/:-@\[-`{-~]/.test(nx)) { buf += protect(nx); i += 2; continue; }       // escape
      buf += c; i++;
      continue;
    }

    if (scripture && c === '<') {
      const rest = src.slice(i);
      const cm = /^<!--[\s\S]*?-->/.exec(rest);
      const tm = cm ?? TAG_RE.exec(rest);
      if (tm) {
        const html = tm[0];
        flush();
        const closing = !cm && tm[1] === '/';
        const name = cm ? '' : tm[2].toLowerCase();
        const attrText = cm ? '' : (tm[3] ?? '');
        if (!cm && name === 'br') { top().push({ type: 'br' }); i += html.length; continue; }
        if (closing) {
          const idx = stack.map((x) => x.kind === 'html' && x.tag === name).lastIndexOf(true);
          if (idx >= 0) { closeTo(idx, true); i += html.length; continue; }
        } else if (!cm && !/\/\s*>$/.test(html)) {
          const mapped = mapHtmlTag(name, attrText);
          if (mapped) {
            openSpan('html', mapped.marker);
            const sp = stack[stack.length - 1]; sp.tag = name;
            if (mapped.attrs) sp.node.attrs = mapped.attrs;
            i += html.length; continue;
          }
        }
        top().push({ type: 'ms', marker: 'zhtml', attrs: { html } });
        i += html.length; continue;
      }
    }

    if (scripture) {
      if (c === '[') { openSpan('add', 'add'); i++; continue; }
      if (c === ']') {
        const idx = findSpan('add');
        if (idx >= 0) { closeTo(idx, true); }
        else { ctx.diag('warning', 'Unmatched ] (write \\] for a literal bracket)', o.line, 'unmatched-bracket'); buf += ']'; }
        i++; continue;
      }
      if (c === '{') {
        if (src.indexOf('}', i + 1) < 0) { ctx.diag('warning', 'Unmatched { (write \\{ for a literal brace)', o.line, 'unmatched-brace'); buf += '{'; i++; continue; }
        openSpan('fn', '__fn', i + 1);
        i++; continue;
      }
      if (c === '}') {
        const idx = findSpan('fn');
        if (idx < 0) { ctx.diag('warning', 'Unmatched } (write \\} for a literal brace)', o.line, 'unmatched-brace'); buf += '}'; i++; continue; }
        flush();
        const sp = closeTo(idx, true);
        const parent = top();
        parent.push(...sp.node.children);
        const pn: PendingNote = {
          type: 'pending-note', key: src.slice(sp.start, i), flat: plainText(sp.node.children),
          chapter: ctx.chapter, verse: ctx.verse, seq: ctx.seq, line: o.line,
        };
        parent.push(pn);
        ctx.pending.push(pn);
        last = '}';
        i++; continue;
      }
      if (c === '^') {
        const m = /[\p{L}\p{M}]+$/u.exec(buf);
        if (m) {
          buf = buf.slice(0, buf.length - m[0].length);
          flush();
          top().push({ type: 'char', marker: 'nd', children: [text(m[0])] });
          last = m[0][m[0].length - 1];
        } else { ctx.diag('warning', '^ must directly follow a word (write \\^ for a literal caret)', o.line, 'caret'); buf += '^'; }
        i++; continue;
      }
    } else if (c === '[') {
      const m = /^\[([^\]]*)\]\(([^)\s]*)\)/.exec(src.slice(i));
      if (m) {
        flush();
        top().push({ type: 'char', marker: 'jmp', attrs: { 'link-href': m[2] }, children: [text(m[1])] });
        i += m[0].length; continue;
      }
    }

    if (c === '*') {
      const dbl = src[i + 1] === '*';
      const kind: SpanKind = dbl ? 'bd' : 'em';
      const w = dbl ? 2 : 1;
      const nextCh = src[i + w] ?? '';
      const idx = findSpan(kind);
      if (idx >= 0 && !/\s/.test(src[i - 1] ?? ' ')) { closeTo(idx, true); i += w; continue; }
      if (nextCh && !/\s/.test(nextCh) && !(dbl && nextCh === '*')) { openSpan(kind, dbl ? 'bd' : 'em'); i += w; continue; }
      buf += '*'.repeat(w); i += w; continue;
    }
    if (c === '_') {
      const prev = src[i - 1] ?? ' ';
      const nextCh = src[i + 1] ?? ' ';
      const idx = findSpan('em_');
      if (idx >= 0 && !/\s/.test(prev) && !/[\p{L}\p{N}]/u.test(nextCh)) { closeTo(idx, true); i++; continue; }
      if (!/[\p{L}\p{N}]/u.test(prev) && !/\s/.test(nextCh)) { openSpan('em_', 'em'); i++; continue; }
      buf += '_'; i++; continue;
    }

    buf += c;
    i++;
  }

  flush();
  const open: SpanKind[] = [];
  while (stack.length) {
    const sp = stack[stack.length - 1];
    if (sp.kind === 'add' || sp.kind === 'em' || sp.kind === 'bd' || sp.kind === 'em_') open.unshift(sp.kind === 'em_' ? 'em' : sp.kind);
    else if (sp.kind === 'fn') {
      ctx.diag('warning', 'Unclosed { footnote brace', o.line, 'unclosed');
      const s = stack.pop()!;
      top().push(...s.node.children);
      continue;
    } else if (!(sp.kind === 'raw' && isImplicitChar(sp.node.marker))) ctx.diag('warning', `Unclosed ${describe(sp)}`, o.line, 'unclosed');
    closeTop();
  }
  return { nodes: trimInline(root), open };
}

const describe = (sp: Span) => (sp.kind === 'add' ? '[' : sp.kind === 'raw' ? `\\${sp.node.marker}` : sp.kind === 'fn' ? '{' : '*');

function parseAttrsLoose(s: string, marker: string) {
  const a: Record<string, string> = {};
  const re = /([A-Za-z][\w:-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null; let any = false;
  while ((m = re.exec(s))) { a[m[1]] = m[2]; any = true; }
  if (!any && s.trim()) a.default = s.trim();
  void marker;
  return Object.keys(a).length ? a : undefined;
}

function extractAttrs(c: Char, warn?: (m: string) => void) {
  const lastN = c.children[c.children.length - 1];
  if (lastN && lastN.type === 'text') {
    const bar = lastN.text.lastIndexOf('|');
    if (bar >= 0) {
      const a = parseAttrsLoose(lastN.text.slice(bar + 1), c.marker);
      if (a?.default && !/^(?:w|wg|wh|wa|rb|jmp)$/.test(c.marker)) warn?.(`In USFM, text after | inside \\${c.marker} is read as attributes; write the | outside the marker or leave it out`);
      lastN.text = lastN.text.slice(0, bar);
      if (a) c.attrs = a;
    }
  }
}

function extractFirstInline(sub: string): Inline | null {
  const d = parseUsfm('\\p ' + sub);
  const b = d.books[0]?.blocks[0];
  if (b && b.type === 'block') return b.children[0] ?? null;
  return null;
}

/* ---------------- block level ---------------- */

const META_RE = /^([A-Za-z][A-Za-z0-9 _-]*):\s+(.+)$/;
const FENCE_RE = /^>{3,}\s*$/;
const HEAD_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const DEF_RE = /^\{([^}]*)\}:\s*(.*)$/;
const POETRY_RE = /^\/([ \t]+|$)(.*)$/;
const RAWLINE_RE = /^\\([a-z][a-z0-9]*)(?=\s|$)/;
const LIST_RE = /^([ \t]*)([-+*]|\d+[.)])[ \t]+(.*)$/;

export function parseBibleMd(srcIn: string, opts: BibleMdOptions = {}): Doc {
  const doc = emptyDoc();
  const src = srcIn.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const ctx: Ctx = {
    typography: opts.typography !== false, chapter: '', verse: '', seq: 0, pending: [],
    diag: (severity, message, line, code) => doc.diagnostics.push({ severity, message, line, code }),
  };

  let quoteN = 0;
  const mdEnv: MdEnv = {
    typography: ctx.typography,
    diag: ctx.diag,
    nextQuoteId: () => `bq${++quoteN}`,
    parseBible: (text, line) => {
      const sub = parseBibleMd(text, { typography: opts.typography });
      for (const d of sub.diagnostics) if (d.code !== 'no-book') ctx.diag(d.severity, d.message, (d.line ?? 1) + line - 1, d.code);
      return quoteBlocks(sub.books[0]?.blocks ?? [], (m, l) => ctx.diag('warning', m, line + l, 'quote'));
    },
  };

  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  // metadata
  {
    let j = i; const found: [string, string][] = [];
    while (j < lines.length && lines[j].trim() !== '') {
      const m = META_RE.exec(lines[j]);
      if (!m) { found.length = 0; break; }
      found.push([m[1].trim(), m[2].trim()]); j++;
    }
    let k = j; while (k < lines.length && lines[k].trim() === '') k++;
    const followed = k >= lines.length || /^#{1,6}\s/.test(lines[k]) || /^\\id\b/.test(lines[k]);
    if (found.length && j > i && followed) { doc.meta = found; i = j; }
  }

  let book: Book | null = null;
  let defs: Def[] = [];
  let introOpen = false;
  let sawBlank = false;
  let carry: SpanKind[] = [];
  let titleN = 0;
  let lastTitleLine = -10;

  const startBook = (id: string, idText: string): Book => {
    finishBook();
    book = { id, idText, blocks: [] };
    doc.books.push(book);
    ctx.chapter = ''; ctx.verse = ''; introOpen = false;
    return book;
  };
  const ensureBook = (): Book => book ?? startBook('', '');
  const hasChapter = () => !!book && book.blocks.some((n) => n.type === 'chapter');
  const closeIntro = () => { if (introOpen && book) { book.blocks.push({ type: 'block', marker: 'ie', children: [] }); introOpen = false; } };
  let sidebar: Sidebar | null = null;
  const push = (n: Node) => {
    if (sidebar && n.type === 'block') sidebar.blocks.push(n); else ensureBook().blocks.push(n);
    ctx.seq++; sawBlank = false;
  };
  const pushChapter = (number: string, line: number) => { closeIntro(); push({ type: 'chapter', number, children: [], line }); };

  const emit = (marker: string, nodes: Inline[], line: number, closes = true) => {
    let seg: Inline[] = [];
    let any = false;
    const flushSeg = () => {
      if (seg.length) {
        if (closes) closeIntro();
        push({ type: 'block', marker, children: trimInline(seg), line });
      }
      seg = [];
    };
    for (const nd of nodes) {
      if (nd.type === 'chapter-mark') { flushSeg(); pushChapter(nd.number, line); any = true; continue; }
      seg.push(nd);
    }
    if (seg.length || !any) {
      if (closes) closeIntro();
      push({ type: 'block', marker, children: trimInline(seg), line });
    }
  };

  const structural = (l: string): boolean =>
    FENCE_RE.test(l) || /^#{1,6}\s/.test(l) || DEF_RE.test(l) || /^\/([ \t]|$)/.test(l) ||
    /^[-+*][ \t]+\S/.test(l) || /^1[.)][ \t]+\S/.test(l) || BLOCK_HTML_RE.test(l) ||
    (() => { const m = RAWLINE_RE.exec(l); return !!m && (isBlockMarker(m[1]) || m[1] === 'c'); })();

  const gather = (start: number): [string, number] => {
    const parts = [lines[start]];
    let j = start + 1;
    while (j < lines.length && lines[j].trim() !== '' && !structural(lines[j])) { parts.push(lines[j]); j++; }
    return [parts.join('\n'), j];
  };

  function finishBook() {
    sidebar = null;
    if (!book) return;
    closeIntro();
    // match footnotes to definitions (spec 3.10)
    const anchors = ctx.pending.slice();
    const matched = new Set<PendingNote>();
    for (const d of defs) {
      const a = anchors.find((p) => !matched.has(p) && p.key === d.key && p.seq < d.seq);
      if (!a) continue;
      matched.add(a); d.used = true;
      const kids: Inline[] = [];
      if (a.chapter) kids.push({ type: 'char', marker: 'fr', children: [text(a.verse ? `${a.chapter}:${a.verse}` : a.chapter)] });
      const fq = stripTrailingPunct(a.flat);
      if (fq) kids.push({ type: 'char', marker: 'fq', children: [text(fq)] });
      kids.push(...d.nodes);
      const note = a as unknown as Record<string, unknown>;
      for (const k of Object.keys(note)) delete note[k];
      Object.assign(note, { type: 'note', marker: 'f', caller: '+', children: kids } as Note);
    }
    for (const a of anchors) if (!matched.has(a)) ctx.diag('warning', `Footnote {${a.key}} has no matching definition after it`, a.line, 'footnote-no-def');
    for (const d of defs) if (!d.used) {
      ctx.diag('warning', `Footnote definition {${d.key}}: has no matching footnote before it`, d.line, 'def-no-footnote');
      book.blocks.push({ type: 'block', marker: 'rem', children: [text(`unmatched footnote definition {${d.key}}: ${plainText(d.nodes)}`)], line: d.line });
    }
    stripPending(book.blocks);
    ctx.pending = []; defs = [];
  }

  while (i < lines.length) {
    const line = lines[i];
    const ln = i + 1;
    if (line.trim() === '') {
      sawBlank = true;
      if (carry.length) { ctx.diag('warning', 'Unclosed span at the end of a paragraph', ln, 'unclosed'); carry = []; }
      i++; continue;
    }

    // explanatory text
    if (FENCE_RE.test(line)) {
      let j = i + 1; const body: string[] = [];
      while (j < lines.length && !FENCE_RE.test(lines[j])) { body.push(lines[j]); j++; }
      if (j >= lines.length) ctx.diag('warning', 'Explanatory text is missing its closing >>> line', ln, 'fence');
      const intro = !!book && !hasChapter() || !book;
      const blocks = mdBlocks(body.join('\n'), intro, mdEnv, ln + 1);
      ensureBook();
      if (intro) { for (const b of blocks) push(b); introOpen = true; }
      else push({ type: 'sidebar', blocks, line: ln } as Sidebar);
      i = j + 1; continue;
    }

    // headings and book names
    const h = HEAD_RE.exec(line);
    if (h) {
      const level = h[1].length;
      const bm = level === 1 ? /^(.*?)\s*\(([A-Z0-9]{3})\)$/.exec(h[2]) : null;
      if (bm) {
        const name = ctxText(bm[1], ctx);
        if (!BOOK_CODES.has(bm[2])) ctx.diag('warning', `Unknown book code ${bm[2]}`, ln, 'book-code');
        const b = startBook(bm[2], '');
        for (const m of ['h', 'toc1', 'mt1']) b.blocks.push({ type: 'block', marker: m, children: [text(name)], line: ln });
        ctx.seq++; sawBlank = false;
        i++; continue;
      }
      const r = parseInline(h[2], ctx, { mode: 'scripture', verses: false, chapters: false, line: ln });
      let marker: string;
      if (level === 1) {
        titleN = lastTitleLine === i - 1 ? Math.min(titleN + 1, 3) : 1;
        lastTitleLine = i; marker = `mt${titleN}`;
      } else marker = level === 2 ? 'ms1' : `s${level - 2}`;
      emit(marker, r.nodes, ln, false);
      i++; continue;
    }

    // footnote definitions
    if (DEF_RE.test(line)) {
      let j = i;
      while (j < lines.length) {
        const m = DEF_RE.exec(lines[j]);
        if (!m) break;
        const first = m[2]; const l0 = j + 1;
        const cont: { raw: string; indented: boolean }[] = [];
        j++;
        for (;;) {
          const nx = lines[j];
          if (nx === undefined) break;
          if (nx.trim() === '') {
            let k = j; while (k < lines.length && lines[k].trim() === '') k++;
            if (k < lines.length && /^( {2,}|\t)\S/.test(lines[k]) && !DEF_RE.test(lines[k])) { for (; j < k; j++) cont.push({ raw: '', indented: false }); continue; }
            break;
          }
          if (/^( {2,}|\t)/.test(nx)) { cont.push({ raw: nx.replace(/\t/g, '    '), indented: true }); j++; continue; }
          if (structural(nx)) break;
          cont.push({ raw: nx.trim(), indented: false }); j++;
        }
        const minIndent = Math.min(...cont.filter((c) => c.indented).map((c) => /^ */.exec(c.raw)![0].length), 99);
        const parts = [first, ...cont.map((c) => (c.indented ? c.raw.slice(minIndent) : c.raw))];
        defs.push({ key: m[1], nodes: mdNoteBody(parts.join('\n'), mdEnv, l0), seq: ctx.seq, line: l0, used: false });
        ctx.seq++;
      }
      sawBlank = false;
      i = j; continue;
    }

    // HTML blocks
    if (BLOCK_HTML_RE.test(line)) {
      let j = i; const parts: string[] = [];
      if (/^<!--/.test(line) && !line.includes('-->')) {
        while (j < lines.length) { parts.push(lines[j]); if (lines[j].includes('-->')) { j++; break; } j++; }
      } else {
        while (j < lines.length && lines[j].trim() !== '') { parts.push(lines[j]); j++; }
      }
      push({ type: 'block', marker: 'zhtmlb', children: [], attrs: { html: parts.join('\n') }, line: ln });
      i = j; continue;
    }

    // Markdown lists
    {
      const lm = LIST_RE.exec(line);
      if (lm) {
        const indent = lm[1].replace(/\t/g, '    ').length;
        const lvl = Math.min(1 + Math.floor(indent / 2), 4);
        const parts = [(/^\d/.test(lm[2]) ? lm[2] + ' ' : '') + lm[3]];
        let j = i + 1;
        while (j < lines.length && lines[j].trim() !== '' && /^[ \t]/.test(lines[j]) && !LIST_RE.test(lines[j]) && !structural(lines[j].trim())) { parts.push(lines[j].trim()); j++; }
        const res = parseInline(parts.join('\n'), ctx, { mode: 'scripture', verses: true, chapters: true, reopen: carry, line: ln });
        carry = res.open;
        emit(`li${lvl}`, res.nodes, ln);
        i = j; continue;
      }
    }

    // poetry
    if (/^\/([ \t]|$)/.test(line)) {
      const run: { indent: number; text: string; line: number }[] = [];
      let j = i;
      while (j < lines.length) {
        const m = POETRY_RE.exec(lines[j]);
        if (!m) break;
        const ws = lines[j].slice(1, lines[j].length - m[2].length);
        run.push({ indent: ws.replace(/\t/g, '    ').length, text: m[2], line: j + 1 });
        j++;
      }
      const levels = [...new Set(run.map((r) => r.indent))].sort((a, b) => a - b);
      if (levels.length > 4) ctx.diag('warning', 'More than four poetry indent levels; the extras are treated as level 4', ln, 'poetry-levels');
      const bk = book as Book | null;
      const prev = bk?.blocks[bk.blocks.length - 1];
      if (sawBlank && prev && prev.type === 'block' && /^q[1-4]$/.test(prev.marker)) {
        push({ type: 'block', marker: 'b', children: [], line: ln });
      }
      for (const r of run) {
        const lvl = Math.min(levels.indexOf(r.indent) + 1, 4);
        const res = parseInline(r.text, ctx, { mode: 'scripture', verses: true, chapters: true, reopen: carry, line: r.line });
        carry = res.open;
        emit(`q${lvl}`, res.nodes, r.line);
      }
      i = j; continue;
    }

    // raw USFM block marker at the start of a line
    const rl = RAWLINE_RE.exec(line);
    if (rl && (isBlockMarker(rl[1]) || rl[1] === 'c')) {
      const name = rl[1];
      const [block, j] = gather(i);
      const rest = block.slice(rl[0].length).replace(/^[ \t]/, '');
      if (name === 'id') {
        const m = /^\s*(\S+)\s*([\s\S]*)$/.exec(rest);
        startBook(m ? m[1] : '', m ? m[2].replace(/\s+/g, ' ').trim() : '');
      } else if (name === 'c') {
        const m = /^\s*(\S+)\s*([\s\S]*)$/.exec(rest);
        pushChapter(m ? m[1] : '', ln);
        ctx.chapter = m ? m[1] : ''; ctx.verse = '';
        if (m && m[2].trim()) {
          const extra = parseInline(m[2], ctx, { mode: 'scripture', verses: false, chapters: false, line: ln }).nodes;
          const bk3 = book as unknown as Book | null;
          const lastNode = bk3?.blocks[bk3.blocks.length - 1];
          if (lastNode && lastNode.type === 'chapter') lastNode.children = extra;
        }
      } else if (name === 'esb') {
        const bk2 = ensureBook();
        sidebar = { type: 'sidebar', blocks: [], line: ln };
        bk2.blocks.push(sidebar); ctx.seq++;
      } else if (name === 'esbe') {
        sidebar = null;
      } else {
        const res = parseInline(rest, ctx, { mode: 'scripture', verses: true, chapters: true, reopen: carry, line: ln });
        carry = res.open;
        const marker = normalizeMarker(name);
        if (marker === 'ie') introOpen = false;
        emit(marker, res.nodes, ln, !isIntroLike(marker));
      }
      i = j; continue;
    }

    // ordinary paragraph
    const [block, j] = gather(i);
    const res = parseInline(block, ctx, { mode: 'scripture', verses: true, chapters: true, reopen: carry, line: ln });
    carry = [];
    if (res.open.length) ctx.diag('warning', 'Unclosed span at the end of a paragraph', ln, 'unclosed');
    emit('p', res.nodes, ln);
    i = j;
  }
  finishBook();
  // blocks created before the first book heading with no heading: keep, diagnose
  if (doc.books.length === 1 && doc.books[0].id === '') ctx.diag('info', 'No book heading (# Name (ABC)) found', 1, 'no-book');
  return doc;
}

function isIntroLike(m: string): boolean { return /^(?:imte?\d|is\d|iq\d|ili\d|io\d)$/.test(m) || INTRO_PARA.has(m) || ['ib', 'iot', 'iex', 'ie', 'h', 'toc1', 'toc2', 'toc3', 'mt1', 'mt2', 'mt3', 'rem'].includes(m); }

function ctxText(s: string, ctx: Ctx): string {
  let t = s.replace(/\\(.)/g, (_, c: string) => protect(c));
  if (ctx.typography) t = smart(t, '');
  return unprotect(t);
}

function stripPending(nodes: Node[] | Inline[]): void {
  for (const n of nodes as Array<Node | Inline>) {
    if ('children' in n && Array.isArray(n.children)) {
      n.children = (n.children as Inline[]).filter((c) => c.type !== 'pending-note');
      stripPending(n.children as Inline[]);
    }
    if (n.type === 'sidebar') stripPending(n.blocks);
  }
}

/* --------- nested Bible Markdown quotations (```bible fences) --------- */

/** Turn the blocks of a parsed passage into a quotation: verse and chapter numbers become plain superscripts. */
function quoteBlocks(nodes: Node[], warn: (message: string, line: number) => void): Block[] {
  const out: Block[] = [];
  let carryChapter = '';
  const fix = (inl: Inline[], line: number): Inline[] => {
    const r: Inline[] = [];
    for (const n of inl) {
      if (n.type === 'verse') {
        r.push({ type: 'char', marker: 'sup', children: [text((carryChapter ? carryChapter + ':' : '') + n.number)] }, text(' '));
        carryChapter = '';
      } else if (n.type === 'note') warn('Footnotes are not allowed inside a ```bible quotation; the note was dropped', line);
      else if (n.type === 'char') r.push({ ...n, children: fix(n.children, line) });
      else r.push(n);
    }
    return r;
  };
  for (const n of nodes) {
    if (n.type === 'chapter') { carryChapter = n.number; continue; }
    if (n.type === 'sidebar') continue;
    if (n.type === 'block' && /^(?:h|toc[123]|mt1|ie|rem)$/.test(n.marker)) continue;
    if (n.type === 'block' && /^(?:mt\d|ms\d|s\d)$/.test(n.marker)) { warn('Headings are not allowed inside a ```bible quotation; the heading was dropped', n.line ?? 1); continue; }
    out.push({ ...n, children: fix(n.children, n.line ?? 1) });
  }
  return out;
}
