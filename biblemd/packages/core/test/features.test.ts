import { describe, it, expect } from 'vitest';
import { parse, serialize, convert, indexDoc } from '../src/index.js';

function same(a: string, b: string) {
  if (a === b) return;
  const x = a.split('\n'), y = b.split('\n');
  const i = x.findIndex((l, k) => l !== y[k]);
  throw new Error(`first difference at line ${i + 1}:\n  A: ${(x[i] ?? '').slice(0, 300)}\n  B: ${(y[i] ?? '').slice(0, 300)}`);
}
const usfm = (md: string) => convert(md, 'biblemd', 'usfm').output;
const body = (md: string) => usfm('# T (GEN)\n\n' + md).split('\n').slice(4).join('\n').trim();
const through = (md: string) => {
  const u1 = usfm(md);
  const viaUsfm = usfm(serialize(parse(u1, 'usfm'), 'biblemd'));
  const viaHtml = serialize(parse(serialize(parse(md, 'biblemd'), 'biblehtml'), 'biblehtml'), 'usfm');
  const stable = serialize(parse(serialize(parse(md, 'biblemd'), 'biblemd'), 'biblemd'), 'biblemd');
  same(viaUsfm, u1); same(viaHtml, u1);
  same(stable, serialize(parse(stable, 'biblemd'), 'biblemd'));
  return u1;
};

describe('entities and special characters', () => {
  it('decodes entities, honours escapes, and keeps USFM clean', () => {
    const b = body('1:1 Fish &amp; chips&nbsp;now &#8212; \\&amp; literal \\<b> not a tag');
    expect(b).toContain('Fish & chips~now — &amp; literal <b> not a tag');
  });
  it('USFM ~ is a no-break space and survives round trips', () => {
    const d = parse('\\id GEN\n\\p\n\\v 1 a~b\n', 'usfm');
    const md = serialize(d, 'biblemd');
    expect(md).toContain('a&nbsp;b');
    expect(serialize(parse(md, 'biblemd'), 'usfm')).toContain('a~b');
  });
  it('a stray \\n is reported, not lost', () => {
    const d = parse('\\id GEN\n\\p\n\\v 1 line\\n two\n', 'usfm');
    expect(d.diagnostics.some((x) => x.code === 'unknown-marker')).toBe(true);
  });
  it('literal & and < survive Bible Markdown round trips', () => {
    through('# T (GEN)\n\n1:1 AT\\&T &amp;x; and 1 \\< 2 and \\&copy; done');
  });
});

describe('footnotes as Markdown', () => {
  const md = '# T (GEN)\n\n1:1 A {word} here and {more} there.\n\n{word}: See [the site](https://example.org/a) and *this*.\n\n  Second paragraph of the note.\n\n{more}: plain\n';
  it('links and multiple paragraphs', () => {
    const u = usfm(md);
    expect(u).toContain('\\ft See \\+jmp the site|link-href="https://example.org/a"\\+jmp* and \\+em this\\+em*.');
    expect(u).toContain('\\fp Second paragraph of the note.');
    through(md);
  });
  it('round trips back to the same Markdown', () => {
    const out = serialize(parse(md, 'biblemd'), 'biblemd');
    expect(out).toContain('{word}: See [the site](https://example.org/a) and *this*.\n\n  Second paragraph of the note.');
  });
  it('lazy continuation lines still work', () => {
    const u = usfm('# T (GEN)\n\n1:1 A {w} b\n\n{w}: first line\ncontinues here');
    expect(u).toContain('\\ft first line continues here');
  });
});

describe('Markdown lists in scripture text', () => {
  const md = '# T (GEN)\n\n1:1 Intro text\n\n- 2 first\n  - second level\n- 3 third\n\n1. numbered one\n2. numbered two\n';
  it('become list markers', () => {
    const b = body(md);
    expect(b).toContain('\\li1\n\\v 2 first');
    expect(b).toContain('\\li2 second level');
    expect(b).toContain('\\li1\n\\v 3 third');
    expect(b).toContain('\\li1 1. numbered one');
    through(md);
  });
  it('verse numbers inside list items are real verses', () => {
    const idx = indexDoc(parse(md, 'biblemd'));
    expect(idx[0].chapters[0].verses).toBe(3);
  });
  it('text that merely looks like a list is escaped on the way out', () => {
    const u = '\\id GEN\n\\p\n\\v 1 x\n\\p\n- dash start\n\\p\n1. numbered looking\n';
    const md2 = serialize(parse(u, 'usfm'), 'biblemd');
    expect(md2).toContain('\\- dash start');
    expect(md2).toContain('1\\. numbered looking');
    const u2 = serialize(parse(md2, 'biblemd'), 'usfm');
    expect(u2).toContain('\\p - dash start');
    expect(u2).toContain('\\p 1. numbered looking');
  });
});

describe('explanatory text is regular Markdown', () => {
  const md = '# T (GEN)\n\n>>>>>>>>>>\n# Heading\n\nSome *emphasis*, a [link](https://example.org) and **bold**.\n\n- one\n- two\n\n> quoted words\n\n| a | b |\n|---|---|\n| 1 | 2 |\n>>>>>>>>>>\n\n1:1 text\n';
  it('maps to introduction markers', () => {
    const u = usfm(md);
    expect(u).toContain('\\is1 Heading');
    expect(u).toContain('\\ip Some \\em emphasis\\em*, a \\jmp link|link-href="https://example.org"\\jmp* and \\bd bold\\bd*.');
    expect(u).toContain('\\ili1 one');
    expect(u).toContain('\\ipq quoted words');
    expect(u).toContain('\\tr \\th1 a \\th2 b');
    through(md);
  });
});

describe('nested Bible Markdown quotations', () => {
  const md = '# T (GEN)\n\n1:1 Real verse.\n\n>>>>>>>>>>\nPaul echoes this:\n\n```bible John 3:16\n16 For God so loved the world\n/ whoever believes\n/ in him\n```\n>>>>>>>>>>\n\n2 Next real verse.\n';
  it('quoted verse numbers do not count', () => {
    const doc = parse(md, 'biblemd');
    expect(indexDoc(doc)[0].chapters[0].verses).toBe(2);
    expect(doc.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });
  it('uses the standard quotation milestones in USFM and blockquote in HTML', () => {
    const u = usfm(md);
    expect(u).toContain('\\qt-s |sid="bq1" x-quote="bible" x-ref="John 3:16"\\*');
    expect(u).toContain('\\sup 16\\sup* For God so loved the world');
    expect(u).toContain('\\qt-e |eid="bq1"\\*');
    expect(convert(md, 'biblemd', 'biblehtml').output).toContain('<blockquote class="qt" data-sid="bq1" data-x-quote="bible" data-x-ref="John 3:16">');
  });
  it('round trips through every format', () => { through(md); });
  it('footnotes inside a quotation are refused with a warning', () => {
    const d = parse('# T (GEN)\n\n>>>\n```bible\n1 a {b} c\n\n{b}: n\n```\n>>>\n', 'biblemd');
    expect(d.diagnostics.some((x) => x.code === 'quote')).toBe(true);
    expect(serialize(d, 'usfm')).not.toContain('\\f ');
  });
});

describe('quotations inside footnotes', () => {
  const md = '# T (GEN)\n\n1:1 A {word} here.\n\n{word}: See this passage:\n\n  ```bible John 3:16\n  16 For God so loved\n  / that whoever believes\n  / in him\n  ```\n\n  After the quote.\n\n2 Next verse.\n';
  it('become fp paragraphs between quotation milestones', () => {
    const u = usfm(md);
    expect(u).toContain('\\fp \\qt-s |sid="bq1" x-quote="bible" x-ref="John 3:16"\\*');
    expect(u).toContain('\\qt-e |eid="bq1"\\*');
    expect(u).toContain('\\fp After the quote.');
    expect(indexDoc(parse(md, 'biblemd'))[0].chapters[0].verses).toBe(2);
  });
  it('round trips through every format', () => { through(md); });
  it('a note that starts with a quotation', () => {
    through('# T (GEN)\n\n1:1 A {word} here.\n\n{word}:\n  ```bible\n  1 In the beginning\n  ```\n');
  });
});

describe('HTML anywhere', () => {
  const md = '# T (GEN)\n\n1:1 Plain <span class="wj">Jesus said</span> and <em>this</em> and <mark>marked</mark> text<br>after.\n\n<div class="note">A <b>raw</b> block</div>\n\n2 Next.\n';
  it('maps what it can and keeps the rest', () => {
    const u = usfm(md);
    expect(u).toContain('\\wj Jesus said\\wj*');
    expect(u).toContain('\\em this\\em*');
    expect(u).toContain('\\zhtml |html="<mark>"\\*marked\\zhtml |html="</mark>"\\*');
    expect(u).toContain('//');
    expect(u).toContain('\\zhtmlb |html="<div class=&quot;note&quot;>A <b>raw</b> block</div>"\\*');
  });
  it('passes through to Bible HTML unchanged', () => {
    const h = convert(md, 'biblemd', 'biblehtml').output;
    expect(h).toContain('<mark>marked</mark>');
    expect(h).toContain('<div class="note">A <b>raw</b> block</div>');
  });
  it('round trips through every format', () => { through(md); });
  it('lower fidelity levels strip the tags and keep the text', () => {
    const out = serialize(parse(md, 'biblemd'), 'biblemd', { fidelity: { level: 'readable' } });
    expect(out).not.toContain('<mark>');
    expect(out).toContain('marked');
    expect(out).toContain('A raw block');
  });
});

describe('review fixes', () => {
  it('a first paragraph that looks like metadata but is not followed by a book heading is text', () => {
    const d = parse('Note: this is really the first paragraph\n\nMore plain text.\n\n# T (GEN)\n\n1:1 x', 'biblemd');
    expect(d.meta).toEqual([]);
    const d2 = parse('Version: X\nCopyright: PD\n\n# T (GEN)\n\n1:1 x', 'biblemd');
    expect(d2.meta.length).toBe(2);
  });
  it('chapters and verses may repeat or go backwards; HTML ids stay unique', () => {
    const h = convert('# T (GEN)\n\n2:5 a 3 b 1 c\n\n1:9 d\n\n2:5 again', 'biblemd', 'biblehtml').output;
    const ids = [...h.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(h).toContain('id="GEN.2-2"');
    through('# T (GEN)\n\n2:5 a 3 b 1 c\n\n1:9 d\n\n2:5 again');
  });
  it('adjacent # lines are title lines mt1, mt2, mt3', () => {
    const u = convert('# T (GEN)\n\n# Main\n# Sub\n# Third\n\n1:1 x', 'biblemd', 'usfm').output;
    expect(u).toContain('\\mt1 Main\n\\mt2 Sub\n\\mt3 Third');
  });
  it('peripherals become sections and round trip', () => {
    const u = '\\id FRT\n\\periph Preface|id="preface"\n\\ip Words\n\\periph Credits|id="credits"\n\\ip More\n';
    const h = convert(u, 'usfm', 'biblehtml').output;
    expect(h).toContain('<section class="periph" data-periph="preface"><h2 class="periph-title">Preface</h2>');
    expect(serialize(parse(h, 'biblehtml'), 'usfm')).toBe(serialize(parse(u, 'usfm'), 'usfm'));
  });
  it('USFM warns about characters it reads differently', () => {
    const d = parse('# T (GEN)\n\n1:1 a~b and x // y', 'biblemd');
    expect(d.diagnostics.map((x) => x.code)).toEqual(expect.arrayContaining(['usfm-tilde', 'usfm-slashes']));
  });
});
