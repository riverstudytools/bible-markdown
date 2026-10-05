import { Block, Char, Doc, Inline, Node } from './model.js';
import { DEFAULT_NOISY_ATTRS, DEFAULT_NOISY_MARKERS, isImplicitChar, isNoTextBlock } from './markers.js';

export type Fidelity = 'full' | 'readable' | 'minimal';

export interface FidelityOptions {
  level: Fidelity;
  /** Markers dropped (keeping their text) at the Readable level. */
  noisyMarkers?: string[];
  /** Attributes dropped at the Readable level. */
  noisyAttrs?: string[];
}

const NATIVE_CHARS = new Set(['add', 'nd', 'em', 'bd']);
const NATIVE_BLOCKS = /^(?:p|q[1-4]|b|mt1|ms1|s[1-4]|ip|is[12]|ili[12]|h|toc1|ie)$/;

/** Return a copy of the document reduced to the requested fidelity. */
export function applyFidelity(doc: Doc, o: FidelityOptions): Doc {
  if (o.level === 'full') return doc;
  const noisy = new Set(o.noisyMarkers ?? DEFAULT_NOISY_MARKERS);
  const noisyAttrs = new Set(o.noisyAttrs ?? DEFAULT_NOISY_ATTRS);
  const minimal = o.level === 'minimal';

  const inl = (nodes: Inline[]): Inline[] => {
    const out: Inline[] = [];
    for (const n of nodes) {
      if (n.type === 'ms' && n.marker === 'zhtml') continue;
      if (n.type === 'ms') { if (!minimal && !noisy.has(n.marker.replace(/-[se]$/, '')) && !noisy.has(n.marker)) out.push(n); continue; }
      if (n.type === 'note') {
        if (minimal) {
          const ft = n.children.filter((c): c is Char => c.type === 'char' && (c.marker === 'ft' || c.marker === 'fq' || c.marker === 'fr'));
          const hasText = ft.some((c) => c.marker === 'ft');
          if (n.marker === 'f' && hasText) {
            out.push({ type: 'note', marker: 'f', caller: '+', children: ft.map((c) => ({ type: 'char', marker: c.marker, children: inl(c.children) } as Char)) });
          }
          continue;
        }
        out.push({ ...n, children: inl(n.children) }); continue;
      }
      if (n.type === 'char') {
        const drop = minimal ? (!NATIVE_CHARS.has(n.marker) && !isImplicitChar(n.marker)) : noisy.has(n.marker);
        if (drop) {
          if (/^(?:fig|rq|ior|cat|ca|va|vp|ndx|rb)$/.test(n.marker) && minimal) continue;
          out.push(...inl(n.children));
          continue;
        }
        const c: Char = { ...n, children: inl(n.children) };
        if (c.attrs) {
          if (minimal) delete c.attrs;
          else {
            const kept = Object.fromEntries(Object.entries(c.attrs).filter(([k]) => !noisyAttrs.has(k)));
            if (Object.keys(kept).length) c.attrs = kept; else delete c.attrs;
          }
        }
        out.push(c); continue;
      }
      out.push(n);
    }
    return out;
  };

  const blk = (b: Block): Block | null => {
    if (b.marker === 'zhtmlb') {
      const t = (b.attrs?.html ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, '\u00A0').replace(/\s+/g, ' ').trim();
      return t ? { type: 'block', marker: 'p', children: [{ type: 'text', text: t }] } : null;
    }
    if (minimal && (b.marker === 'qt-s' || b.marker === 'qt-e')) return null;
    if (!minimal && noisy.has(b.marker)) return isNoTextBlock(b.marker) ? null : { ...b, children: inl(b.children) };
    if (minimal) {
      if (isNoTextBlock(b.marker) && !/^(?:h|toc1|ie)$/.test(b.marker)) return null;
      if (!NATIVE_BLOCKS.test(b.marker)) {
        if (/^(?:tr)$/.test(b.marker)) return { type: 'block', marker: 'p', children: inl(b.children), line: b.line };
        return { type: 'block', marker: 'p', children: inl(b.children), line: b.line };
      }
    }
    return { ...b, children: inl(b.children) };
  };

  const nodes = (list: Node[]): Node[] => {
    const out: Node[] = [];
    for (const n of list) {
      if (n.type === 'chapter') { out.push(minimal ? { ...n, children: [] } : { ...n, children: inl(n.children) }); continue; }
      if (n.type === 'sidebar') { out.push({ ...n, blocks: n.blocks.map(blk).filter((x): x is Block => !!x) }); continue; }
      const b = blk(n);
      if (b) out.push(b);
    }
    return out;
  };

  return {
    meta: doc.meta,
    diagnostics: doc.diagnostics,
    books: doc.books.map((b) => ({ ...b, blocks: nodes(b.blocks) })),
  };
}
