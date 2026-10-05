import { Block, Book, Char, ChapterBlock, Diagnostic, Doc, Inline, Node, Note, Sidebar, emptyDoc, text, trimInline } from './model.js';
import { isBlockMarker, isImplicitChar, isKnownChar } from './markers.js';

/* ---------- a small, tolerant HTML tree builder ---------- */

interface HEl { tag: string; attrs: Record<string, string>; children: HNode[] }
type HNode = HEl | { text: string } | { comment: string };
const isEl = (n: HNode): n is HEl => 'tag' in n;
const isText = (n: HNode): n is { text: string } => 'text' in n;
const isComment = (n: HNode): n is { comment: string } => 'comment' in n;

const VOID = new Set(['br', 'img', 'meta', 'link', 'hr', 'input', 'wbr']);
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0', mdash: '\u2014', ndash: '\u2013', hellip: '\u2026', lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D' };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(cp) ? String.fromCodePoint(cp) : m; }
  return ENT[e.toLowerCase()] ?? m;
});

function parseTree(src: string): HEl {
  const root: HEl = { tag: '#root', attrs: {}, children: [] };
  const stack: HEl[] = [root];
  const top = () => stack[stack.length - 1];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { top().children.push({ text: decode(src.slice(i)) }); break; }
    if (lt > i) top().children.push({ text: decode(src.slice(i, lt)) });
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      const stop = end < 0 ? src.length : end;
      top().children.push({ comment: src.slice(lt + 4, stop) });
      i = end < 0 ? src.length : end + 3; continue;
    }
    if (src[lt + 1] === '!' || src[lt + 1] === '?') { const e = src.indexOf('>', lt); i = e < 0 ? src.length : e + 1; continue; }
    if (src[lt + 1] === '/') {
      const e = src.indexOf('>', lt);
      const name = src.slice(lt + 2, e < 0 ? src.length : e).trim().toLowerCase();
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].tag === name) { stack.length = k; break; }
      i = e < 0 ? src.length : e + 1; continue;
    }
    const m = /^<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/.exec(src.slice(lt));
    if (!m) { top().children.push({ text: '<' }); i = lt + 1; continue; }
    const tag = m[1].toLowerCase();
    const attrs: Record<string, string> = {};
    const re = /([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let a: RegExpExecArray | null;
    while ((a = re.exec(m[2]))) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '');
    const el: HEl = { tag, attrs, children: [] };
    if (tag === 'li' && top().tag === 'li') stack.pop();
    top().children.push(el);
    const selfClose = /\/\s*$/.test(m[2]);
    if (!VOID.has(tag) && !selfClose) stack.push(el);
    i = lt + m[0].length;
  }
  return root;
}

const classes = (e: HEl) => (e.attrs.class ?? '').split(/\s+/).filter(Boolean);
const hasClass = (e: HEl, c: string) => classes(e).includes(c);
function find(e: HEl, pred: (x: HEl) => boolean, out: HEl[] = []): HEl[] {
  for (const c of e.children) if (isEl(c)) { if (pred(c)) out.push(c); find(c, pred, out); }
  return out;
}
const textOf = (n: HNode): string => (isText(n) ? n.text : isEl(n) ? n.children.map(textOf).join('') : '');
const escText = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttrVal = (t: string) => escText(t).replace(/"/g, '&quot;');
const openTag = (e: HEl) => `<${e.tag}${Object.entries(e.attrs).map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${escAttrVal(v)}"`)).join('')}>`;
function outerHtml(n: HNode): string {
  if (isText(n)) return escText(n.text);
  if (isComment(n)) return `<!--${n.comment}-->`;
  if (VOID.has(n.tag)) return openTag(n);
  return openTag(n) + n.children.map(outerHtml).join('') + `</${n.tag}>`;
}
const stripParens = (s: string) => s.replace(/^\(|\)$/g, '');

function dataAttrs(e: HEl, skip: string[] = []): Record<string, string> | undefined {
  const a: Record<string, string> = {};
  for (const [k, v] of Object.entries(e.attrs)) if (k.startsWith('data-') && !skip.includes(k.slice(5))) a[k.slice(5)] = v;
  return Object.keys(a).length ? a : undefined;
}

/* ---------- HTML -> model ---------- */

export function parseBibleHtml(src: string): Doc {
  const doc = emptyDoc();
  const diag = (severity: Diagnostic['severity'], message: string) => doc.diagnostics.push({ severity, message });
  const tree = parseTree(src.replace(/^\uFEFF/, ''));

  for (const m of find(tree, (e) => e.tag === 'meta')) {
    const name = m.attrs.name;
    if (!name || ['bible-html', 'usfm', 'ide', 'viewport', 'generator'].includes(name)) continue;
    const key = m.attrs['data-key'] ?? name.charAt(0).toUpperCase() + name.slice(1);
    doc.meta.push([key, m.attrs.content ?? '']);
  }

  const articles = find(tree, (e) => e.tag === 'article' && hasClass(e, 'id'));
  if (articles.length === 0) {
    const body = find(tree, (e) => e.tag === 'body')[0] ?? tree;
    diag('info', 'No <article class="id"> found; reading as a fragment');
    doc.books.push(readBook(body, '', ''));
  } else for (const a of articles) doc.books.push(readBook(a, a.attrs['data-id'] ?? a.attrs.id ?? '', a.attrs['data-id-text'] ?? '', a.attrs['data-cl']));
  return doc;

  function readBook(root: HEl, id: string, idText: string, cl?: string): Book {
    const book: Book = { id, idText, blocks: [] };
    const notes = new Map<string, HEl>();
    for (const aside of find(root, (e) => e.tag === 'aside' && hasClass(e, 'notes'))) for (const li of find(aside, (e) => e.tag === 'li' && !!e.attrs.id)) notes.set(li.attrs.id, li);

    let stripNext = false;
    let pendingCl: string | undefined;
    const inl = (children: HNode[]): Inline[] => {
      const out: Inline[] = [];
      for (const c of children) {
        if (isComment(c)) continue;
        if (isText(c)) {
          let t = c.text.replace(/[ \t\r\n\f]+/g, ' ');
          if (stripNext) { t = t.replace(/^ /, ''); stripNext = false; }
          if (t) out.push(text(t));
          continue;
        }
        const cls = classes(c);
        if (c.tag === 'br') { out.push({ type: 'br' }); continue; }
        if (c.tag === 'sup' && cls.includes('v')) {
          out.push({ type: 'verse', number: c.attrs['data-v'] ?? textOf(c) });
          const vp = c.children.find((x): x is HEl => isEl(x) && hasClass(x, 'vp'));
          if (vp) out.push({ type: 'char', marker: 'vp', children: [text(textOf(vp))] });
          stripNext = true; continue;
        }
        if (c.tag === 'sup' && cls.includes('va')) { out.push({ type: 'char', marker: 'va', children: [text(stripParens(textOf(c)))] }); continue; }
        if (c.tag === 'span' && cls.includes('ca')) { out.push({ type: 'char', marker: 'ca', children: [text(stripParens(textOf(c)))] }); continue; }
        if (c.tag === 'sup' && cls.includes('caller')) {
          const href = find(c, (e) => e.tag === 'a')[0]?.attrs.href ?? '';
          const li = notes.get(href.replace(/^#/, ''));
          if (!li) { diag('warning', `Footnote mark ${href} has no matching note`); continue; }
          const marker = classes(li)[0] ?? 'f';
          const kids = inl(li.children).filter((k) => !(k.type === 'text' && !k.text.trim()));
          const note: Note = { type: 'note', marker, caller: li.attrs['data-caller'] ?? '+', children: kids.map((k) => (k.type === 'text' ? { ...k, text: k.text.trim() } : k)) };
          out.push(note); continue;
        }
        if (c.tag === 'span' && c.children.length === 0 && (cls.some((x) => /-[se]$/.test(x)) || cls.includes('ts') || c.attrs['data-milestone'] !== undefined)) {
          out.push({ type: 'ms', marker: cls.find((x) => /-[se]$/.test(x)) ?? cls[0] ?? 'ts', attrs: dataAttrs(c, ['milestone']) }); continue;
        }
        let marker: string | undefined = cls[0] ?? ({ em: 'em', strong: 'bd', b: 'bd', i: 'it', sup: 'sup', a: 'jmp' } as Record<string, string>)[c.tag];
        if (marker && !isKnownChar(marker)) marker = undefined;
        if (!marker) {
          out.push({ type: 'ms', marker: 'zhtml', attrs: { html: openTag(c) } });
          if (!VOID.has(c.tag)) { out.push(...inl(c.children)); out.push({ type: 'ms', marker: 'zhtml', attrs: { html: `</${c.tag}>` } }); }
          continue;
        }
        if (marker === 'w' && c.attrs['data-wtype']) marker = c.attrs['data-wtype'];
        let kids: HNode[] = c.children;
        if (marker === 'fig') {
          const cap = kids.find((x): x is HEl => isEl(x) && hasClass(x, 'caption'));
          if (cap) kids = cap.children;
        }
        let attrs = dataAttrs(c, ['wtype', 'cols']);
        if (marker === 'bdit') { const i1 = kids.find((x): x is HEl => isEl(x) && x.tag === 'i'); if (i1) kids = i1.children; }
        if (marker === 'rb') {
          const rt = kids.find((x): x is HEl => isEl(x) && x.tag === 'rt');
          if (rt) { attrs = { ...(attrs ?? {}), gloss: textOf(rt) }; kids = kids.filter((x) => x !== rt); }
        }
        if (c.tag === 'a' && c.attrs.href !== undefined) attrs = { ...(attrs ?? {}), 'link-href': c.attrs.href };
        const ch: Char = { type: 'char', marker, children: inl(kids) };
        if (attrs) ch.attrs = attrs;
        out.push(ch);
      }
      return out;
    };
    const blockOf = (marker: string, children: HNode[], extra?: Partial<Block>): Block => {
      stripNext = false;
      const line = Number(extra?.line);
      const b: Block = { type: 'block', marker, children: trimInline(inl(children)) };
      if (line) b.line = line;
      return b;
    };
    const lineOf = (e: HEl) => (e.attrs['data-line'] ? { line: Number(e.attrs['data-line']) } : undefined);

    const walk = (children: HNode[], out: Node[]) => {
      for (const c of children) {
        if (isText(c)) { if (c.text.trim()) out.push(blockOf('p', [c])); continue; }
        if (isComment(c)) {
          const t = c.comment.trim();
          const m = /^\\([a-z][a-z0-9]*)\s*([\s\S]*)$/.exec(t);
          if (m) out.push({ type: 'block', marker: m[1], children: m[2] ? [text(m[2])] : [] });
          else out.push({ type: 'block', marker: 'rem', children: [text(t.replace(/- -/g, '--'))] });
          continue;
        }
        const cls = classes(c);
        const tag = c.tag;
        if (tag === 'section' && cls.includes('c')) {
          if (pendingCl) { out.push({ type: 'block', marker: 'cl', children: [text(pendingCl)] }); pendingCl = undefined; }
          const ch: ChapterBlock = { type: 'chapter', number: c.attrs['data-c'] ?? '', children: [] };
          out.push(ch);
          const head = c.children.find((x): x is HEl => isEl(x) && x.tag === 'h2' && hasClass(x, 'cn'));
          if (head) {
            for (const s of head.children) {
              if (!isEl(s)) continue;
              if (hasClass(s, 'cp')) out.push(blockOf('cp', s.children));
              else if (hasClass(s, 'cl')) { if (!(cl && textOf(s) === cl)) out.push(blockOf('cl', s.children)); }
              else if (hasClass(s, 'ca')) ch.children.push({ type: 'char', marker: 'ca', children: [text(stripParens(textOf(s)))] });
            }
          }
          walk(c.children.filter((x) => x !== head), out);
          continue;
        }
        if (tag === 'blockquote' && cls.includes('qt') && c.attrs['data-x-quote'] === 'bible') {
          const a = dataAttrs(c) ?? {};
          out.push({ type: 'block', marker: 'qt-s', children: [], attrs: a });
          walk(c.children, out);
          out.push({ type: 'block', marker: 'qt-e', children: [], ...(a.sid ? { attrs: { eid: a.sid } } : {}) });
          continue;
        }
        if (tag === 'section' && cls.includes('periph')) {
          const head = c.children.find((x): x is HEl => isEl(x) && x.tag === 'h2' && hasClass(x, 'periph-title'));
          const t = head ? textOf(head).trim() : '';
          const id = c.attrs['data-periph'];
          out.push({ type: 'block', marker: 'periph', children: [text(id ? `${t}|id="${id}"` : t)] });
          walk(c.children.filter((x) => x !== head), out);
          continue;
        }
        if (tag === 'aside' && cls.includes('notes')) continue;
        if (tag === 'aside' && cls.includes('esb')) {
          const sb: Sidebar = { type: 'sidebar', blocks: [] };
          const tmp: Node[] = [];
          walk(c.children, tmp);
          sb.blocks = tmp.filter((x): x is Block => x.type === 'block');
          out.push(sb); continue;
        }
        if (tag === 'h1' && (cls.includes('mt') || cls.includes('imt'))) {
          const spans = c.children.filter((x): x is HEl => isEl(x) && x.tag === 'span');
          if (spans.length) for (const s of spans) out.push(blockOf(classes(s)[0] ?? 'mt1', s.children));
          else out.push(blockOf(cls.includes('imt') ? 'imt1' : 'mt1', c.children));
          continue;
        }
        if (tag === 'p' && cls.includes('mte')) {
          for (const s of c.children) if (isEl(s)) out.push(blockOf(classes(s)[0] ?? 'mte1', s.children));
          continue;
        }
        const rawBlock = () => out.push({ type: 'block', marker: 'zhtmlb', children: [], attrs: { html: outerHtml(c) } });
        const known = (m: string | undefined) => !m || isBlockMarker(m) || m.startsWith('z');
        if (/^h[1-6]$/.test(tag)) {
          const def = ['mt1', 'ms1', 's1', 's2', 's3', 's4'][Number(tag[1]) - 1];
          if (!known(cls[0])) { rawBlock(); continue; }
          out.push(blockOf(cls[0] ?? def, c.children, lineOf(c))); continue;
        }
        if (tag === 'p') {
          if (!known(cls[0])) { rawBlock(); continue; }
          out.push(blockOf(cls[0] ?? 'p', c.children, lineOf(c))); continue;
        }
        if (tag === 'span' && cls.some((x) => /^toca?\d$/.test(x))) { out.push(blockOf(cls[0], c.children)); continue; }
        if (tag === 'div' && cls.some((x) => /^(b|ib|ie|sd\d?)$/.test(x))) { out.push({ type: 'block', marker: cls[0], children: [] }); continue; }
        if (tag === 'ul') { readList(c, out); continue; }
        if (tag === 'table') {
          for (const tr of find(c, (e) => e.tag === 'tr')) {
            const cells: Inline[] = [];
            for (const td of tr.children) if (isEl(td) && (td.tag === 'td' || td.tag === 'th')) {
              stripNext = false;
              cells.push({ type: 'char', marker: classes(td)[0] ?? 'tc1', children: trimInline(inl(td.children)) });
            }
            out.push({ type: 'block', marker: 'tr', children: cells });
          }
          continue;
        }
        rawBlock();
      }
    };
    const readList = (ul: HEl, out: Node[]) => {
      for (const li of ul.children) {
        if (!isEl(li) || li.tag !== 'li') continue;
        const own = li.children.filter((x) => !(isEl(x) && x.tag === 'ul'));
        out.push(blockOf(classes(li)[0] ?? 'li1', own));
        for (const sub of li.children) if (isEl(sub) && sub.tag === 'ul') readList(sub, out);
      }
    };

    pendingCl = cl;
    walk(root.children, book.blocks);
    if (pendingCl) book.blocks.push({ type: 'block', marker: 'cl', children: [text(pendingCl)] });
    return book;
  }
}
