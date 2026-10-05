import { Block, Book, Char, Doc, Inline, Node, Note, plainText } from './model.js';
import { isImplicitChar } from './markers.js';

export interface HtmlOptions {
  /** Output only the <article> elements, with no <html> wrapper (used for previews). */
  fragment?: boolean;
  /** Add data-line attributes so a preview can sync with the editor. */
  sourceLines?: boolean;
  /** Stylesheet to link in the head. */
  css?: string;
  title?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => esc(s).replace(/"/g, '&quot;');
const attrName = (k: string) => 'data-' + k.replace(/[^A-Za-z0-9_-]/g, '-');
const dataAttrs = (a?: Record<string, string>, skip: string[] = []) =>
  a ? Object.entries(a).filter(([k]) => !skip.includes(k)).map(([k, v]) => ` ${attrName(k)}="${escAttr(v)}"`).join('') : '';

function letters(n: number): string {
  let s = '';
  while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

/** An HTML element is used only where its meaning is the same as the USFM marker's; everything else is a <span>. */
const SPAN_TAGS: Record<string, string> = {
  em: 'em',      // emphasis
  bd: 'b',       // bold (presentational, so <b> not <strong>)
  it: 'i',       // italic
  sup: 'sup',    // superscript
  bk: 'cite',    // quoted book title
  rq: 'cite',    // reference to the source of a quotation
  tl: 'i',       // transliterated or foreign words
  k: 'b',        // keyword
};

class BookWriter {
  out: string[] = [];
  chapter = '';
  chapterOpen = false;
  fn = 0; xr = 0;
  fnItems: string[] = []; xItems: string[] = []; endItems: string[] = [];
  used = new Set<string>();
  articleCl = '';
  constructor(private book: Book, private opts: HtmlOptions) {}

  id(base: string): string {
    let id = base, n = 1;
    while (this.used.has(id)) id = `${base}-${++n}`;
    this.used.add(id);
    return id;
  }

  scope() { return `${this.book.id || 'X'}.${this.chapter || '0'}`; }

  inline(nodes: Inline[]): string {
    let s = '';
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      switch (n.type) {
        case 'text': s += esc(n.text); break;
        case 'br': s += '<br/>'; break;
        case 'verse': {
          const first = n.number.split('-')[0];
          const id = this.chapter ? ` id="${this.id(`${this.book.id}.${this.chapter}.${first}`)}"` : '';
          const nx = nodes[i + 1];
          let inner = esc(n.number);
          if (nx && nx.type === 'char' && nx.marker === 'vp') { inner = `<span class="vp">${esc(plainText(nx.children))}</span>`; i++; }
          s += `<sup class="v"${id} data-v="${escAttr(n.number)}">${inner}</sup> `;
          break;
        }
        case 'ms': s += n.marker === 'zhtml' ? (n.attrs?.html ?? '') : `<span class="${n.marker}"${/-[se]$|^ts$/.test(n.marker) ? '' : ' data-milestone=""'}${dataAttrs(n.attrs)}></span>`; break;
        case 'note': s += this.note(n); break;
        case 'char': s += this.char(n); break;
        default: break;
      }
    }
    return s;
  }

  char(n: Char): string {
    const m = n.marker;
    const inner = this.inline(n.children);
    if (m === 'va') return `<sup class="va">(${esc(plainText(n.children))})</sup>`;
    if (m === 'ca') return `<span class="ca">(${esc(plainText(n.children))})</span>`;
    if (m === 'bdit') return `<b class="bdit"${dataAttrs(n.attrs)}><i>${inner}</i></b>`;
    if (m === 'fig') {
      const a = n.attrs ?? {};
      return `<span class="fig" role="figure"${dataAttrs(n.attrs)}><img src="${escAttr(a.src ?? '')}" alt="${escAttr(a.alt ?? plainText(n.children))}"><span class="caption">${inner}</span></span>`;
    }
    if (m === 'rb') return `<ruby class="rb">${inner}<rt>${esc(n.attrs?.gloss ?? '')}</rt></ruby>`;
    if (m === 'jmp') return `<a class="jmp" href="${escAttr(n.attrs?.['link-href'] ?? '')}"${dataAttrs(n.attrs, ['link-href'])}>${inner}</a>`;
    if (m === 'w' || m === 'wg' || m === 'wh' || m === 'wa') {
      return `<span class="w"${m !== 'w' ? ` data-wtype="${m}"` : ''}${dataAttrs(n.attrs)}>${inner}</span>`;
    }
    const tag = SPAN_TAGS[m] ?? 'span';
    return `<${tag} class="${m}"${dataAttrs(n.attrs)}>${inner}</${tag}>`;
  }

  note(n: Note): string {
    const isX = n.marker === 'x' || n.marker === 'ex';
    const isEnd = n.marker === 'fe';
    const num = isX ? ++this.xr : ++this.fn;
    const base = isEnd ? `${this.book.id}.fe` : `${this.scope()}.${isX ? 'xr' : 'fn'}`;
    const noteId = this.id(`${base}${num}`);
    const refId = this.id(`${base.replace(/\.(fn|xr|fe)$/, '')}${isX ? '.xrref' : isEnd ? '.feref' : '.fnref'}${num}`);
    const caller = n.caller || '+';
    const letter = letters(num);
    const body = n.children.map((c) => (c.type === 'char' && isImplicitChar(c.marker) ? this.char(c) : this.inline([c]))).join(' ');
    const cls = n.marker;
    const li = `<li class="${cls}" id="${noteId}" data-caller="${escAttr(caller)}">${body}</li>`;
    (isEnd ? this.endItems : isX ? this.xItems : this.fnItems).push(li);
    return `<sup class="caller" id="${refId}"${caller === '-' ? ' hidden' : ''}><a href="#${noteId}">${letter}</a></sup>`;
  }

  notesAside(items: { f: string[]; x: string[] }): string {
    if (!items.f.length && !items.x.length) return '';
    let s = '<aside class="notes">';
    if (items.f.length) s += `<ol class="f">${items.f.join('')}</ol>`;
    if (items.x.length) s += `<ol class="x">${items.x.join('')}</ol>`;
    return s + '</aside>';
  }

  flushNotes() {
    const a = this.notesAside({ f: this.fnItems, x: this.xItems });
    if (a) this.out.push(a);
    this.fnItems = []; this.xItems = [];
  }

  periphOpen = false;
  closePeriph() { if (this.periphOpen) { this.out.push('</section>'); this.periphOpen = false; } }

  closeChapter() {
    this.closePeriph();
    if (this.chapterOpen) { this.flushNotes(); this.out.push('</section>'); this.chapterOpen = false; }
  }

  dl(b: { line?: number }) { return this.opts.sourceLines && b.line ? ` data-line="${b.line}"` : ''; }

  blocks(nodes: Node[]) {
    let i = 0;
    while (i < nodes.length) {
      const n = nodes[i];
      if (n.type === 'chapter') {
        this.closeChapter();
        if (!this.chapterOpen && (this.fnItems.length || this.xItems.length)) this.flushNotes();
        this.chapter = n.number; this.fn = 0; this.xr = 0;
        let cp = ''; let cl = '';
        let j = i + 1;
        while (j < nodes.length) {
          const m = nodes[j];
          if (m.type === 'block' && m.marker === 'cp') { cp = this.inline(m.children); j++; }
          else if (m.type === 'block' && m.marker === 'cl') { cl = this.inline(m.children); j++; }
          else break;
        }
        let head: string;
        if (cp) head = `<span class="cp">${cp}</span>`;
        else if (cl) head = `<span class="cl">${cl}</span>`;
        else head = (this.articleCl ? `<span class="cl">${esc(this.articleCl)}</span> ` : '') + esc(n.number);
        const ca = n.children.length ? ' ' + this.inline(n.children) : '';
        const sid = this.id(`${this.book.id}.${n.number}`);
        this.out.push(`<section class="c" id="${sid}" data-c="${escAttr(n.number)}"${this.dl(n)}>`);
        this.chapterOpen = true;
        this.out.push(`<h2 class="cn">${head}${ca}</h2>`);
        i = j; continue;
      }
      if (n.type === 'sidebar') {
        const w = new BookWriter(this.book, this.opts);
        w.used = this.used; w.chapter = this.chapter; w.fn = this.fn; w.xr = this.xr;
        w.blocks(n.blocks);
        this.fn = w.fn; this.xr = w.xr;
        this.fnItems.push(...w.fnItems); this.xItems.push(...w.xItems);
        this.out.push(`<aside class="esb"${this.dl(n)}>${w.out.join('\n')}</aside>`);
        i++; continue;
      }
      const m = n.marker;
      // grouped titles
      const tg = /^(mt|imt)\d$/.exec(m);
      if (tg) {
        const fam = tg[1]; const spans: string[] = [];
        while (i < nodes.length) {
          const x = nodes[i];
          if (x.type === 'block' && new RegExp(`^${fam}\\d$`).test(x.marker)) { spans.push(`<span class="${x.marker}">${this.inline(x.children)}</span>`); i++; } else break;
        }
        this.out.push(`<h1 class="${fam}">${spans.join('\n')}</h1>`); continue;
      }
      const mg = /^mte\d$/.exec(m);
      if (mg) {
        const spans: string[] = [];
        while (i < nodes.length) {
          const x = nodes[i];
          if (x.type === 'block' && /^mte\d$/.test(x.marker)) { spans.push(`<span class="${x.marker}">${this.inline(x.children)}</span>`); i++; } else break;
        }
        this.out.push(`<p class="mte">${spans.join('\n')}</p>`); continue;
      }
      const lf = /^(lim|ili|li|io)\d$/.exec(m);
      if (lf) {
        const fam = lf[1]; const items: Block[] = [];
        while (i < nodes.length) {
          const x = nodes[i];
          if (x.type === 'block' && new RegExp(`^${fam}\\d$`).test(x.marker)) { items.push(x); i++; } else break;
        }
        this.out.push(this.list(items, fam)); continue;
      }
      if (m === 'tr') {
        const rows: { html: string; head: boolean }[] = [];
        while (i < nodes.length) {
          const x = nodes[i];
          if (x.type === 'block' && x.marker === 'tr') { rows.push(this.row(x)); i++; } else break;
        }
        let h = 0;
        while (h < rows.length && rows[h].head) h++;
        const head = h ? `<thead>${rows.slice(0, h).map((r) => r.html).join('')}</thead>` : '';
        const rest = rows.slice(h).map((r) => r.html).join('');
        this.out.push(`<table class="table">${head}${h ? `<tbody>${rest}</tbody>` : rest}</table>`); continue;
      }
      if (m === 'periph') {
        this.closePeriph();
        const t = plainText(n.children);
        const bar = t.lastIndexOf('|');
        const title = bar >= 0 ? t.slice(0, bar) : t;
        const idm = bar >= 0 ? /id="([^"]*)"/.exec(t.slice(bar + 1)) : null;
        this.out.push(`<section class="periph"${idm ? ` data-periph="${escAttr(idm[1])}"` : ''}${this.dl(n)}><h2 class="periph-title">${esc(title.trim())}</h2>`);
        this.periphOpen = true; i++; continue;
      }
      this.out.push(this.block(n)); i++;
    }
  }

  list(items: Block[], fam: string): string {
    let html = ''; let depth = 0; const open: boolean[] = [];
    for (const it of items) {
      const lvl = Number(it.marker.slice(fam.length)) || 1;
      while (depth > lvl) { if (open[depth]) html += '</li>'; html += '</ul>'; open[depth] = false; depth--; }
      if (depth === lvl && open[depth]) { html += '</li>'; open[depth] = false; }
      while (depth < lvl) { html += `<ul class="${fam}">`; depth++; open[depth] = false; }
      html += `<li class="${it.marker}"${this.dl(it)}>${this.inline(it.children)}`; open[depth] = true;
    }
    while (depth > 0) { if (open[depth]) html += '</li>'; html += '</ul>'; depth--; }
    return html;
  }

  row(b: Block): { html: string; head: boolean } {
    let s = '<tr>';
    let cells = 0; let heads = 0;
    for (const c of b.children) {
      if (c.type !== 'char') continue;
      const m = /^(th|thr|tc|tcr|tcc)(\d+)(?:-(\d+))?$/.exec(c.marker);
      if (!m) continue;
      const tag = m[1].startsWith('th') ? 'th' : 'td';
      cells++; if (tag === 'th') heads++;
      const span = m[3] ? ` colspan="${Number(m[3]) - Number(m[2]) + 1}" data-cols="${m[2]}-${m[3]}"` : '';
      s += `<${tag} class="${c.marker}"${span}>${this.inline(c.children)}</${tag}>`;
    }
    return { html: s + '</tr>', head: cells > 0 && heads === cells };
  }

  block(b: Block): string {
    const m = b.marker;
    const c = this.inline(b.children);
    const dl = this.dl(b);
    const text = plainText(b.children).replace(/--/g, '- -');
    if (m === 'zhtmlb') return b.attrs?.html ?? '';
    if (m === 'qt-s') return `<blockquote class="qt"${dataAttrs(b.attrs)}>`;
    if (m === 'qt-e') return '</blockquote>';
    if (m === 'rem') return `<!-- ${text} -->`;
    if (m === 'sts' || m === 'nb' || m === 'ide' || m === 'usfm') return `<!-- \\${m}${text ? ' ' + text : ''} -->`;
    if (m === 'h' || /^h\d$/.test(m)) return `<p class="${m}" hidden${dl}>${c}</p>`;
    if (/^toca?\d$/.test(m)) return `<span class="${m}" hidden>${c}</span>`;
    if (m === 'b' || m === 'ib' || m === 'ie' || /^sd\d?$/.test(m)) return `<div class="${m}"${dl}></div>`;
    if (m === 'p') return `<p${dl}>${c}</p>`;
    if (/^ms\d$/.test(m)) return `<h2 class="${m}"${dl}>${c}</h2>`;
    const s = /^s(\d)$/.exec(m);
    if (s) return `<h${Math.min(2 + Number(s[1]), 6)} class="${m}"${dl}>${c}</h${Math.min(2 + Number(s[1]), 6)}>`;
    const is = /^is(\d)$/.exec(m);
    if (is) return `<h${2 + Number(is[1])} class="${m}"${dl}>${c}</h${2 + Number(is[1])}>`;
    if (m === 'iot') return `<h3 class="iot"${dl}>${c}</h3>`;
    if (m === 'qa') return `<h4 class="qa"${dl}>${c}</h4>`;
    return `<p class="${m}"${dl}>${c}</p>`;
  }

  render(): string {
    const b = this.book;
    const nodes = b.blocks.filter((n) => {
      if (n.type === 'block' && n.marker === 'cl' && !b.blocks.slice(0, b.blocks.indexOf(n)).some((x) => x.type === 'chapter')) {
        this.articleCl = plainText(n.children); return false;
      }
      return true;
    });
    this.blocks(nodes);
    this.closeChapter();
    this.closePeriph();
    this.flushNotes();
    if (this.endItems.length) this.out.push(`<aside class="notes"><ol class="fe">${this.endItems.join('')}</ol></aside>`);
    const cl = this.articleCl ? ` data-cl="${escAttr(this.articleCl)}"` : '';
    return `<article class="id" id="${escAttr(b.id)}" data-id="${escAttr(b.id)}"${b.idText ? ` data-id-text="${escAttr(b.idText)}"` : ''}${cl}>\n${this.out.join('\n')}\n</article>`;
  }
}

export function serializeBibleHtml(doc: Doc, opts: HtmlOptions = {}): string {
  const articles = doc.books.map((b) => new BookWriter(b, opts).render());
  if (opts.fragment) return articles.join('\n');
  const first = doc.books[0];
  const name = (m: string) => { const b = first?.blocks.find((n) => n.type === 'block' && n.marker === m) as Block | undefined; return b ? plainText(b.children).trim() : ''; };
  const title = opts.title ?? (name('h') || name('toc1') || name('mt1') || first?.id || 'Bible');
  const lang = doc.meta.find(([k]) => k.toLowerCase() === 'language')?.[1] ?? 'en';
  const metas = doc.meta.map(([k, v]) => {
    const lower = k.toLowerCase().replace(/\s+/g, '-');
    return `  <meta name="${escAttr(lower)}" content="${escAttr(v)}"${lower !== k ? ` data-key="${escAttr(k)}"` : ''}>`;
  });
  return [
    '<!DOCTYPE html>',
    `<html lang="${escAttr(lang)}">`,
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="bible-html" content="0.5">',
    `  <title>${esc(title)}</title>`,
    ...metas,
    ...(opts.css ? [`  <link rel="stylesheet" href="${escAttr(opts.css)}">`] : []),
    '</head>',
    '<body>',
    articles.join('\n'),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
