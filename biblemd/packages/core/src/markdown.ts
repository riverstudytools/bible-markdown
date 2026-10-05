/**
 * Regular Markdown regions (explanatory text, footnote bodies) are read with markdown-it
 * and mapped onto the shared document model.
 */
import MarkdownIt from 'markdown-it';
import { Block, Char, Diagnostic, Inline, text } from './model.js';
import { protect, smart, unprotect } from './typography.js';

type Token = ReturnType<MarkdownIt['parse']>[number];

export interface MdEnv {
  typography: boolean;
  diag: (severity: Diagnostic['severity'], message: string, line: number, code?: string) => void;
  /** Parse a nested ```bible fence. Returns the blocks of the quoted passage. */
  parseBible: (src: string, line: number) => Block[];
  /** A fresh id for pairing the start and end milestones of a quotation. */
  nextQuoteId: () => string;
}

const md = new MarkdownIt({ html: true, linkify: false, typographer: false });

/** Backslash-escaped quotes and hyphens must survive typographic conversion. */
const preprocess = (src: string) => src.replace(/\\(["'-])/g, (_, c: string) => protect(c));

function convertInline(tok: Token | undefined, env: MdEnv): Inline[] {
  const root: Inline[] = [];
  if (!tok || !tok.children) return root;
  const stack: Char[] = [];
  const top = () => (stack.length ? stack[stack.length - 1].children : root);
  let last = '';
  const addText = (s: string) => {
    let t = s;
    if (env.typography) t = smart(t, last);
    t = unprotect(t);
    if (t) { top().push(text(t)); last = t[t.length - 1]; }
  };
  for (const c of tok.children) {
    switch (c.type) {
      case 'text': addText(c.content); break;
      case 'softbreak': top().push(text(' ')); last = ' '; break;
      case 'hardbreak': top().push({ type: 'br' }); last = ' '; break;
      case 'code_inline': top().push(text(unprotect(c.content))); last = c.content.slice(-1); break;
      case 'strong_open': { const n: Char = { type: 'char', marker: 'bd', children: [] }; top().push(n); stack.push(n); break; }
      case 'em_open': { const n: Char = { type: 'char', marker: 'em', children: [] }; top().push(n); stack.push(n); break; }
      case 'link_open': {
        const n: Char = { type: 'char', marker: 'jmp', attrs: { 'link-href': c.attrGet('href') ?? '' }, children: [] };
        top().push(n); stack.push(n); break;
      }
      case 'strong_close': case 'em_close': case 'link_close': stack.pop(); break;
      case 'image': top().push(text(c.content)); break;
      case 'html_inline':
        if (/^<br\s*\/?>$/i.test(c.content)) top().push({ type: 'br' });
        else top().push({ type: 'ms', marker: 'zhtml', attrs: { html: c.content } });
        break;
      default: break; // strikethrough and other unsupported inline wrappers keep their text
    }
  }
  return root;
}

const lineOf = (t: Token | undefined, line0: number) => line0 + (t?.map?.[0] ?? 0);

export function mdBlocks(src: string, intro: boolean, env: MdEnv, line0: number): Block[] {
  const tokens = md.parse(preprocess(src), {});
  const out: Block[] = [];
  const P = intro ? 'ip' : 'p';
  const lists: { ordered: boolean }[] = [];
  let quote = 0;
  let firstInItem: { marker: string; prefix: string } | null = null;
  let tableRow: Inline[] | null = null;
  let inHead = false; let cellN = 0;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.type) {
      case 'heading_open': {
        const level = Number(t.tag.slice(1));
        const inl = convertInline(tokens[i + 1], env);
        out.push({ type: 'block', marker: (intro ? 'is' : 's') + Math.min(level, intro ? 2 : 4), children: inl, line: lineOf(t, line0) });
        i += 2; break;
      }
      case 'paragraph_open': {
        const inl = convertInline(tokens[i + 1], env);
        let marker = quote ? (intro ? 'ipq' : 'pi1') : P;
        if (firstInItem) {
          marker = firstInItem.marker;
          if (firstInItem.prefix) inl.unshift(text(firstInItem.prefix));
          firstInItem = null;
        }
        out.push({ type: 'block', marker, children: inl, line: lineOf(t, line0) });
        i += 2; break;
      }
      case 'bullet_list_open': lists.push({ ordered: false }); break;
      case 'ordered_list_open': lists.push({ ordered: true }); break;
      case 'bullet_list_close': case 'ordered_list_close': lists.pop(); break;
      case 'list_item_open': {
        const depth = Math.min(lists.length, 4);
        const ordered = lists[lists.length - 1]?.ordered;
        firstInItem = { marker: (intro ? 'ili' : 'li') + depth, prefix: ordered ? `${t.info}${t.markup} ` : '' };
        break;
      }
      case 'list_item_close': firstInItem = null; break;
      case 'blockquote_open': quote++; break;
      case 'blockquote_close': quote--; break;
      case 'hr': out.push({ type: 'block', marker: 'b', children: [], line: lineOf(t, line0) }); break;
      case 'fence': case 'code_block': {
        const info = (t.info ?? '').trim();
        const m = /^bible\b\s*(.*)$/i.exec(info);
        const ln = lineOf(t, line0) + 1;
        if (t.type === 'fence' && m) {
          const ref = m[1].trim();
          const sid = env.nextQuoteId();
          out.push({ type: 'block', marker: 'qt-s', children: [], attrs: { sid, 'x-quote': 'bible', ...(ref ? { 'x-ref': ref } : {}) }, line: ln - 1 });
          out.push(...env.parseBible(t.content, ln));
          out.push({ type: 'block', marker: 'qt-e', children: [], attrs: { eid: sid } });
        } else {
          const esc = t.content.replace(/\n$/, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          out.push({ type: 'block', marker: 'zhtmlb', children: [], attrs: { html: `<pre><code>${esc}</code></pre>` }, line: ln - 1 });
        }
        break;
      }
      case 'html_block':
        out.push({ type: 'block', marker: 'zhtmlb', children: [], attrs: { html: t.content.replace(/\n+$/, '') }, line: lineOf(t, line0) });
        break;
      case 'thead_open': inHead = true; break;
      case 'thead_close': inHead = false; break;
      case 'tr_open': tableRow = []; cellN = 0; break;
      case 'tr_close':
        if (tableRow) out.push({ type: 'block', marker: 'tr', children: tableRow, line: lineOf(t, line0) });
        tableRow = null; break;
      case 'th_open': case 'td_open': {
        cellN++;
        const kids = convertInline(tokens[i + 1], env);
        tableRow?.push({ type: 'char', marker: `${inHead ? 'th' : 'tc'}${Math.min(cellN, 5)}`, children: kids });
        i += 2; break;
      }
      default: break;
    }
  }
  return out;
}

/** A footnote body: the first paragraph is `\ft`, further paragraphs and list items are `\fp`. A ```bible fence becomes `\fp` paragraphs between `\qt-s` and `\qt-e` milestones (poetry lines become line breaks). */
export function mdNoteBody(src: string, env: MdEnv, line0: number): Inline[] {
  const tokens = md.parse(preprocess(src), {});
  const parts: Inline[][] = [];
  const lists: { ordered: boolean }[] = [];
  let prefix = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'bullet_list_open') lists.push({ ordered: false });
    else if (t.type === 'ordered_list_open') lists.push({ ordered: true });
    else if (t.type === 'bullet_list_close' || t.type === 'ordered_list_close') lists.pop();
    else if (t.type === 'list_item_open') prefix = lists[lists.length - 1]?.ordered ? `${t.info}${t.markup} ` : '- ';
    else if (t.type === 'paragraph_open' || t.type === 'heading_open') {
      const inl = convertInline(tokens[i + 1], env);
      if (prefix) { inl.unshift(text(prefix)); prefix = ''; }
      parts.push(inl); i += 2;
    } else if (t.type === 'fence' && /^bible\b/i.test((t.info ?? '').trim())) {
      const ref = (t.info ?? '').trim().replace(/^bible\b\s*/i, '');
      const sid = env.nextQuoteId();
      const blocks = env.parseBible(t.content, line0 + (t.map?.[0] ?? 0) + 1);
      const q: Inline[][] = []; let poetry: Inline[] | null = null;
      for (const b of blocks) {
        if (/^q[1-4]$/.test(b.marker)) {
          if (poetry) { poetry.push({ type: 'br' }, ...b.children); } else { poetry = [...b.children]; q.push(poetry); }
          continue;
        }
        poetry = null;
        if (b.marker === 'b') continue;
        q.push([...b.children]);
      }
      if (!q.length) q.push([]);
      q[0].unshift({ type: 'ms', marker: 'qt-s', attrs: { sid, 'x-quote': 'bible', ...(ref ? { 'x-ref': ref } : {}) } });
      q[q.length - 1].push({ type: 'ms', marker: 'qt-e', attrs: { eid: sid } });
      parts.push(...q);
    } else if (t.type === 'fence' || t.type === 'code_block') {
      parts.push([text(t.content.replace(/\n$/, ''))]);
    } else if (t.type === 'html_block') {
      parts.push([{ type: 'ms', marker: 'zhtml', attrs: { html: t.content.replace(/\n+$/, '') } }]);
    }
  }
  void line0;
  if (!parts.length) parts.push([]);
  return parts.map((p, k) => ({ type: 'char', marker: k === 0 ? 'ft' : 'fp', children: p } as Char));
}
