import { describe, it, expect } from 'vitest';
import { convert, parse, serialize } from '../src/index.js';

const html = (usfm: string) => convert('\\id GEN\n\\c 1\n' + usfm + '\n', 'usfm', 'biblehtml', {}).output;
const frag = (usfm: string) => serialize(parse('\\id GEN\n\\c 1\n' + usfm + '\n', 'usfm'), 'biblehtml', { html: { fragment: true } });

/** USFM block markers -> the element that carries them. */
const BLOCKS: [string, string][] = [
  ['\\mt1 T', '<h1 class="mt"><span class="mt1">T</span></h1>'], ['\\mte1 T', '<p class="mte"><span class="mte1">T</span></p>'],
  ['\\ms1 T', '<h2 class="ms1">'], ['\\mr (1.1)', '<p class="mr">'],
  ['\\s1 T', '<h3 class="s1">'], ['\\s2 T', '<h4 class="s2">'], ['\\s3 T', '<h5 class="s3">'], ['\\s4 T', '<h6 class="s4">'],
  ['\\sr (1.1)', '<p class="sr">'], ['\\r (1.1)', '<p class="r">'], ['\\d T', '<p class="d">'], ['\\sp Job', '<p class="sp">'],
  ['\\sd1', '<div class="sd1"></div>'], ['\\cd T', '<p class="cd">'],
  ['\\p x', '<p>'], ['\\m x', '<p class="m">'], ['\\po x', '<p class="po">'], ['\\pr x', '<p class="pr">'], ['\\cls x', '<p class="cls">'],
  ['\\pmo x', '<p class="pmo">'], ['\\pm x', '<p class="pm">'], ['\\pmc x', '<p class="pmc">'], ['\\pmr x', '<p class="pmr">'],
  ['\\pi1 x', '<p class="pi1">'], ['\\mi x', '<p class="mi">'], ['\\pc x', '<p class="pc">'], ['\\ph1 x', '<p class="ph1">'], ['\\lit x', '<p class="lit">'],
  ['\\b', '<div class="b"></div>'],
  ['\\q1 x', '<p class="q1">'], ['\\q2 x', '<p class="q2">'], ['\\qr x', '<p class="qr">'], ['\\qc x', '<p class="qc">'], ['\\qm1 x', '<p class="qm1">'],
  ['\\qd x', '<p class="qd">'], ['\\qa Aleph', '<h4 class="qa">'],
  ['\\lh x', '<p class="lh">'], ['\\lf x', '<p class="lf">'],
  ['\\li1 x', '<ul class="li"><li class="li1">x</li></ul>'], ['\\lim1 x', '<ul class="lim"><li class="lim1">'],
];
const INTRO: [string, string][] = [
  ['\\imt1 T', '<h1 class="imt"><span class="imt1">T</span></h1>'], ['\\is1 T', '<h3 class="is1">'], ['\\is2 T', '<h4 class="is2">'],
  ['\\ip x', '<p class="ip">'], ['\\ipi x', '<p class="ipi">'], ['\\im x', '<p class="im">'], ['\\imi x', '<p class="imi">'], ['\\ipq x', '<p class="ipq">'],
  ['\\imq x', '<p class="imq">'], ['\\ipr x', '<p class="ipr">'], ['\\iq1 x', '<p class="iq1">'], ['\\ib', '<div class="ib"></div>'],
  ['\\ili1 x', '<ul class="ili"><li class="ili1">x</li></ul>'], ['\\iot T', '<h3 class="iot">'], ['\\io1 x', '<ul class="io"><li class="io1">x</li></ul>'],
  ['\\iex x', '<p class="iex">'], ['\\imte1 T', '<p class="imte1">'], ['\\ie', '<div class="ie"></div>'],
];
/** USFM character markers -> element. */
const CHARS: [string, string][] = [
  ['em', 'em'], ['bd', 'b'], ['it', 'i'], ['sup', 'sup'], ['bk', 'cite'], ['rq', 'cite'], ['tl', 'i'], ['k', 'b'],
  ['add', 'span'], ['dc', 'span'], ['nd', 'span'], ['ord', 'span'], ['pn', 'span'], ['png', 'span'], ['addpn', 'span'], ['qt', 'span'],
  ['sig', 'span'], ['sls', 'span'], ['wj', 'span'], ['no', 'span'], ['sc', 'span'], ['qs', 'span'], ['qac', 'span'], ['pro', 'span'],
  ['ior', 'span'], ['iqt', 'span'], ['ndx', 'span'], ['litl', 'span'], ['lik', 'span'], ['liv1', 'span'], ['w', 'span'],
];

describe('every USFM block marker gets the right element', () => {
  for (const [usfm, want] of [...BLOCKS, ...INTRO]) {
    it(usfm.split(' ')[0], () => { expect(frag(usfm)).toContain(want); });
  }
  it('\\nb is a comment, \\rem/\\sts/\\ide are comments, \\h and \\toc are hidden', () => {
    const h = serialize(parse('\\id GEN\n\\ide UTF-8\n\\sts 2\n\\rem hello\n\\h Genesis\n\\toc1 Genesis\n\\toca1 Gen\n\\c 1\n\\nb\n\\p x\n', 'usfm'), 'biblehtml', { html: { fragment: true } });
    expect(h).toContain('<!-- \\ide UTF-8 -->');
    expect(h).toContain('<!-- \\sts 2 -->');
    expect(h).toContain('<!-- hello -->');
    expect(h).toContain('<p class="h" hidden>Genesis</p>');
    expect(h).toContain('<span class="toc1" hidden>Genesis</span>');
    expect(h).toContain('<span class="toca1" hidden>Gen</span>');
    expect(h).toContain('<!-- \\nb -->');
  });
});

describe('every USFM character marker gets the right element', () => {
  for (const [m, tag] of CHARS) {
    it('\\' + m, () => { expect(frag(`\\p \\${m} word\\${m}*`)).toContain(`<${tag} class="${m}">word</${tag}>`.replace('class="w"', 'class="w"')); });
  }
  it('\\bdit is bold and italic', () => { expect(frag('\\p \\bdit word\\bdit*')).toContain('<b class="bdit"><i>word</i></b>'); });
  it('\\rb is ruby', () => { expect(frag('\\p \\rb 漢|gloss="kan"\\rb*')).toContain('<ruby class="rb">漢<rt>kan</rt></ruby>'); });
  it('\\jmp is a link', () => { expect(frag('\\p \\jmp text|link-href="https://x.org"\\jmp*')).toContain('<a class="jmp" href="https://x.org">text</a>'); });
  it('\\fig is a figure with an image and caption', () => {
    const h = frag('\\p \\fig A caption|src="a.jpg" size="col" ref="1.1"\\fig*');
    expect(h).toContain('role="figure"');
    expect(h).toContain('<img src="a.jpg" alt="A caption">');
    expect(h).toContain('<span class="caption">A caption</span>');
  });
  it('\\w with a Greek or Hebrew type keeps one class', () => {
    expect(frag('\\p \\wg λόγος|strong="G3056"\\wg*')).toContain('<span class="w" data-wtype="wg" data-strong="G3056">λόγος</span>');
  });
  it('\\v, \\va, \\vp, \\ca', () => {
    const h = frag('\\p\n\\v 1 \\va 2\\va* \\vp 1a\\vp* text');
    expect(h).toContain('<sup class="v"');
    expect(h).toContain('<sup class="va">(2)</sup>');
    expect(frag('\\p\n\\v 1 \\vp 1a\\vp* t')).toContain('<sup class="v" id="GEN.1.1" data-v="1"><span class="vp">1a</span></sup>');
  });
});

describe('tables, lists and notes', () => {
  it('a table has a header and a body', () => {
    const h = frag('\\tr \\th1 A \\th2 B\n\\tr \\tc1 1 \\tcr2 2');
    expect(h).toContain('<table class="table"><thead><tr><th class="th1">A</th><th class="th2">B</th></tr></thead><tbody><tr><td class="tc1">1</td><td class="tcr2">2</td></tr></tbody></table>');
  });
  it('a table without a header has just rows', () => {
    expect(frag('\\tr \\tc1 1 \\tc2 2')).toContain('<table class="table"><tr><td class="tc1">1</td><td class="tc2">2</td></tr></table>');
  });
  it('a header table round trips', () => {
    const u = serialize(parse('\\id GEN\n\\c 1\n\\tr \\th1 A \\th2 B\n\\tr \\tc1 1 \\tcr2 2\n', 'usfm'), 'usfm');
    expect(serialize(parse(serialize(parse(u, 'usfm'), 'biblehtml'), 'biblehtml'), 'usfm')).toBe(u);
  });
  it('nested lists nest', () => {
    expect(frag('\\li1 a\n\\li2 b\n\\li1 c')).toContain('<ul class="li"><li class="li1">a<ul class="li"><li class="li2">b</li></ul></li><li class="li1">c</li></ul>');
  });
  it('footnotes and cross references are linked list items', () => {
    const h = frag('\\p\n\\v 1 text\\f + \\fr 1:1 \\ft note\\f* more\\x - \\xo 1:1 \\xt Gen 2:2\\x*');
    expect(h).toContain('<ol class="f"><li class="f"');
    expect(h).toContain('<ol class="x"><li class="x"');
    expect(h).toContain('<sup class="caller"');
  });
  it('a sidebar is an aside; a chapter is a section with a heading', () => {
    const h = frag('\\esb\n\\s1 T\n\\p x\n\\esbe');
    expect(h).toContain('<aside class="esb">');
    expect(h).toContain('<section class="c" id="GEN.1" data-c="1">');
    expect(h).toContain('<h2 class="cn">1</h2>');
  });
});
