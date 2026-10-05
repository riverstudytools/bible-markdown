import { it, expect } from 'vitest';
import { parse, serialize } from '../src/index.js';

function bigBM(books: number, chapters: number, verses: number) {
  const out: string[] = [];
  for (let b = 0; b < books; b++) {
    out.push(`# Book ${b} (${['GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA'][b % 10]})`);
    for (let c = 1; c <= chapters; c++) {
      let t = '';
      for (let v = 1; v <= verses; v++) t += `${c}:${v} `.slice(v === 1 ? 0 : (`${c}:`).length) + 'In the beginning God created the heavens and the earth, and {word} was upon it. ';
      out.push(t.trim() + '\n\n{word}: a note\n\n{word}: two');
      out.push('/ poetry line one\n/   poetry line two');
    }
  }
  return out.join('\n\n');
}
it('timing on a large project', () => {
  const md = bigBM(10, 50, 25);
  console.log('size KB', Math.round(md.length / 1024));
  let t = performance.now();
  const d = parse(md, 'biblemd'); console.log('parse BM ms', Math.round(performance.now() - t));
  t = performance.now(); const u = serialize(d, 'usfm'); console.log('to USFM ms', Math.round(performance.now() - t), 'KB', Math.round(u.length / 1024));
  t = performance.now(); const m2 = serialize(d, 'biblemd'); console.log('to BM ms', Math.round(performance.now() - t));
  t = performance.now(); const h = serialize(d, 'biblehtml'); console.log('to HTML ms', Math.round(performance.now() - t), 'KB', Math.round(h.length / 1024));
  t = performance.now(); parse(u, 'usfm'); console.log('parse USFM ms', Math.round(performance.now() - t));
  t = performance.now(); parse(h, 'biblehtml'); console.log('parse HTML ms', Math.round(performance.now() - t));
  t = performance.now(); parse(m2, 'biblemd'); console.log('reparse BM ms', Math.round(performance.now() - t));
  // one very long paragraph
  const long = '# T (GEN)\n\n1:1 ' + Array.from({ length: 20000 }, (_, i) => `${i + 2} word word word`).join(' ');
  t = performance.now(); parse(long, 'biblemd'); const longMs = Math.round(performance.now() - t); console.log('one 20k-verse paragraph ms', longMs);
  expect(longMs).toBeLessThan(3000);
}, 120000);
