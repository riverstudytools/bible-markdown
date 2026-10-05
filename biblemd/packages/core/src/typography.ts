/** Typographic conversion for Bible Markdown (spec section 4). */

export const PROT: Record<string, string> = { '"': '\uE000', "'": '\uE001', '-': '\uE002', '&': '\uE003', '<': '\uE004' };
const UNPROT: Record<string, string> = { '\uE000': '"', '\uE001': "'", '\uE002': '-', '\uE003': '&', '\uE004': '<' };

export const protect = (c: string): string => PROT[c] ?? c;
export const unprotect = (s: string): string => s.replace(/[\uE000-\uE004]/g, (c) => UNPROT[c]);

const OPEN_CTX = /[\s(\[{<\u2014\u2013\u2018\u201C/]/;
const isOpenCtx = (b: string) => b === '' || OPEN_CTX.test(b);

/** Convert `---`, `--`, straight quotes and apostrophes. `prev` is the character before the text. */
export function smart(s: string, prev: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const before = out.length ? out[out.length - 1] : prev;
    if (c === '-' && s[i + 1] === '-') {
      if (s[i + 2] === '-') { out += '\u2014'; i += 2; } else { out += '\u2013'; i += 1; }
      continue;
    }
    if (c === '"') { out += isOpenCtx(before) ? '\u201C' : '\u201D'; continue; }
    if (c === "'") {
      const next = s[i + 1] ?? '';
      if (/[\p{L}\p{N}]/u.test(before) && /\p{L}/u.test(next)) out += '\u2019';
      else out += isOpenCtx(before) ? '\u2018' : '\u2019';
      continue;
    }
    out += c;
  }
  return out;
}

/** Trailing punctuation that is not quoted in a footnote's quoted text. */
export const stripTrailingPunct = (s: string): string => s.replace(/[\s.,;:!?"'\u201D\u2019\u201C\u2018)\]}\u00BB\u2014\u2013-]+$/u, '');

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', shy: '\u00AD',
  mdash: '\u2014', ndash: '\u2013', hellip: '\u2026', lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D',
  laquo: '\u00AB', raquo: '\u00BB', copy: '\u00A9', reg: '\u00AE', deg: '\u00B0', middot: '\u00B7', bull: '\u2022', para: '\u00B6', sect: '\u00A7',
};
/** Decode HTML character references in Bible Markdown text. Decoded `&`, `<` and quotes are protected from further processing. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, e: string) => {
    let ch: string | undefined;
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff) ch = String.fromCodePoint(cp);
    } else ch = NAMED[e] ?? NAMED[e.toLowerCase()];
    return ch === undefined ? m : protect(ch);
  });
}
