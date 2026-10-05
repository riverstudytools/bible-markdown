import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { HtmlValidate } from 'html-validate';
import { parse, serialize } from '../src/index.js';
import { gen } from './gen.js';

const validator = new HtmlValidate({
  extends: ['html-validate:standard'],
  rules: { 'no-inline-style': 'off', 'void-style': 'off', 'attribute-boolean-style': 'off', 'no-trailing-whitespace': 'off', 'prefer-native-element': 'off', 'long-title': 'off', 'wcag/h30': 'off', 'wcag/h32': 'off', 'no-redundant-role': 'off',
    'attribute-empty-style': 'off', 'require-sri': 'off', 'no-raw-characters': 'off', 'text-content': 'off', 'heading-level': 'off', 'no-missing-references': 'off', 'valid-id': 'off', 'prefer-tbody': 'off', 'element-required-attributes': 'off', 'doctype-style': 'off', 'no-utf8-bom': 'off' },
});
async function problems(html: string) {
  const r = await validator.validateString(html);
  return r.results.flatMap((x) => x.messages.map((m) => `${m.ruleId}: ${m.message} (line ${m.line})`));
}

const ksb = readFileSync(new URL('../../spec/corpora/KSB.md', import.meta.url), 'utf-8');
const SAMPLE = String.raw`\id PSA Psalms
\h Psalms
\toc1 Psalms
\mt1 Psalms
\imt1 About
\is1 Intro
\ip The \bk Book\bk* has \em many\em* \bd parts\bd* \bdit both\bdit*.
\ili1 First
\ili2 Sub
\iot Outline
\io1 One \ior 1:1-5\ior*
\ie
\c 1
\cl Psalm
\s1 The Two Ways
\r (Jer 17.5-8)
\q1
\v 1 Blessed is the man
\q2 who walks not
\q1 nor stands\f + \fr 1:1 \fq way \ft or "path"\f*
\b
\q1 \v 2 but his delight is in the law of the \nd Lord\nd*,
\p
\v 3 He is like a tree \w planted|lemma="plant" strong="H1234"\w* by streams. \wj Selah\wj* \x - \xo 1:3 \xt Jer 17.8\x* \tl logos\tl* \k key\k* \rq (Gen 1.1)\rq*
\m And he prospers. \fig A caption|src="a.jpg" size="col" ref="1.1"\fig*
\li1 \v 4 first
\li2 second
\tr \th1 Name \thr2 Count
\tr \tc1 Judah \tcr2 12
\p \rb 漢|gloss="kan"\rb* \jmp link|link-href="https://example.org"\jmp* H\sup 2\sup*O
\c 2
\cp II
\p
\v 1 Why? \v 2-3 The kings.
\esb
\s1 Sidebar title
\p Sidebar text.
\esbe
\qt-s |sid="bq1" x-quote="bible" x-ref="John 3:16"\*
\p \sup 16\sup* For God
\qt-e |eid="bq1"\*
`;

describe('Bible HTML is valid HTML5', () => {
  it('KSB.md', async () => {
    const p = await problems(serialize(parse(ksb, 'biblemd'), 'biblehtml', { html: { css: 'bible.css' } }));
    expect(p).toEqual([]);
  });
  it('a USFM sample using most markers', async () => {
    const p = await problems(serialize(parse(SAMPLE, 'usfm'), 'biblehtml'));
    expect(p).toEqual([]);
  });
});

describe('the validator really catches mistakes', () => {
  it('rejects a block inside a paragraph', async () => {
    expect((await problems('<!DOCTYPE html><html lang="en"><head><title>x</title></head><body><p><div>no</div></p></body></html>')).length).toBeGreaterThan(0);
  });
});

describe('generated documents are valid HTML5', () => {
  it('200 random Bible Markdown documents', async () => {
    const bad: string[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const p = await problems(serialize(parse(gen(seed), 'biblemd'), 'biblehtml'));
      if (p.length) bad.push(`seed ${seed}: ${p[0]}`);
      if (bad.length >= 5) break;
    }
    expect(bad).toEqual([]);
  }, 120000);
});
