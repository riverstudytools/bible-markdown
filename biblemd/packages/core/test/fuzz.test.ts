import { describe, it, expect } from 'vitest';
import { parse, serialize } from '../src/index.js';
import type { Format } from '../src/index.js';
import { gen, rng } from './gen.js';

const N = Number(process.env.FUZZ_N ?? 300);

function firstDiff(a: string, b: string) {
  const x = a.split('\n'), y = b.split('\n');
  const i = x.findIndex((l, k) => l !== y[k]);
  return `line ${i + 1}\n   A: ${(x[i] ?? '<end>').slice(0, 200)}\n   B: ${(y[i] ?? '<end>').slice(0, 200)}`;
}

describe('property: round trips on generated Bible Markdown', () => {
  it(`holds for ${N} documents`, () => {
    const failures = new Map<string, { seed: number; detail: string }>();
    const note = (kind: string, seed: number, detail: string) => { if (!failures.has(kind)) failures.set(kind, { seed, detail }); };
    for (let seed = 1; seed <= N; seed++) {
      const md = gen(seed);
      try {
        const d = parse(md, 'biblemd');
        const bad = d.diagnostics.filter((x) => x.severity !== 'info');
        if (bad.length) note('diagnostic: ' + bad[0].code, seed, bad[0].message);
        const u1 = serialize(d, 'usfm');
        const md2 = serialize(d, 'biblemd');
        const u2 = serialize(parse(md2, 'biblemd'), 'usfm');
        if (u2 !== u1) note('BM -> BM -> USFM differs', seed, firstDiff(u1, u2));
        const u3 = serialize(parse(u1, 'usfm'), 'usfm');
        if (u3 !== u1) note('USFM -> USFM differs', seed, firstDiff(u1, u3));
        const u4 = serialize(parse(serialize(parse(u1, 'usfm'), 'biblemd'), 'biblemd'), 'usfm');
        if (u4 !== u1) note('USFM -> BM -> USFM differs', seed, firstDiff(u1, u4));
        const u5 = serialize(parse(serialize(d, 'biblehtml'), 'biblehtml'), 'usfm');
        if (u5 !== u1) note('BM -> HTML -> USFM differs', seed, firstDiff(u1, u5));
        const u6 = serialize(parse(serialize(parse(u1, 'usfm'), 'biblehtml'), 'biblehtml'), 'usfm');
        if (u6 !== u1) note('USFM -> HTML -> USFM differs', seed, firstDiff(u1, u6));
        const md3 = serialize(parse(md2, 'biblemd'), 'biblemd');
        if (md3 !== md2) note('BM not stable after one pass', seed, firstDiff(md2, md3));
      } catch (e) { note('THROWS ' + String((e as Error).message).slice(0, 80), seed, String((e as Error).stack).slice(0, 300)); }
    }
    const report = [...failures].map(([k, v]) => `* ${k} (seed ${v.seed})\n   ${v.detail}`).join('\n');
    if (report) console.log('FUZZ FAILURES:\n' + report);
    expect([...failures.keys()]).toEqual([]);
  });
});

describe('robustness: arbitrary text never throws', () => {
  const TOK = ['\\', '\\p ', '\\v 1 ', '\\c 2 ', '\\f + ', '\\f*', '\\w ', '\\w*', '\\+nd ', '\\*', '|', '"', '\'', '[', ']', '{', '}', '}:', '{a}: ', '\n', '\n\n', '  ', '/ ', '#', '>>>', '```bible', '```', '- ', '1. ', '1:1 ', '2 ', '<', '>', '<div>', '</div>', '<!--', '-->', '&amp;', '&', '&#', ';', '*', '**', '_', '^', '~', '//', 'x', 'Lord', '\u00A0', '\t', '\\qt-s |sid="a" x-quote="bible"\\*', '\\qt-e |eid="a"\\*', '\\zhtml |html="<b>"\\*', '\\esb', '\\esbe', '\\id ABC ', '\\rem meta A: b'];
  it('parses and re-serializes junk in every format', () => {
    const r = rng(99);
    const formats: Format[] = ['usfm', 'biblemd', 'biblehtml'];
    for (let i = 0; i < N * 3; i++) {
      const s = Array.from({ length: 1 + Math.floor(r() * 40) }, () => TOK[Math.floor(r() * TOK.length)]).join('');
      for (const f of formats) {
        let doc;
        try { doc = parse(s, f); for (const to of formats) serialize(doc, to); }
        catch (e) { throw new Error(`${f} threw on ${JSON.stringify(s)}: ${(e as Error).message}`); }
      }
    }
  });
});
