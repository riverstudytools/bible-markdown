import { Block, Char, Doc, Inline, Milestone, Node, Note, plainText } from './model.js';
import { isContainer, isImplicitChar } from './markers.js';
import { stripTrailingPunct } from './typography.js';
import { formatAttrs, usfmInline } from './usfm.js';

interface St { chapter: string; verse: string; pendingChapter: string | null; defs: string[] }

const NUM_TOKEN = /(?<![^\s])(\d+[a-z]?(?:-\d+[a-z]?)?)(?=\s|$)/g;

/** Escape plain text for Bible Markdown. `boundary` is true when the text starts at the start of a line or after whitespace. */
export function escapeScripture(t: string, boundary: boolean, lineStart: boolean, notes = false): string {
  let s = t.replace(/\\/g, '\\\\').replace(/[\[\]{}^*_]/g, (c) => '\\' + c).replace(/["']/g, (c) => '\\' + c);
  s = s.replace(/-{2,}/g, (m) => m.split('').map(() => '\\-').join(''));
  s = s.replace(/&(?=#?[A-Za-z0-9]+;)/g, '\\&').replace(/<(?=[A-Za-z\/!])/g, '\\<').replace(/\u00A0/g, '&nbsp;');
  if (!notes) {
    s = s.replace(NUM_TOKEN, (m, _n, off: number) => (off === 0 && !boundary ? m : m + '\\'));
  }
  if (lineStart) {
    if (!notes) s = s.replace(/^(\d+:\d*)(?=\s|$)/, '$1\\').replace(/^\//, '\\/');
    s = s.replace(/^#/, '\\#').replace(/^>/, '\\>').replace(/^([-+])(?=\s)/, '\\$1').replace(/^(\d+)([.)])(?=\s)/, '$1\\$2');
  }
  return s;
}

const SIMPLE_INLINE = (x: Inline): boolean =>
  x.type === 'text' || (x.type === 'char' && (x.marker === 'em' || x.marker === 'bd') && !x.attrs && x.children.every(SIMPLE_INLINE)) ||
  (x.type === 'char' && x.marker === 'jmp' && Object.keys(x.attrs ?? {}).join() === 'link-href' && x.children.every(SIMPLE_INLINE)) ||
  (x.type === 'ms' && x.marker === 'zhtml') || x.type === 'br';
const QUOTE_START = (x: Inline): x is Milestone => x.type === 'ms' && x.marker === 'qt-s' && x.attrs?.['x-quote'] === 'bible';
const QUOTE_END = (x: Inline): boolean => x.type === 'ms' && x.marker === 'qt-e';
const QUOTE_INLINE = (x: Inline): boolean =>
  x.type === 'text' || x.type === 'br' || (x.type === 'char' && ['add', 'nd', 'sup', 'em', 'bd'].includes(x.marker) && !x.attrs && x.children.every(QUOTE_INLINE));

/** Can these \ft / \fp paragraphs be written as Markdown (with optional ```bible quotations)? */
function noteBodyOk(chars: Char[]): boolean {
  let inQuote = false;
  for (const c of chars) {
    let kids = c.children;
    if (kids[0] && QUOTE_START(kids[0])) { if (inQuote) return false; inQuote = true; kids = kids.slice(1); }
    const last = kids[kids.length - 1];
    let ends = false;
    if (last && QUOTE_END(last)) { if (!inQuote) return false; ends = true; kids = kids.slice(0, -1); }
    for (const x of kids) if (!(SIMPLE_INLINE(x) || (inQuote && QUOTE_INLINE(x)))) return false;
    if (ends) inQuote = false;
  }
  return !inQuote;
}

function noteBodyMd(chars: Char[]): string[] {
  const parts: string[] = [];
  let quote: Block[] | null = null; let ref = '';
  for (const c of chars) {
    let kids = c.children;
    if (kids[0] && QUOTE_START(kids[0])) { quote = []; ref = kids[0].attrs?.['x-ref'] ?? ''; kids = kids.slice(1); }
    const last = kids[kids.length - 1];
    let ends = false;
    if (last && QUOTE_END(last)) { ends = true; kids = kids.slice(0, -1); }
    if (quote) {
      quote.push({ type: 'block', marker: 'p', children: kids });
      if (ends) { parts.push('```bible' + (ref ? ' ' + ref : '') + '\n' + quoteToBibleMd(quote) + '\n```'); quote = null; }
    } else parts.push(mdText(kids));
  }
  return parts;
}

function isSimpleNote(n: Note, st: St): boolean {
  if (n.marker !== 'f' || (n.caller && n.caller !== '+')) return false;
  const seen = new Set<string>();
  const body: Char[] = [];
  for (const c of n.children) {
    if (c.type !== 'char' || !['fr', 'fq', 'ft', 'fp'].includes(c.marker) || c.attrs) return false;
    if (c.marker !== 'fp' && seen.has(c.marker)) return false;
    seen.add(c.marker);
    if (c.marker === 'fr' || c.marker === 'fq') { if (c.children.some((x) => x.type !== 'text')) return false; }
    else body.push(c);
  }
  if (!noteBodyOk(body)) return false;
  const fr = n.children.find((c) => c.type === 'char' && c.marker === 'fr');
  if (fr && fr.type === 'char') {
    const v = plainText(fr.children).trim().replace(/[:.\s]+$/, '').replace(/^(\d+)\.(\d)/, '$1:$2');
    if (v !== `${st.chapter}:${st.verse}` && v !== st.chapter) return false;
  }
  return seen.has('ft');
}

function mdText(nodes: Inline[]): string {
  let s = '';
  for (const n of nodes) {
    if (n.type === 'text') {
      s += n.text.replace(/\\/g, '\\\\').replace(/[*_\[\]"']/g, (c) => '\\' + c).replace(/-{2,}/g, (m) => m.split('').map(() => '\\-').join(''))
        .replace(/&(?=#?[A-Za-z0-9]+;)/g, '\\&').replace(/<(?=[A-Za-z\/!])/g, '\\<').replace(/\u00A0/g, '&nbsp;');
    } else if (n.type === 'char') {
      const inner = mdText(n.children);
      if (n.marker === 'em' || n.marker === 'it') s += `*${inner}*`;
      else if (n.marker === 'bd') s += `**${inner}**`;
      else if (n.marker === 'jmp' && n.attrs?.['link-href']) s += `[${inner}](${n.attrs['link-href']})`;
      else s += inner;
    } else if (n.type === 'br') s += '  \n';
    else if (n.type === 'ms' && n.marker === 'zhtml') s += n.attrs?.html ?? '';
  }
  return s;
}

interface FnSpan { type: 'fnspan'; nodes: Inline[] }

const flatLen = (n: Inline): number => (n.type === 'text' ? n.text.length : n.type === 'char' ? plainText(n.children).length : -1);

/** Wrap the words a simple footnote refers to, so they can be written as {words}. */
function wrapRuns(nodes: Inline[], st: St): Array<Inline | FnSpan> {
  const out: Array<Inline | FnSpan> = [];
  let v = st.verse;
  for (const n of nodes) {
    if (n.type === 'verse') v = n.number;
    if (n.type === 'note' && isSimpleNote(n, { ...st, verse: v })) {
      const fqNode = n.children.find((c) => c.type === 'char' && c.marker === 'fq');
      const fq = fqNode && fqNode.type === 'char' ? plainText(fqNode.children) : '';
      if (fq) {
        let k = out.length;
        while (k > 0) { const p = out[k - 1]; if (p.type === 'text' || p.type === 'char') k--; else break; }
        const run = out.slice(k) as Inline[];
        const full = run.map((x) => (x.type === 'text' ? x.text : x.type === 'char' ? plainText(x.children) : '')).join('');
        const stripped = stripTrailingPunct(full);
        if (run.length && stripped.endsWith(fq)) {
          const start = stripped.length - fq.length;
          let acc = 0;
          for (let r = 0; r < run.length; r++) {
            const len = flatLen(run[r]);
            if (start < acc + len || (len === 0 && start === acc)) {
              const node = run[r];
              const off = start - acc;
              if (off === 0) {
                out.splice(k + r, run.length - r, { type: 'fnspan', nodes: run.slice(r) });
              } else if (node.type === 'text') {
                const tail: Inline[] = [{ type: 'text', text: node.text.slice(off) }, ...run.slice(r + 1)];
                out.splice(k + r, run.length - r, { type: 'text', text: node.text.slice(0, off) }, { type: 'fnspan', nodes: tail });
              }
              break;
            }
            acc += len;
          }
        }
      }
    }
    out.push(n);
  }
  return out;
}

function scripture(nodesIn: Inline[], st: St, first: { atStart: boolean }, mode: 'scripture' | 'note' = 'scripture'): string {
  const nodes = (mode === 'scripture' ? wrapRuns(nodesIn, st) : nodesIn) as Array<Inline | FnSpan>;
  let lastKey: string | null = null;
  let out = '';
  let boundary = first.atStart;
  const lineStart = () => boundary && (out === '' || out.endsWith('\n'));
  for (let idx = 0; idx < nodes.length; idx++) {
    const n = nodes[idx];
    const myKey = lastKey; lastKey = null;
    switch (n.type) {
      case 'fnspan': {
        const inner = scripture(n.nodes as Inline[], { ...st, defs: [] }, { atStart: false }, 'scripture');
        out += `{${inner}}`; lastKey = inner; boundary = false;
        break;
      }
      case 'text': {
        const e = escapeScripture(n.text, boundary, boundary && (out === '' ? first.atStart : out.endsWith('\n')), mode === 'note');
        out += e; boundary = /\s$/.test(n.text);
        break;
      }
      case 'verse': {
        st.verse = n.number;
        if (st.pendingChapter !== null) { out += `${st.pendingChapter}:${n.number} `; st.pendingChapter = null; }
        else out += `${n.number} `;
        boundary = true;
        break;
      }
      case 'br': out = out.replace(/ +$/, '') + '  \n'; boundary = true; break;
      case 'ms': out += n.marker === 'zhtml' ? (n.attrs?.html ?? '') : usfmInline([n]); boundary = false; break;
      case 'char': {
        const inner = () => scripture(n.children, st, { atStart: false }, mode);
        if (n.marker === 'add' && !n.attrs) out += `[${inner()}]`;
        else if (n.marker === 'em' && !n.attrs && n.children.length) out += `*${inner()}*`;
        else if (n.marker === 'bd' && !n.attrs && n.children.length) out += `**${inner()}**`;
        else if (n.marker === 'nd' && !n.attrs && n.children.length === 1 && n.children[0].type === 'text' && /^[\p{L}\p{M}]+$/u.test(n.children[0].text)) out += `${n.children[0].text}^`;
        else if (isImplicitChar(n.marker)) out += `\\${n.marker} ${scripture(n.children, st, { atStart: true }, mode)} `;
        else if (isContainer(n.marker)) out += usfmInline([n]);
        else {
          const a = formatAttrs(n.attrs);
          out += `\\${n.marker} ${inner()}${a ? '|' + a : ''}\\${n.marker}*`;
        }
        boundary = false;
        break;
      }
      case 'note': {
        if (mode === 'scripture' && isSimpleNote(n, st)) {
          const key = myKey ?? '';
          if (myKey === null) out += '{}';
          const parts = noteBodyMd(n.children.filter((c): c is Char => c.type === 'char' && (c.marker === 'ft' || c.marker === 'fp')));
          const indent = (t: string) => t.split('\n').map((l) => (l === '' ? l : '  ' + l)).join('\n');
          const lead = parts[0] ?? '';
          let def = lead.startsWith('```') ? `{${key}}:\n${indent(lead)}` : `{${key}}: ${lead}`;
          for (const p of parts.slice(1)) def += '\n\n' + indent(p);
          st.defs.push(def);
        } else {
          out += usfmInline([n]);
        }
        boundary = false;
        break;
      }
      default: break;
    }
  }
  return out;
}

function frontStarts(nodes: Inline[]): boolean { return nodes.length > 0 && nodes[0].type === 'verse'; }

const HEADING: Record<string, string> = { mt1: '#', ms1: '##', s1: '###', s2: '####', s3: '#####', s4: '######' };

export interface BibleMdWriteOptions { /** unused, reserved */ _?: never }

export function serializeBibleMd(doc: Doc): string {
  const chunks: string[] = [];
  const meta = [...doc.meta];
  const first = doc.books[0];
  if (first && first.idText && !meta.some(([k]) => k === 'Version')) meta.unshift(['Version', first.idText]);
  if (meta.length) chunks.push(meta.map(([k, v]) => `${k}: ${v}`).join('\n'));

  for (const book of doc.books) {
    const st: St = { chapter: '', verse: '', pendingChapter: null, defs: [] };
    const nodes = book.blocks.slice();
    // heading
    const txt = (m: string) => { const b = nodes.find((n) => n.type === 'block' && n.marker === m) as Block | undefined; return b ? plainText(b.children).trim() : ''; };
    const name = txt('h') || txt('toc1') || txt('mt1');
    let rest = nodes;
    if (book.id) {
      const drop = new Set<Node>();
      for (const m of ['h', 'toc1', 'mt1']) {
        const b = nodes.find((n) => n.type === 'block' && n.marker === m) as Block | undefined;
        if (b && plainText(b.children).trim() === name) drop.add(b);
      }
      rest = nodes.filter((n) => !drop.has(n));
      chunks.push(`# ${(name || book.id).replace(/\\/g, '\\\\').replace(/[()]/g, (c) => '\\' + c)} (${book.id})`);
    }
    writeNodes(rest, st, chunks);
  }
  return chunks.join('\n\n') + '\n';
}

const MD_INTRO = /^(?:ip|ipq|is[12]|ili[1-4])$/;
const MD_SIDE = /^(?:p|pi1|s[1-4]|li[1-4])$/;
const CELL = /^(?:th|tc)[1-5]$/;
const mdInlineOk = (nodes: Inline[]): boolean =>
  nodes.every((x) => x.type === 'text' || x.type === 'br' || (x.type === 'ms' && x.marker === 'zhtml') ||
    (x.type === 'char' && (x.marker === 'em' || x.marker === 'bd' || (x.marker === 'jmp' && Object.keys(x.attrs ?? {}).join() === 'link-href')) && !(x.marker !== 'jmp' && x.attrs) && mdInlineOk(x.children)));

/** Turn a quotation's blocks back into Bible Markdown (verse superscripts become verse numbers again). */
function quoteToBibleMd(inner: Block[]): string {
  const conv = (inl: Inline[]): Inline[] => {
    const r: Inline[] = [];
    for (let k = 0; k < inl.length; k++) {
      const n = inl[k];
      if (n.type === 'char' && n.marker === 'sup' && n.children.length === 1 && n.children[0].type === 'text' && /^\d+[a-z]?(?:-\d+[a-z]?)?$/.test(n.children[0].text)) {
        r.push({ type: 'verse', number: n.children[0].text });
        const nx = inl[k + 1];
        if (nx && nx.type === 'text') { r.push({ ...nx, text: nx.text.replace(/^ /, '') }); k++; }
      } else if (n.type === 'char') r.push({ ...n, children: conv(n.children) });
      else r.push(n);
    }
    return r;
  };
  const blocks = inner.map((b) => ({ ...b, children: conv(b.children) }));
  const chunks: string[] = [];
  writeNodes(blocks, { chapter: '', verse: '', pendingChapter: null, defs: [] }, chunks);
  return chunks.join('\n\n');
}

function table(rows: Block[]): string | null {
  const grid: { head: boolean; cells: string[] }[] = [];
  for (const r of rows) {
    const cells: string[] = []; let head = false;
    for (const c of r.children) {
      if (c.type !== 'char' || !CELL.test(c.marker) || !mdInlineOk(c.children)) return null;
      if (c.marker.startsWith('th')) head = true;
      cells.push(mdText(c.children).replace(/\|/g, '\\|').replace(/\n/g, ' '));
    }
    grid.push({ head, cells });
  }
  const cols = Math.max(...grid.map((g) => g.cells.length), 1);
  const row = (cells: string[]) => '| ' + Array.from({ length: cols }, (_, k) => cells[k] ?? '').join(' | ') + ' |';
  const hasHead = grid[0].head;
  const lines = [row(hasHead ? grid[0].cells : []), row(Array(cols).fill('---'))];
  for (const g of hasHead ? grid.slice(1) : grid) lines.push(row(g.cells));
  return lines.join('\n');
}

/** Explanatory text as regular Markdown. Returns null when some block cannot be expressed that way. */
function mdRun(blocks: Block[], intro: boolean): string | null {
  const out: string[] = []; let prevList = false;
  const add = (t: string, list = false) => { if (out.length) out.push(prevList && list ? '\n' : '\n\n'); out.push(t); prevList = list; };
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.marker === 'qt-s') {
      let j = i + 1;
      while (j < blocks.length && blocks[j].marker !== 'qt-e') j++;
      const ref = b.attrs?.['x-ref'] ? ' ' + b.attrs['x-ref'] : '';
      add('```bible' + ref + '\n' + quoteToBibleMd(blocks.slice(i + 1, j)) + '\n```');
      i = j; continue;
    }
    if (b.marker === 'qt-e') continue;
    if (b.marker === 'zhtmlb') { add(b.attrs?.html ?? ''); continue; }
    if (b.marker === 'tr') {
      const rows: Block[] = [];
      while (i < blocks.length && blocks[i].marker === 'tr') rows.push(blocks[i++]);
      i--;
      const t = table(rows);
      if (t === null) return null;
      add(t); continue;
    }
    if (!(intro ? MD_INTRO : MD_SIDE).test(b.marker) || !mdInlineOk(b.children)) return null;
    const t = mdText(b.children).trim();
    const lm = /^(?:ili|li)(\d)$/.exec(b.marker);
    if (lm) {
      const pad = '  '.repeat(Number(lm[1]) - 1);
      add(/^\d+[.)]\s/.test(t) ? pad + t : `${pad}- ${t}`, true);
      continue;
    }
    const hm = /^(?:is|s)(\d)$/.exec(b.marker);
    if (hm) { add(`${'#'.repeat(Number(hm[1]))} ${t}`); continue; }
    const lead = t.replace(/^(\d+)([.)])(\s)/, '$1\\$2$3').replace(/^([-+*>#])(?=\s|$)/, '\\$1');
    add(b.marker === 'ipq' || b.marker === 'pi1' ? `> ${lead}` : lead);
  }
  return out.join('');
}

const fence = (body: string): string => {
  const f = '>'.repeat(10);
  return `${f}\n${body.replace(/^\n+|\n+$/g, '')}\n${f}`;
};

function writeNodes(nodes: Node[], st: St, chunks: string[]) {
  let i = 0;
  let introFenced = false;
  const flushDefs = () => { if (st.defs.length) { chunks.push(st.defs.join('\n')); st.defs = []; } };
  const isPoetry = (n: Node | undefined): boolean => !!n && n.type === 'block' && /^q[1-4]$/.test(n.marker);
  const introReady = () => !nodes.some((n, k) => n.type === 'chapter' && k < i);
  const introStart = (n: Node) => n.type === 'block' && (MD_INTRO.test(n.marker) || n.marker === 'qt-s');
  const introMember = (n: Node) => n.type === 'block' && (MD_INTRO.test(n.marker) || n.marker === 'zhtmlb' || n.marker === 'tr');

  while (i < nodes.length) {
    const n = nodes[i];

    if (n.type === 'chapter') {
      st.chapter = n.number; st.verse = '';
      const next = nodes[i + 1];
      const extra = n.children.length ? ' ' + usfmInline(n.children) : '';
      if (!extra && next && next.type === 'block' && frontStarts(next.children) && (next.marker === 'p' || isPoetry(next))) {
        st.pendingChapter = n.number; i++; continue;
      }
      chunks.push(`\\c ${n.number}${extra}`.replace(/^\\c (\d+)$/, '$1:'));
      i++; continue;
    }

    if (n.type === 'sidebar') {
      const r = mdRun(n.blocks, false);
      if (r !== null) chunks.push(fence(r));
      else { chunks.push('\\esb'); writeNodes(n.blocks, st, chunks); chunks.push('\\esbe'); }
      i++; continue;
    }

    // introduction, or a quotation outside any explanatory block
    if (n.type === 'block' && ((introReady() && introStart(n)) || n.marker === 'qt-s')) {
      const run: Block[] = [];
      const intro = introReady();
      while (i < nodes.length) {
        const m = nodes[i];
        if (m.type !== 'block') break;
        if (m.marker === 'qt-s') {
          while (i < nodes.length && nodes[i].type === 'block' && (nodes[i] as Block).marker !== 'qt-e') run.push(nodes[i++] as Block);
          if (i < nodes.length && nodes[i].type === 'block') run.push(nodes[i++] as Block);
        } else if (intro ? introMember(m) : false) run.push(nodes[i++] as Block);
        else break;
      }
      const r = mdRun(run, intro);
      if (r !== null) { chunks.push(fence(r)); introFenced = intro; }
      else for (const b of run) chunks.push(b.children.length ? `\\${b.marker} ${scripture(b.children, st, { atStart: true })}` : `\\${b.marker}`);
      continue;
    }

    if (n.type !== 'block') { i++; continue; }

    if (n.marker === 'ie') { if (!introFenced) chunks.push('\\ie'); introFenced = false; i++; continue; }

    if (n.marker === 'zhtmlb') { chunks.push(n.attrs?.html ?? ''); i++; continue; }
    if (n.marker === 'qt-e') { i++; continue; }

    const lm = /^li([1-4])$/.exec(n.marker);
    if (lm) {
      const lines: string[] = [];
      while (i < nodes.length) {
        const x = nodes[i];
        const mm = x.type === 'block' ? /^li([1-4])$/.exec(x.marker) : null;
        if (!mm || x.type !== 'block') break;
        let kids = x.children; let prefix = '- ';
        const f0 = kids[0];
        if (f0 && f0.type === 'text') {
          const om = /^(\d+[.)])\s+/.exec(f0.text);
          if (om) { prefix = om[1] + ' '; kids = [{ ...f0, text: f0.text.slice(om[0].length) }, ...kids.slice(1)]; }
        }
        lines.push('  '.repeat(Number(mm[1]) - 1) + prefix + scripture(kids, st, { atStart: true }));
        i++;
      }
      chunks.push(lines.join('\n'));
      flushDefs();
      continue;
    }

    if (isPoetry(n)) {
      const run: Block[] = [];
      while (i < nodes.length && isPoetry(nodes[i])) { run.push(nodes[i] as Block); i++; }
      const levels = [...new Set(run.map((b) => Number(b.marker[1])))].sort((a, b) => a - b);
      const slash = levels.every((l, k) => l === k + 1);
      const lines = run.map((b) => {
        const lvl = Number(b.marker[1]);
        const body = scripture(b.children, st, { atStart: true });
        return slash ? '/' + ' '.repeat(1 + 2 * (lvl - 1)) + body : `\\${b.marker} ${body}`.trimEnd();
      });
      chunks.push(lines.join('\n'));
      flushDefs();
      if (nodes[i] && nodes[i].type === 'block' && (nodes[i] as Block).marker === 'b' && isPoetry(nodes[i + 1])) i++;
      continue;
    }

    if (HEADING[n.marker]) {
      chunks.push(`${HEADING[n.marker]} ${scripture(n.children, st, { atStart: false }, 'note').replace(/^\s+/, '')}`.trimEnd());
      i++; continue;
    }

    const body = scripture(n.children, st, { atStart: true });
    if (n.marker === 'p') { if (body) chunks.push(body); }
    else chunks.push(body ? `\\${n.marker} ${body}` : `\\${n.marker}`);
    flushDefs();
    i++;
  }
  flushDefs();
}
