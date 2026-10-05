import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse, serialize, convert } from '../src/index.js';

const ksb = readFileSync(new URL('../../spec/corpora/KSB.md', import.meta.url), 'utf-8');
function same(a: string, b: string) {
  if (a === b) return;
  const x = a.split('\n'), y = b.split('\n');
  const i = x.findIndex((l, k) => l !== y[k]);
  throw new Error(`first difference at line ${i + 1}:\n  A: ${(x[i] ?? '').slice(0, 300)}\n  B: ${(y[i] ?? '').slice(0, 300)}`);
}
const usfmOf = (md: string) => convert(md, 'biblemd', 'usfm').output;

describe('Bible Markdown rules', () => {
  const bm = (s: string) => usfmOf('# Test (GEN)\n\n' + s).split('\n').slice(4).join('\n').trim();

  it('chapter and verse markers', () => {
    expect(bm('1:1 In the beginning 2 was the Word.')).toBe('\\c 1\n\\p\n\\v 1 In the beginning\n\\v 2 was the Word.');
    expect(bm('1: In the beginning')).toBe('\\c 1\n\\p\n\\v 1 In the beginning');
    expect(bm('3:\n\n### Heading\n\n1 text')).toBe('\\c 3\n\\s1 Heading\n\\p\n\\v 1 text');
  });
  it('numbers need not increase', () => {
    const d = parse('# T (GEN)\n\n2:5 five 3 three 1 one\n\n1:9 nine', 'biblemd');
    expect(d.diagnostics.filter((x) => x.severity !== 'info')).toEqual([]);
  });
  it('numeral and chapter-like escapes', () => {
    expect(bm('1:1 It was 483\\ years, and 3:16\\ is a verse.')).toContain('It was 483 years, and 3:16 is a verse.');
    expect(bm('1:1 It was 483 years.')).toContain('\\v 483 years.');
    expect(bm('1:1 x\n3:16\\ is a well known verse')).not.toContain('\\c 3');
    const md = serialize(parse('# T (GEN)\n\n1:1 It was 483\\ years\n\n3:16\\ is well known', 'biblemd'), 'biblemd');
    expect(md).toContain('483\\ years');
    expect(md).toContain('3:16\\ is well known');
  });
  it('poetry indentation is relative to each paragraph', () => {
    const out = bm('1:1 a\n/ one\n/      two\n/      three\n\n/         x\n/         y');
    expect(out).toContain('\\q1 one\n\\q2 two\n\\q2 three\n\\b\n\\q1 x\n\\q1 y');
  });
  it('footnote matching uses the next unused definition with exactly matching text', () => {
    const out = bm('1:1 a {for} b 2 c {for} d\n\n{for}: first\n\n3 e {for} f\n\n{for}: second\n\n{for}: third');
    expect(out).toContain('\\fq for \\ft first');
    expect(out).toContain('\\fq for \\ft second');
    expect(out).toContain('\\fq for \\ft third');
  });
  it('book names come from parenthesized codes', () => {
    const u = usfmOf('# Romans (ROM)\n\n# A Title\n\n1:1 x');
    expect(u).toContain('\\id ROM');
    expect(u).toContain('\\mt1 A Title');
  });
  it('typography', () => {
    expect(bm('1:1 He said, "It\'s fine"---really--ok \\"raw\\"')).toContain('He said, “It’s fine”—really–ok "raw"');
  });
  it('small caps, additions, emphasis', () => {
    expect(bm('1:1 The Lord^ is [good] and *kind* and **great**')).toContain('\\nd Lord\\nd* is \\add good\\add* and \\em kind\\em* and \\bd great\\bd*');
  });
  it('hard line breaks round trip through USFM', () => {
    const u = usfmOf('# T (GEN)\n\n1:1 first line  \nsecond line');
    expect(u).toContain('\\v 1 first line // second line');
    const md = serialize(parse(u, 'usfm'), 'biblemd');
    expect(md).toContain('first line  \nsecond line');
  });
  it('footnoted text may span additions, and keys keep their punctuation', () => {
    const u = bm('1:1 We {saw [the] light.} and {x}\n\n{saw [the] light.}: see\n\n{x}: ex');
    expect(u).toContain('\\fq saw the light \\ft see');
    const md = serialize(parse('# T (GEN)\n\n1:1 We {saw [the] light.} and {x}\n\n{saw [the] light.}: see\n\n{x}: ex', 'biblemd'), 'biblemd');
    expect(md).toContain('{saw [the] light.}: see');
  });
  it('a definition with no footnote is reported and kept', () => {
    const d = parse('# T (GEN)\n\n1:1 text\n\n{nothing}: note', 'biblemd');
    expect(d.diagnostics.some((x) => x.code === 'def-no-footnote')).toBe(true);
  });
  it('explanatory text becomes introduction or sidebar', () => {
    const u = usfmOf('# T (GEN)\n\n>>>\nIntro text\n>>>\n\n1:1 x\n\n>>>\nSidebar\n>>>');
    expect(u).toMatch(/\\ip Intro text\n\\ie\n\\c 1/);
    expect(u).toMatch(/\\esb\n\\p Sidebar\n\\esbe/);
  });
});

describe('round trips', () => {
  it('KSB: Bible Markdown is stable', () => {
    const d1 = parse(ksb, 'biblemd');
    const md1 = serialize(d1, 'biblemd');
    const md2 = serialize(parse(md1, 'biblemd'), 'biblemd');
    same(md2, md1);
    same(usfmOf(md1), usfmOf(ksb));
  });
  it('KSB: through USFM', () => {
    const u1 = usfmOf(ksb);
    const md = serialize(parse(u1, 'usfm'), 'biblemd');
    const u2 = usfmOf(md);
    same(u2, u1);
  });
  it('KSB: through Bible HTML', () => {
    const u1 = usfmOf(ksb);
    const html = serialize(parse(ksb, 'biblemd'), 'biblehtml');
    const u2 = serialize(parse(html, 'biblehtml'), 'usfm');
    same(u2, u1);
  });
});

const SAMPLE = String.raw`\id PSA Psalms
\rem meta Language: en
\h Psalms
\toc1 Psalms
\mt1 Psalms
\is1 Introduction
\ip The \bk Book of Psalms\bk* has \em many\em* parts.
\ili1 First item
\ili2 Sub item
\ie
\c 1
\cl Psalm
\s1 The Two Ways
\r (Jer 17.5-8)
\q1
\v 1 Blessed is the man
\q2 who walks not in the counsel of the wicked,
\q1 nor stands in the way\f + \fr 1:1 \fq way \ft or "path"\f*
\b
\q1 \v 2 but his delight is in the law of the \nd Lord\nd*,
\p
\v 3 He is like a tree \w planted|lemma="plant" strong="H1234"\w* by streams. \wj Selah\wj* \x - \xo 1:3 \xt Jer 17.8\x*
\m And he prospers. \ts\*
\li1 \v 4 first
\li2 second
\tr \th1 Name \thr2 Count
\tr \tc1 Judah \tcr2 12
\p
\qt-s |sid="q1" who="God"\*Words\qt-e |eid="q1"\*
\c 2
\cp II
\p
\v 1 Why do the nations rage? \v 2-3 The kings.
\esb
\s1 Sidebar title
\p Sidebar text.
\esbe
`;

describe('USFM', () => {
  it('parses and re-serializes the sample', () => {
    const d = parse(SAMPLE, 'usfm');
    expect(d.diagnostics.filter((x) => x.severity !== 'info')).toEqual([]);
    const out = serialize(d, 'usfm');
    const d2 = parse(out, 'usfm');
    expect(serialize(d2, 'usfm')).toBe(out);
    expect(out).toContain('\\w planted|lemma="plant" strong="H1234"\\w*');
    expect(out).toContain('\\qt-s |sid="q1" who="God"\\*');
  });
  it('USFM -> Bible HTML -> USFM is lossless', () => {
    const u1 = serialize(parse(SAMPLE, 'usfm'), 'usfm');
    const html = serialize(parse(SAMPLE, 'usfm'), 'biblehtml');
    const u2 = serialize(parse(html, 'biblehtml'), 'usfm');
    same(u2, u1);
  });
  it('USFM -> Bible Markdown -> USFM is lossless at full fidelity', () => {
    const u1 = serialize(parse(SAMPLE, 'usfm'), 'usfm');
    const md = serialize(parse(SAMPLE, 'usfm'), 'biblemd');
    const u2 = usfmOf(md);
    same(u2, u1);
  });
  it('fidelity levels', () => {
    const d = parse(SAMPLE, 'usfm');
    const readable = serialize(d, 'biblemd', { fidelity: { level: 'readable' } });
    expect(readable).not.toContain('lemma');
    expect(readable).toContain('planted');
    const minimal = serialize(d, 'biblemd', { fidelity: { level: 'minimal' } });
    expect(minimal).not.toContain('\\wj');
    expect(minimal).toContain('Selah');
    expect(minimal).not.toContain('\\li1');
  });
});
