# Bible HTML Specification

**Version 0.5 (draft).** Items marked **(proposal)** are design decisions made while completing this draft. They are open to change.

Bible HTML is a specification of HTML for Bible text. It uses USFM marker names as class names, and a small set of ordinary HTML tags, so that:

1. a simple CSS stylesheet can format it the way Bible software does;
2. it converts to and from USFM and [Bible Markdown](Bible-Markdown-Specification.md) without losing anything, in a mechanical way;
3. it is readable and correctly structured in any browser with no stylesheet at all.

## License

Bible HTML is licensed under the MIT-0 license. That means it can be freely used by anyone.

## Contents

1. Principles
2. Document structure
3. Books, chapters and verses
4. Marker mapping tables
5. Footnotes and cross-references
6. Lists and tables
7. Character markers, attributes and milestones
8. Study content, peripherals and custom markers
9. Whitespace, entities and identifiers
10. Conversion fidelity
11. Example
12. Minimal stylesheet

## 1. Principles

1. **The class name is the USFM marker name.** A class equal to a USFM marker name (without the backslash) means exactly what that marker means: `class="s1"` is `\s1`, `class="wj"` is `\wj`. Numbers are part of the name (`q2`, `mt1`).
2. **The class is authoritative; the tag is advisory.** A converter to USFM reads the class first. The tag exists so that the document reads sensibly without CSS (headings are headings, emphasis is emphasis). A reader that finds no class falls back on the tag: `<p>` is `\p`, `<h1>`…`<h6>` are title and heading markers, `<em>` is `\em`.
3. **Paragraph-level markers are block elements; character markers are `<span>`s** (or a natural tag such as `<em>`) with a class.
4. **Structure is carried by a few containers**, so a stylesheet can target a book or a chapter and so a navigator can find them: `article.id` for a book and `section.c` for a chapter.
5. **Attributes become `data-*` attributes.** USFM attributes (`lemma`, `strong`, `srcloc`, …) are written as `data-lemma`, `data-strong`, `data-srcloc`.
6. **Nothing is generated except identifiers, chapter heading text, footnote callers and the parentheses described below.** Everything else in the document is content from the source.
7. **Valid HTML5**, written in UTF-8, also well-formed as XML where possible (`<br/>`, quoted attributes).

## 2. Document structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="bible-html" content="0.5">
  <meta name="usfm" content="3.1">
  <title>Romans</title>
  <meta name="version" content="Kingdom Study Bible (KSB)">
  <meta name="copyright" content="CC0 or Public Domain">
  <link rel="stylesheet" href="bible.css">
</head>
<body>
  <article class="id" id="ROM" data-id="ROM" data-id-text="Kingdom Study Bible (KSB)">
    …
  </article>
</body>
</html>
```

- **`<meta name="bible-html">`** gives the version of this specification.
- **`<meta name="usfm">`** is the USFM version (`\usfm`).
- **Other `<meta name="…">` elements** carry Bible Markdown metadata. The name is the metadata key in lowercase, with spaces as hyphens; when that differs from the original key, the original is kept in `data-key`. **(proposal)**
- **The language** is the `lang` attribute of `<html>`. A different language for part of the text uses `lang` on the element.
- **`<title>`** is the book name for a single-book file.
- A file holds one or more books, each in its own `<article class="id">`. A file with no `article` is a fragment: every converter accepts a fragment, with the book unknown.
- `\ide` (encoding) has no equivalent, since the file is always UTF-8. At full fidelity the original value is kept as `<meta name="ide" content="…">`.

## 3. Books, chapters and verses

### 3.1 Book

`\id GEN text` becomes
```html
<article class="id" id="GEN" data-id="GEN" data-id-text="text">…</article>
```
The article lasts until the next `\id` or the end of the file. The three-character code is the `id` and `data-id`. The rest of the `\id` line, if any, is `data-id-text`.

### 3.2 Chapter

`\c 3` becomes
```html
<section class="c" id="ROM.3" data-c="3">
  <h2 class="cn">3</h2>
  …
</section>
```
- The `<section>` lasts until the next `\c` or the end of the book. Content before the first `\c` (title, introduction) sits directly in the `<article>`.
- `<h2 class="cn">` is the displayed chapter heading. Its content depends on other markers:

| USFM | Chapter heading |
|---|---|
| `\c 3` alone | `<h2 class="cn">3</h2>` |
| `\cl Psalm` before the first chapter (applies to the whole book) | `<h2 class="cn"><span class="cl">Psalm</span> 3</h2>`, and `data-cl="Psalm"` on the `article` |
| `\cl Chapter Three` after `\c 3` (just this chapter) | `<h2 class="cn"><span class="cl">Chapter Three</span></h2>` |
| `\cp III` after `\c 3` (published chapter number) | `<h2 class="cn"><span class="cp">III</span></h2>`, with `data-c="3"` kept on the section |
| `\ca 2\ca*` (alternate chapter number) | `… <span class="ca">(2)</span>` inside the heading. The parentheses are added by the converter and removed when converting back. |

- `\cd text` (chapter description) is `<p class="cd">text</p>`, the first block after the heading.
- **Chapter numbers need not be in order or unique** (transpositions and other textual issues). Everything in this specification works with any numbers. When two elements would get the same `id`, the second gets `-2`, the third `-3`, and so on (`ROM.3-2`); `data-c` always holds the real number.

### 3.3 Verse

`\v 2 text` becomes
```html
<sup class="v" id="ROM.1.2" data-v="2">2</sup> text
```
- The number is followed by a normal space in the HTML. It is the stylesheet's job to keep the number and the following word together (for example with `white-space: nowrap` on the pair, or a margin).
- **Verse markers are point markers.** They are not containers, so a verse can cross paragraphs, poetry lines, and other blocks.
- A bridge `\v 15-16` is `<sup class="v" id="ROM.1.15" data-v="15-16">15-16</sup>`. The `id` uses the first number.
- A split verse `\v 3a` is `data-v="3a"`, `id="ROM.1.3a"`.
- The `id` is `BOOK.chapter.verse`, using the chapter and verse as they are in the file. Duplicate ids get `-2`, `-3`, … as above. A verse before the first chapter has no `id`.
- `\va 2\va*` (alternate verse number) is `<sup class="va">(2)</sup>`; the parentheses are added by the converter and removed when converting back.
- `\vp 2a\vp*` (published verse number) replaces the displayed number: `<sup class="v" id="ROM.1.2" data-v="2"><span class="vp">2a</span></sup>`.

## 4. Marker mapping tables

Every USFM marker that is not listed is handled by the general rules:

- an unlisted **paragraph-level marker** `\name` becomes `<p class="name">`;
- an unlisted **character marker** `\name … \name*` becomes `<span class="name">…</span>`;
- an unlisted **milestone** `\name-s |attrs\*` / `\name-e \*` becomes an empty `<span class="name-s" data-…></span>` / `<span class="name-e"></span>`;
- a **custom marker** (`\z…`) is handled in the same way, with its name as the class.

### 4.1 Identification

| USFM | Bible HTML | Displayed |
|---|---|---|
| `\id` | `<article class="id" …>` (section 3.1) | container |
| `\usfm 3.1` | `<!-- \usfm 3.1 -->` | no |
| `\ide` | see section 2 | no |
| `\sts 5` | `<!-- \sts 5 -->` | no |
| `\rem text` | `<!-- text -->` | no |
| `\h text` | `<p class="h" hidden>text</p>` | no |
| `\toc1`, `\toc2`, `\toc3` | `<span class="toc1" hidden>…</span>` | no |
| `\toca1`, `\toca2`, `\toca3` | `<span class="toca1" hidden>…</span>` | no |

**(proposal)** `\h` and the `\toc` markers are not meant to be read as content, so they carry the `hidden` attribute. A stylesheet can show them with `[hidden] { display: revert; }`. A comment never contains `--`; it is written as `- -`, and converted back.

An HTML comment that is not of the form `<!-- \marker … -->` is a `\rem`.

### 4.2 Titles and headings

| USFM | Bible HTML |
|---|---|
| `\mt1` `\mt2` `\mt3` (consecutive) | `<h1 class="mt"><span class="mt1">…</span>\n<span class="mt2">…</span></h1>` — one heading for a run of title lines, one span per line, separated by a newline |
| `\mte1` … | `<p class="mte"><span class="mte1">…</span></p>` (same grouping) |
| `\ms1` `\ms2` `\ms3` | `<h2 class="ms1">…</h2>` (the level is in the class; the tag is `h2` for all) |
| `\mr text` | `<p class="mr">…</p>` |
| `\s1` `\s2` `\s3` `\s4` | `<h3 class="s1">` `<h4 class="s2">` `<h5 class="s3">` `<h6 class="s4">` |
| `\sr text` | `<p class="sr">…</p>` |
| `\r text` | `<p class="r">…</p>` |
| `\rq text\rq*` | `<span class="rq">…</span>` |
| `\d text` | `<p class="d">…</p>` |
| `\sp text` | `<p class="sp">…</p>` |
| `\sd1` … | `<div class="sd1"></div>` (a semantic division; empty) |
| `\cl`, `\cp`, `\ca`, `\cd` | see section 3.2 |

### 4.3 Introduction

An introduction is a run of the introduction blocks below, ended by `\ie`.

| USFM | Bible HTML |
|---|---|
| `\imt1` `\imt2` … | `<h1 class="imt"><span class="imt1">…</span>…</h1>` (grouped like `\mt`) |
| `\is1` `\is2` | `<h3 class="is1">` `<h4 class="is2">` |
| `\ip` `\ipi` `\im` `\imi` `\ipq` `\imq` `\ipr` | `<p class="ip">` … (class = marker) |
| `\iq1` `\iq2` `\iq3` | `<p class="iq1">` … |
| `\ib` | `<div class="ib"></div>` |
| `\ili1` `\ili2` | list, see section 6 (`ul.ili` / `li.ili1`) |
| `\iot text` | `<h3 class="iot">…</h3>` |
| `\io1` `\io2` | list, see section 6 (`ul.io` / `li.io1`) |
| `\ior 1:1-7\ior*` | `<span class="ior">…</span>` |
| `\iqt text\iqt*` | `<span class="iqt">…</span>` |
| `\iex` | `<p class="iex">…</p>` |
| `\imte1` | `<p class="imte1">…</p>` |
| `\ie` | `<div class="ie"></div>` |

### 4.4 Paragraphs

| USFM | Bible HTML |
|---|---|
| `\p` | `<p>…</p>` (no class) |
| `\m` `\po` `\pr` `\cls` `\pmo` `\pm` `\pmc` `\pmr` `\pi1` `\pi2` `\mi` `\pc` `\ph1` `\phi` | `<p class="…">` (class = marker) |
| `\nb` | `<!-- \nb -->` directly before the next block (no break with the previous paragraph) |
| `\b` | `<div class="b"></div>` |
| `\lit` | `<p class="lit">…</p>` |
| `//` (optional line break) and a hard line break | `<br/>` |

An empty `\p` before poetry or a heading is written as an empty `<p></p>` only when the source had it (full fidelity).

### 4.5 Poetry

| USFM | Bible HTML |
|---|---|
| `\q1` `\q2` `\q3` `\q4` (and `\q` = `\q1`) | `<p class="q1">…</p>` |
| `\qr` `\qc` | `<p class="qr">` `<p class="qc">` |
| `\qm1` `\qm2` | `<p class="qm1">` … |
| `\qd` | `<p class="qd">` |
| `\qa text` (acrostic heading) | `<h4 class="qa">…</h4>` |
| `\qs Selah\qs*` | `<span class="qs">…</span>` |
| `\qac a\qac*` | `<span class="qac">…</span>` |
| `\b` between stanzas | `<div class="b"></div>` |

**(proposal)** Each poetry line is its own `<p>` with the marker as the class. This keeps the table simple and the USFM conversion exact. A stylesheet gives the lines their indentation and, if desired, tight spacing between consecutive lines.

### 4.6 Character styles

**Rule for choosing the element.** An HTML element is used only when its meaning in HTML is the same as the meaning of the USFM marker (the definitions are in the USFM and USX documentation). Where there is no such element the marker is a `<span>`. The class is always present and is authoritative; a reader that finds no class falls back on the element (`<em>` is `\em`, `<b>` is `\bd`, `<i>` is `\it`, `<sup>` is `\sup`, `<a>` is `\jmp`).

| USFM | Meaning in USFM | Bible HTML | Why this element |
|---|---|---|---|
| `\em` | Emphasis | `<em class="em">` | Same meaning |
| `\bd` | Bold | `<b class="bd">` | Presentational bold. `<strong>` would claim "importance", which USFM does not |
| `\it` | Italic | `<i class="it">` | Same meaning |
| `\bdit` | Bold italic | `<b class="bdit"><i>…</i></b>` | Both |
| `\sup` | Superscript | `<sup class="sup">` | Same meaning |
| `\bk` | Quoted book title | `<cite class="bk">` | A title of a work |
| `\rq` | Reference to the source of a quotation | `<cite class="rq">` | A reference to a source |
| `\tl` | Transliterated or foreign words | `<i class="tl">` | HTML defines `<i>` for foreign terms and transliteration |
| `\k` | Keyword | `<b class="k">` | HTML defines `<b>` for keywords |
| `\jmp` | Link | `<a class="jmp" href="…">` | Same meaning |
| `\rb` | Ruby (base text with a gloss) | `<ruby class="rb">…<rt>gloss</rt></ruby>` | Same meaning |
| `\fig` | Figure with caption | `<span class="fig" role="figure" data-src="…" data-size="…" data-ref="…"><img src="…" alt="…"><span class="caption">…</span></span>` | `\fig` sits inside a paragraph, and `<figure>` cannot, so a span with the `figure` role is used |
| `\add` | Translator's addition | `<span class="add">` | `<ins>` means a tracked revision of the document |
| `\dc` `\nd` `\ord` `\pn` `\png` `\addpn` `\qt` `\sig` `\sls` `\wj` `\no` `\sc` `\qs` `\qac` `\pro` `\ior` `\iqt` `\ndx` `\litl` `\lik` `\liv#` | Semantic or styling markers with no HTML equivalent | `<span class="…">` | `<q>` is deliberately not used for `\qt`: browsers add quotation marks that are not in the text |
| `\w`, `\wg`, `\wh`, `\wa` | Word with attributes | `<span class="w" data-…>` (see section 7) | No HTML equivalent |
| `\va`, `\vp`, `\ca` | Alternate and published numbers | `<sup class="va">`, `<span class="vp">`, `<span class="ca">` | See sections 3.2 and 3.3 |

A nested character marker (`\+nd`) is a nested element. Character styles never cross a paragraph boundary in USFM, so they never need to be split in the HTML.

## 5. Footnotes and cross-references

**(proposal)** A note is a numbered mark in the text and the note itself in a list at the end of the chapter.

In the text, at the place of `\f`:
```html
…apostleship for<sup class="caller" id="ROM.1.fnref1"><a href="#ROM.1.fn1">a</a></sup> obedience…
```
At the end of the chapter `section` (or the end of the book `article` for notes outside a chapter, and for endnotes `\fe`):
```html
<aside class="notes">
  <ol class="f">
    <li class="f" id="ROM.1.fn1" data-caller="+"><span class="fr">1:5</span> <span class="fq">for</span> <span class="ft">to</span></li>
  </ol>
</aside>
```
- `\f + \fr 1:5 \fq for \ft to\f*` is the `<li class="f">`. The inner markers (`\fr`, `\fk`, `\fq`, `\fqa`, `\fl`, `\fw`, `\fp`, `\fv`, `\ft`, `\fdc`, `\fm`) are `<span class="…">` with the marker as the class. `\fp` (footnote paragraph) is a `<br/>`-separated `<span class="fp">`.
- The visible caller (`a`, `b`, … `z`, `aa`, …) restarts in each chapter and is generated by the converter. The USFM caller (`+`, `-`, or a literal character) is `data-caller` on the `<li>`. A note whose USFM caller is `-` (no caller) keeps its place and its list entry, but its mark is written with the `hidden` attribute.
- The mark's `id` and the note's `id` link to each other: the mark's `href` is the note's `id`. The note's position in the text is the mark's position.
- Cross-references `\x` work the same way, with `class="x"`, the inner markers `\xo`, `\xk`, `\xq`, `\xt`, `\xta`, `\xop`, `\xot`, `\xnt`, `\xdc`, and their own `<ol class="x">` and their own caller sequence.
- Ids use a counter per chapter, `fn1`, `fn2`, …, `xr1`, …, in the order the notes appear.
- Notes are not nested.

## 6. Lists and tables

### 6.1 Lists

Consecutive list-item markers are grouped into one list. A deeper level nests inside the previous item.

| USFM | Bible HTML |
|---|---|
| `\lh text` | `<p class="lh">…</p>` (before the list) |
| `\li1 text` `\li2 text` | `<ul class="li"><li class="li1">…<ul class="li"><li class="li2">…</li></ul></li></ul>` |
| `\lf text` | `<p class="lf">…</p>` (after the list) |
| `\lim1` | `<ul class="lim"><li class="lim1">` |
| `\ili1` `\io1` | `<ul class="ili"><li class="ili1">`, `<ul class="io"><li class="io1">` |
| `\litl`, `\lik`, `\liv1` | `<span class="litl">`, `<span class="lik">`, `<span class="liv1">` inside the item |

The class on `<li>` carries the level and wins over the nesting depth.

### 6.2 Tables

A run of `\tr` rows is one table. Leading rows made only of header cells (`\th#`, `\thr#`) are wrapped in `<thead>` and the other rows in `<tbody>`; a table with no header row has its rows directly in the `<table>`.

| USFM | Bible HTML |
|---|---|
| `\tr` | `<tr>` inside `<table class="table">` |
| `\th1` `\thr1` | `<th class="th1">` `<th class="thr1">` |
| `\tc1` `\tcr1` `\tcc1` | `<td class="tc1">` `<td class="tcr1">` `<td class="tcc1">` |
| `\tc1-2` (column span) | `<td class="tc1" colspan="2" data-cols="1-2">` |

## 7. Character markers, attributes and milestones

### 7.1 Attributes

USFM attributes appear after a `|`: `\w gracious|lemma="grace" strong="G5485"\w*`. In Bible HTML each is a `data-` attribute:
```html
<span class="w" data-lemma="grace" data-strong="G5485">gracious</span>
```
- A bare default attribute (`\w gracious|grace\w*`) is normalized to its name (`data-lemma`). The default attribute of each marker is the one the USFM specification defines (`lemma` for `\w`, `link-href` for `\jmp`, and so on).
- `\wg` (Greek), `\wh` (Hebrew) and `\wa` (aramaic) are `class="w"` with `data-wtype="wg"` etc., so that one CSS rule styles all words. **(proposal)**

### 7.2 Milestones

```html
<span class="ts"></span>
<span class="qt-s" data-sid="qt1" data-who="Jesus"></span> … <span class="qt-e" data-eid="qt1"></span>
```
Milestones are empty spans. A start/end pair is two spans, as in USFM. A milestone whose name does not end in `-s`/`-e` and is not `ts` also carries an empty `data-milestone` attribute, so that it can be told from an ordinary empty span.

## 8. Study content, peripherals and custom markers

| USFM | Bible HTML |
|---|---|
| `\esb … \esbe` | `<aside class="esb">…</aside>`, containing the paragraphs, headings and lists of the sidebar |
| `\cat people\cat*` (a category inside a sidebar) | `<span class="cat">people</span>` |
| `\periph Title\|id="x"` | `<section class="periph" data-periph="x"><h2 class="periph-title">Title</h2>…</section>`, ending at the next `\periph`, the next chapter or the end of the book |
| `\zname …` | `<p class="zname">` for a paragraph-level marker, `<span class="zname">` for a character marker |

### 8.1 Raw HTML and quotations

**(proposal)** Bible HTML may contain ordinary HTML that has no USFM equivalent. Such markup is preserved so that conversions are lossless.

| Bible HTML | USFM | Notes |
|---|---|---|
| Any other inline element (`<mark>`, `<span class="custom">`, …) | `\zhtml |html="<mark>"\*` before and `\zhtml |html="</mark>"\*` after the contents | One milestone per tag. A `class` that is not a known USFM marker name counts as "other". |
| Any other block element (`<div>`, `<pre>`, `<hr>`, `<img>`, an unclassed `<blockquote>`, …) | `\zhtmlb |html="…whole element…"\*` | The whole element, with its contents, in one value. |
| `<blockquote class="qt" data-sid="bq1" data-x-quote="bible" data-x-ref="…">…</blockquote>` | `\qt-s |sid="bq1" x-quote="bible" x-ref="…"\*` … `\qt-e |eid="bq1"\*` | A quoted passage, using USFM's standard quotation milestones; `x-` attributes are USFM's custom attributes. Verse and chapter numbers inside it are `<sup class="sup">`, not `<sup class="v">`, so they are never verse markers. Other blockquotes are raw HTML. |

- In `html` values, `&` is written `&amp;`, `"` is written `&quot;` and `\` is written `&#92;`.
- `\zhtml` and `\zhtmlb` are milestones, so USFM software that does not know them ignores them.
- Programs that display Bible HTML from untrusted sources must sanitize it first.

## 9. Whitespace, entities and identifiers

- Runs of spaces and newlines in text content are one space. A deliberate line break is `<br/>`.
- A non-breaking space is `&nbsp;`; a thin or narrow no-break space is written as the character.
- `<`, `>` and `&` in text are written as `&lt;`, `&gt;` and `&amp;`; USFM `~` is `&nbsp;`. Quotes and apostrophes are written as typographic characters.
- All `id`s are unique within the file (see the duplicate rule in section 3.2). Ids are `BOOK`, `BOOK.chapter`, `BOOK.chapter.verse`, `BOOK.chapter.fn#`, `BOOK.chapter.fnref#`, and the same with `xr#`.

## 10. Conversion fidelity

Bible HTML holds everything USFM can hold. The fidelity levels (full, readable, minimal) are applied when writing; see the Bible Markdown specification, section 8.

- **Full:** all markers, attributes, comments, unknown and custom markers.
- **Readable:** the same, except a configurable list of noisy markers and attributes (by default word-level `\w` markup and its `data-*` attributes, milestones, `\ide`, `\sts`). Their text is kept.
- **Minimal:** only the constructs that have native Bible Markdown syntax.

Round trips that are lossless at full fidelity: USFM → HTML → USFM; and Bible Markdown → HTML → Bible Markdown. The exception is the layout of USFM source, which is normalized: line breaks within a paragraph, the position of markers at line starts, and the use of `\q` for `\q1`.

## 11. Example

USFM:
```
\id ROM Kingdom Study Bible (KSB)
\h Romans
\toc1 Romans
\mt1 Romans
\c 1
\p
\v 1 Paul, a servant of Jesus Christ, set apart to \add the\add* gospel of God,
\v 5 through whom we received favor and apostleship for\f + \fr 1:5 \fq for \ft to\f* obedience of faith in all the nations.
\c 3
\q1 \v 4 “so that you may be vindicated in your word,
\q1 and you will prevail when you are judged.”
```

Bible HTML:
```html
<article class="id" id="ROM" data-id="ROM" data-id-text="Kingdom Study Bible (KSB)">
  <p class="h" hidden>Romans</p>
  <span class="toc1" hidden>Romans</span>
  <h1 class="mt"><span class="mt1">Romans</span></h1>
  <section class="c" id="ROM.1" data-c="1">
    <h2 class="cn">1</h2>
    <p><sup class="v" id="ROM.1.1" data-v="1">1</sup> Paul, a servant of Jesus Christ, set apart to <span class="add">the</span> gospel of God,
    <sup class="v" id="ROM.1.5" data-v="5">5</sup> through whom we received favor and apostleship for<sup class="caller" id="ROM.1.fnref1"><a href="#ROM.1.fn1">a</a></sup> obedience of faith in all the nations.</p>
    <aside class="notes">
      <ol class="f">
        <li class="f" id="ROM.1.fn1" data-caller="+"><span class="fr">1:5</span> <span class="fq">for</span> <span class="ft">to</span></li>
      </ol>
    </aside>
  </section>
  <section class="c" id="ROM.3" data-c="3">
    <h2 class="cn">3</h2>
    <p class="q1"><sup class="v" id="ROM.3.4" data-v="4">4</sup> “so that you may be vindicated in your word,</p>
    <p class="q1">and you will prevail when you are judged.”</p>
  </section>
</article>
```

## 12. Minimal stylesheet

A starting point for a stylesheet that formats Bible HTML like Bible software. It is not part of the specification.

```css
[hidden] { display: none; }
article.id { max-width: 40em; margin: 0 auto; font-family: serif; line-height: 1.5; }
.cn { font-size: 1.6em; margin: 1.2em 0 .4em; }
.mt1 { font-size: 2em; display: block; text-align: center; }
.s1 { font-size: 1.1em; font-style: italic; margin: 1em 0 .2em; }
.ms1 { font-size: 1.3em; margin: 1.4em 0 .4em; }
.v, .va { font-size: .7em; font-weight: bold; margin-right: .15em; }
.caller { font-size: .7em; }
p { margin: 0 0 .6em; }
p.q1, p.q2, p.q3, p.q4 { margin: 0; }
p.q1 { padding-left: 1em; text-indent: -1em; }
p.q2 { padding-left: 2em; text-indent: -1em; }
p.q3 { padding-left: 3em; text-indent: -1em; }
p.q4 { padding-left: 4em; text-indent: -1em; }
.b { height: .8em; }
.add { font-style: italic; }
.nd { font-variant: small-caps; }
.nd::first-letter { font-variant: normal; }
.wj { color: #a00; }
.r, .sr, .mr { font-size: .9em; text-align: center; }
aside.notes { font-size: .85em; border-top: 1px solid #999; margin-top: 1.5em; }
aside.esb { border: 1px solid #999; padding: .5em 1em; background: #f6f6f6; }
```
