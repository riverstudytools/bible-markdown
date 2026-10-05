import { Diagnostic, Doc, Format } from './model.js';
import { parseUsfm, serializeUsfm } from './usfm.js';
import { parseBibleMd, BibleMdOptions } from './biblemd-parse.js';
import { serializeBibleMd } from './biblemd-write.js';
import { parseBibleHtml } from './html-parse.js';
import { serializeBibleHtml, HtmlOptions } from './html-write.js';
import { applyFidelity, FidelityOptions } from './fidelity.js';
import { plainText, Block } from './model.js';

export * from './model.js';
export { applyFidelity } from './fidelity.js';
export type { Fidelity, FidelityOptions } from './fidelity.js';
export type { HtmlOptions } from './html-write.js';
export type { BibleMdOptions } from './biblemd-parse.js';
export { DEFAULT_NOISY_MARKERS, DEFAULT_NOISY_ATTRS, BOOK_CODES } from './markers.js';

export interface ParseOptions extends BibleMdOptions {}
export interface SerializeOptions { fidelity?: FidelityOptions; html?: HtmlOptions }
export interface ConvertResult { output: string; diagnostics: Diagnostic[]; doc: Doc }

export const FORMAT_EXTENSIONS: Record<Format, string[]> = {
  usfm: ['usfm', 'sfm', 'ptx'],
  biblemd: ['md', 'markdown', 'biblemd'],
  biblehtml: ['html', 'htm'],
};

export function parse(src: string, format: Format, opts: ParseOptions = {}): Doc {
  switch (format) {
    case 'usfm': return parseUsfm(src);
    case 'biblemd': return parseBibleMd(src, opts);
    case 'biblehtml': return parseBibleHtml(src);
  }
}

export function serialize(doc: Doc, format: Format, opts: SerializeOptions = {}): string {
  const d = opts.fidelity ? applyFidelity(doc, opts.fidelity) : doc;
  switch (format) {
    case 'usfm': return serializeUsfm(d);
    case 'biblemd': return serializeBibleMd(d);
    case 'biblehtml': return serializeBibleHtml(d, opts.html);
  }
}

export function convert(src: string, from: Format, to: Format, opts: ParseOptions & SerializeOptions = {}): ConvertResult {
  const doc = parse(src, from, opts);
  return { output: serialize(doc, to, opts), diagnostics: doc.diagnostics, doc };
}

/** Guess a format from a file name, falling back to the content. */
export function detectFormat(name: string, content = ''): Format | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  for (const [f, exts] of Object.entries(FORMAT_EXTENSIONS) as [Format, string[]][]) if (exts.includes(ext)) {
    if (f === 'biblemd' && /^\s*\\id\s/m.test(content.slice(0, 2000))) return 'usfm';
    return f;
  }
  if (/^\s*\\id\s/m.test(content.slice(0, 2000))) return 'usfm';
  if (/<article[^>]*class="id"/.test(content.slice(0, 5000))) return 'biblehtml';
  return null;
}

export interface BookIndex {
  id: string;
  name: string;
  chapters: { number: string; verses: number }[];
}

/** A navigator index: books, their chapters and verse counts, in file order. */
export function indexDoc(doc: Doc): BookIndex[] {
  return doc.books.map((b) => {
    const name = (m: string) => { const x = b.blocks.find((n) => n.type === 'block' && n.marker === m) as Block | undefined; return x ? plainText(x.children).trim() : ''; };
    const chapters: BookIndex['chapters'] = [];
    const count = (nodes: any[]) => { for (const n of nodes) { if (n.type === 'verse' && chapters.length) chapters[chapters.length - 1].verses++; else if (n.type === 'char' || n.type === 'note') count(n.children); } };
    for (const n of b.blocks) {
      if (n.type === 'chapter') chapters.push({ number: n.number, verses: 0 });
      else if (n.type === 'block') count(n.children);
      else if (n.type === 'sidebar') n.blocks.forEach((x) => count(x.children));
    }
    return { id: b.id, name: name('h') || name('toc1') || name('mt1') || b.id, chapters };
  });
}
