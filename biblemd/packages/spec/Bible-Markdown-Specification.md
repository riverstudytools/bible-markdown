# Bible Markdown Specification

**Version 0.5 (draft).** Items marked **(proposal)** are design decisions made while completing this draft. They are open to change.

Bible Markdown is an extension of Markdown for writing a Bible translation. It also extends USFM: any USFM marker may be written directly in the text (see [Raw USFM](#raw-usfm)). Bible Markdown converts to and from [Bible HTML](Bible-HTML-Specification.md) and USFM.

For how to write ordinary Markdown, see the [Markdown Guide](https://www.markdownguide.org/basic-syntax/).

## License

Bible Markdown is licensed under the MIT-0 license. That means it can be freely used by anyone.

## Contents

1. Overview and contexts
2. Document structure
3. Elements (metadata, book names, headings, chapters, verses, numerals, paragraphs, poetry, additions, footnotes, small caps, emphasis, explanatory text, lists, nested quotations, HTML)
4. Typography
5. Escaping
6. Raw USFM
7. Differences from ordinary Markdown
8. Fidelity levels
9. Errors and recovery
10. Mapping summary
11. Rendering guidance (non-normative)
12. Example

## 1. Overview and contexts

A Bible Markdown document has three kinds of content, each with its own rules:

| Context | What it is | Rules |
|---|---|---|
| **Metadata** | The first paragraph of the file | `Key: Value` lines only |
| **Scripture text** | Everything after a book heading, outside explanatory blocks | Bible Markdown syntax (verses, chapters, poetry, and so on) plus a small part of Markdown |
| **Explanatory text** | Blocks fenced with `>>>` lines (and footnote bodies) | Regular Markdown, with no Bible syntax except nested ` ```bible ` quotations |

Bible Markdown reading apps may ignore or reformat anything described as "can choose" below.

## 2. Document structure

A file contains:

1. Optional metadata
2. One or more books. Each book begins with a book heading.
3. Within a book: optional explanatory text, then chapters, verses, paragraphs, poetry and headings, in any order that makes sense.

A file can hold one book or many. A project is normally a folder of files (see the engine documentation).

## 3. Elements

### 3.1 Metadata

Metadata must be the very first paragraph in the document, with its lines separated by single line breaks. Each line is `Key: Value`. A first paragraph is metadata only if every line has that form **and** the next thing in the file is a book heading (`# Name (ABC)`) or a raw `\id` line. Otherwise it is ordinary content, so a first paragraph such as `Note: this is a story` is not mistaken for metadata.

The Bible Markdown reading app should not display the metadata for the reader. It should be used internally.

    Version: World English Bible (WEB)
    Publisher: eBible.org
    Editor: Michael Paul Johnson
    Copyright: Public Domain
    Website: https://worldenglish.bible/
    Description: A Public Domain modern Bible translation.

Any key is allowed. Common keys: `Version`, `Publisher`, `Editor`, `Translator`, `Copyright`, `Website`, `Description`, `Language`. Keys are case-sensitive and are compared as written. **(proposal)** In USFM, metadata is stored as `\rem meta Key: Value` lines after `\id`. The `Version` key is also written as the text of the `\id` line (`\id ROM Kingdom Study Bible (KSB)`); when reading USFM, the text of `\id` supplies `Version` if no `\rem meta Version:` line exists. In Bible HTML it is stored as `<meta name="key" content="Value">` in the head, with the key lowercased.

### 3.2 Book names

For the name of a book of the Bible, use an H1 heading with the USFM book code in parentheses. Use the standard three-character USFM code (uppercase letters and digits, for example `GEN`, `1CO`, `3JN`).

    # Genesis (GEN)

**An H1 whose text ends with a parenthesized valid book code is a book heading.** No other H1 is a book heading.

The Bible Markdown reading app should display the name of the book, not the part in parentheses.

USFM mapping **(proposal)**: `# Romans (ROM)` becomes `\id ROM`, `\h Romans`, `\toc1 Romans` and `\mt1 Romans`. When converting from USFM, the heading text is taken from `\h`, then `\toc1`, then `\mt1`. Differences between these are preserved as raw USFM lines directly under the heading (see [Raw USFM](#raw-usfm)). In scripture text, headings can also be written with raw codes (for example `\mt2 Subtitle`).

### 3.3 Headings

**(proposal)**

| Bible Markdown | USFM |
|---|---|
| `# Title` (no book code) | `\mt1`. Further consecutive `#` lines in the same title block are `\mt2`, `\mt3`. |
| `## Heading` | `\ms1` |
| `### Heading` | `\s1` |
| `#### Heading` | `\s2` |
| `##### Heading` | `\s3` |
| `###### Heading` | `\s4` |

Use ATX headings (`#`) only. Underlined headings (`===`, `---`) are not recognized in scripture text. Other title and heading markers (`\ms2`, `\mr`, `\r`, `\sr`, `\d`, `\sp`) are written as raw USFM.

### 3.4 Chapter numbers

For chapter numbers, use a number followed by a colon, followed by either a space or another number that's followed by a space. Examples:

    1: In the beginning was the Word.
    1:1 In the beginning was the Word.

Do not use the chapter number in front of each verse. That will make the text harder to read. Instead, use verse numbers as described in the next section.

Rules **(proposal)**:

1. A chapter marker is recognized only at the start of a line (after an optional poetry `/`). A `3:16` in the middle of a line is ordinary text and needs no escape.
2. `N:M` means chapter N, verse M.
3. `N:` followed by text on the same line means chapter N, verse 1. So `1: In the beginning` is the same as `1:1 In the beginning`.
4. `N:` alone on a line (nothing after it) starts chapter N with no verse yet. Use this when a heading or a raw USFM line such as `\d` comes before verse 1.
5. Chapter numbers should be used
    1. at the beginning of each chapter
    2. (optionally) at the beginning of a quotation that doesn't start with verse 1. Example: `3:16 For God so loved the world`
6. Chapter numbers are not required to increase or to be unique. Textual issues (transpositions, displaced passages, parallel versions of a text) sometimes require them to go out of order. No ordering is enforced and no warning is raised.

The Bible Markdown reading app can choose how chapter numbers are displayed, and whether the two uses above are displayed the same or differently.

To write ordinary text that looks like a chapter marker at the start of a line, put a backslash right after it: `3:16\ is a well-known verse.`

USFM raw codes for alternate and published chapter numbers (`\ca`, `\cp`, `\cl`, `\cd`) are written as raw USFM.

### 3.5 Verse numbers

For verse numbers, use a number separated by spaces. You can also use two hyphenated numbers, if you're labeling a span. A letter after a number marks part of a verse (`3a`, `3b`).

    14 “You are the light of the world. A city located on a hill can’t be hidden. 15 Neither do you light a lamp and put it under a measuring basket, but on a stand; and it shines to all who are in the house. 16 Even so, let your light shine before men, that they may see your good works and glorify your Father who is in heaven.

    14 “You are the light of the world. A city located on a hill can’t be hidden. 15-16 Neither do you light a lamp and put it under a measuring basket, but on a stand; and it shines to all who are in the house. Even so, let your light shine before men, that they may see your good works and glorify your Father who is in heaven.

Grammar **(proposal)**: a verse marker is a token of the form `digits[letter][-digits[letter]]`, where
- it is at the start of the text, or preceded by whitespace (including a poetry `/` and its indentation), and
- it is followed by whitespace or the end of the line.

Any such token is a verse marker. This is why numerals in text need to be written out or escaped (see the next section).

Verse numbers are not required to increase or to be unique. Textual issues (transposed verses, verses that appear in a different place in some manuscripts, repeated text) sometimes require them to go out of order. No ordering is enforced and no warning is raised. Tools that need an ordered index (such as a navigator) should list verses in the order they appear in the file.

Verses can start and end anywhere. They don't need to coincide with paragraph or line breaks, and a verse can continue across paragraphs and poetry lines.

The Bible Markdown reading app can choose how to display verse numbers or whether to show them at all. Here is one option:

> <sup>14</sup>&nbsp;“You are the light of the world. A city located on a hill can’t be hidden. <sup>15</sup>&nbsp;Neither do you light a lamp and put it under a measuring basket, but on a stand; and it shines to all who are in the house. <sup>16</sup>&nbsp;Even so, let your light shine before men, that they may see your good works and glorify your Father who is in heaven.

Alternate and published verse numbers (`\va`, `\vp`) are written as raw USFM.

### 3.6 Numbers that aren't verse numbers

If the text contains a number, usually the number will be written out (“fifty”). However, where it needs to be written in numerals (“483”), it should be followed by a backslash: `483\`. The Bible Markdown reading app should remove the backslash.

**Character references.** `&amp;`, `&lt;`, `&nbsp;`, `&#8212;` and the other usual HTML character references are read as the characters they name, as in Markdown. The document model holds only the characters; USFM and Bible HTML are written without references, except `&nbsp;`, which Bible Markdown writes for a no-break space (USFM writes `~`).

The backslash is an escape only when it directly follows a digit and is followed by whitespace, punctuation, or the end of the line. If it is followed by a letter, it begins a raw USFM marker instead.

### 3.7 Paragraphs and line breaks

Line breaks work as they do in normal Markdown:

- A single line break is a space within the same paragraph.
- A blank line starts a new paragraph. This is USFM `\p`.
- Two or more spaces at the end of a line make a line break within the paragraph. **(proposal)** In USFM this is `//`; in Bible HTML it is `<br/>`.

Chapter and verse breaks don't need to coincide with line breaks.

Other paragraph styles (`\m`, `\pmo`, `\nb`, `\pi1` and so on) are written as raw USFM at the start of a line (see [Raw USFM](#raw-usfm)).

The Bible Markdown reading app can choose whether to honor the paragraph breaks, or to show verses in their own line, etc.

### 3.8 Poetry

For poetry, use a forward slash followed by a space at the very start of each line. Extra spaces after that first space indent the line.

    / Blessed is the man who doesn’t walk in the counsel of the wicked,
    /   nor stand on the path of sinners,
    /   nor sit in the seat of scoffers;

**Indent levels are relative to each poetry paragraph.** **(proposal for the exact rules)**

- A *poetry paragraph* is a run of consecutive `/` lines. A blank line or a non-poetry line ends it.
- Within a poetry paragraph, take the distinct indentation amounts (spaces after the `/`, with a tab counted as 4 spaces). The smallest is `\q1`, the next larger is `\q2`, and so on up to `\q4`. More than four distinct amounts is a warning, and the extras become `\q4`.
- So `/ a`, `/      b`, `/      c` (one space, then six, then six) means `q1`, `q2`, `q2`. A poetry paragraph where every line has the same indent is all `q1`, however many spaces that is.
- A blank line between two poetry paragraphs is a stanza break, which is USFM `\b`.
- When converting to Bible Markdown, `q1` is written as `/` plus 1 space, `q2` as `/` plus 3 spaces, `q3` as `/` plus 5, and `q4` as `/` plus 7.
- To override these rules for a line, use the raw code (for example `\q2 text`). Other poetry markers (`\qr`, `\qc`, `\qm1`, `\qd`, `\qa`) are written as raw USFM.

A verse number can appear anywhere in a poetry line.

The Bible Markdown reading app can format this as it chooses. If it uses poetry formatting, it should honor the relative indentation, like this:

> Blessed is the man who doesn’t walk in the counsel of the wicked,<br/>
> &nbsp;&nbsp;&nbsp;nor stand on the path of sinners,<br/>
> &nbsp;&nbsp;&nbsp;nor sit in the seat of scoffers;<br/>

### 3.9 Additions

Some Bible translations use separate formatting for words that aren't contained in the original text, but are added for flow or clarity. Place square brackets around the added word or phrase:

    to all [those] who are in Rome in [the] love of God, appointed saints---[may] favor [be] with you and peace from God our Father and [the] Lord Jesus Christ.

In USFM this is `\add ... \add*`. The Bible Markdown reading app can choose whether and how to format this.

Square brackets that are not additions are escaped: `\[` and `\]`. Markdown links and reference links are not available in scripture text, because the brackets always mean additions. Text such as `[. . .]` (an omission marker) is just an addition containing dots.

### 3.10 Footnotes

For footnotes, put curly brackets around the word or phrase that is being expanded on. Make sure that the closing curly bracket is where you want the footnote number/letter to be placed.

    1:1 The beginning of the gospel of Jesus {Christ,} the Son of God, 2 as it is written in {the prophets:}

The footnote itself should be found below the footnoted text, maybe at the end of the paragraph or chapter. It is a *footnote definition*: a line that starts with the footnoted text in curly brackets, then a colon, then the note.

    {Christ,}: or "the anointed one"
    {the prophets:}: some manuscripts "Isaiah the prophet"

**Matching rule.** The text in curly brackets in the definition must exactly match the footnoted text. Matching compares the text as written in the source (before typographic conversion, with any escapes and markup as typed). Each footnote in the text is matched to **the next unused definition after it** whose text matches exactly. Each definition is used once. This means the same words can be footnoted many times, each with its own note:

    ... apostleship {for} obedience of faith ...

    {for}: to

    ... that whomever you give yourselves to [as] servants {for} obedience ...

    {for}: LGNTI

How definitions are recognized **(proposal)**:

- A definition is a line starting with `{`, whose first `}` is directly followed by `:`. It is recognized only at the start of a line.
- Consecutive definition lines form a definition block. A definition block ends at a blank line.
- A definition may be on any line after the footnote it matches, anywhere later in the same book. It is not matched across a book heading.
- A definition that appears *before* any matching footnote, or that is not matched, produces a warning. The definition is kept as a comment (`\rem unmatched footnote definition {key}: note` in USFM, an HTML comment in Bible HTML). A footnote with no definition produces a warning, and its braces are removed.
- The note text is regular Markdown (see 3.13): emphasis, links and so on. Links become `\jmp text|link-href="url"\jmp*` in USFM and `<a>` in Bible HTML.
- A note can run over several lines. Lines that follow without a blank line continue the note (as in a Markdown paragraph). To add more paragraphs, indent them by two or more spaces; blank lines between indented paragraphs are allowed. The first paragraph is `\ft`; each further paragraph is `\fp`. Lists in a note are kept as text lines (`- item`). A nested ` ```bible ` quotation (see 3.15) can be used in a note: its paragraphs become `\fp` paragraphs, and its poetry lines become line breaks (USFM notes cannot hold indented poetry).

      {word}: First paragraph, with a [link](https://example.org).

        Second paragraph of the same note.
- Empty braces `{}` mark a footnote at a point with no footnoted words. Its definition is `{}: note`.

The Bible Markdown reading app should
1. Remove the curly brackets from the footnoted text.
2. Place the footnote number or letter where the closing curly bracket was.
3. Remove ending punctuation from the footnoted text when it is quoted in the note (since the footnoted text may end in punctuation that belongs to the sentence).
4. Format footnotes as it chooses.
5. Put the footnotes in the right order and gather them to where they should be (end of page, end of document, or wherever).

Here's an example of good formatting:

> The beginning of the gospel of Jesus Christ,<sup>[a]</sup> the Son of God, <sup>2</sup>&nbsp;as it is written in the prophets:<sup>[b]</sup>
>
> -----
> [a] “Christ”: or “the anointed one”
>
> [b] “the prophets”: some manuscripts “Isaiah the prophet”

USFM mapping **(proposal)**: `{Christ,}: or "the anointed one"` at verse 1:1 becomes `Christ,\f + \fr 1:1 \fq Christ \ft or "the anointed one"\f*`. The footnote is inserted where the closing brace was. `\fr` is the chapter and verse where the footnote occurs. `\fq` is the footnoted text without ending punctuation. When converting from USFM, a footnote is written as `{text}` if its `\fq` text directly precedes the footnote in the text; otherwise it is written as `{}`. Footnotes with complex content (`\fk`, `\fl`, `\fp`, `\fv` and so on) are kept as raw `\f ... \f*` at fidelity levels that keep them.

Cross-references (`\x`) are written as raw USFM.

### 3.11 Small caps

For words that start with a normal capital letter and then use small caps for the rest, as in Lᴏʀᴅ, follow the word with `^`:

    And the Lord^ God said to Abraham,

This should become

> And the Lᴏʀᴅ God said to Abraham,

**(proposal)** In USFM this is `\nd Lord\nd*` (name of deity), which is conventionally printed this way. In Bible HTML it is `<span class="nd">Lord</span>`. The first letter stays normal-sized and the rest of the word is in small caps. Other small-caps text uses the raw code `\sc ... \sc*`.

### 3.12 Emphasis

**(proposal)** `*text*` and `_text_` are `\em ... \em*`. `**text**` is `\bd ... \bd*`. All other character styles (`\it`, `\bdit`, `\wj`, `\tl`, `\qt`, `\k`, `\pn` and so on) are written as raw USFM.

### 3.13 Explanatory text

At the beginning or end of a book, you might want to have an explanatory note about the translation, book, etc. Use three or more `>` characters on lines before and after:

    # Mark (MRK)

    >>>>>>>>>>
    The book of Mark is thought to have been drawn from the apostle Peter's reminiscences.
    >>>>>>>>>>

    1:1 The beginning of the gospel of Jesus Christ, the son of God,

Rules **(proposal)**:

- The opening and closing lines each consist of three or more `>` characters and nothing else. The two lines need not be the same length.
- Inside, the text is **regular Markdown** (CommonMark with tables): paragraphs, headings, emphasis, links, bulleted and numbered lists, block quotes, tables, code blocks and raw HTML. Chapter, verse, poetry, addition and footnote syntax is **not** recognized inside, with one exception: a ` ```bible ` fence (see 3.15). So `1. Faith: ...` is a list item, not a verse.
- Explanatory text before the first chapter of a book is the book's **introduction**. In USFM: paragraphs are `\ip`, headings `\is1`/`\is2`, list items `\ili1`–`\ili4` (a numbered item keeps its typed number as text), block quotes `\ipq`, ended with `\ie`.
- Explanatory text anywhere else is a **study sidebar**. In USFM it is `\esb ... \esbe`: paragraphs are `\p`, headings `\s1`–`\s4`, list items `\li1`–`\li4`, block quotes `\pi1`.
- Tables become `\tr` rows with `\th1…` header cells and `\tc1…` cells.
- A sidebar whose blocks cannot be written as Markdown (for example one that contains poetry) is written in raw form: `\esb` on its own line, its blocks, then `\esbe`.

The Bible Markdown reading app should format this as it chooses.

### 3.14 Lists in scripture text

Markdown lists also work in scripture text and become USFM list markers:

    - 2 first item, with a verse number
      - a second-level item
    - 3 third item

    1. numbered items keep their typed numbers
    2. as text

- A bullet (`-`, `+` or `*` followed by a space) is `\li1`. Two more spaces of indentation per level give `\li2`, `\li3`, `\li4`.
- Item text may contain verse numbers, additions, footnotes and so on, and continues on following lines that are indented.
- A numbered item (`1.` or `1)`) is also a list item; the number stays in the text, because USFM list items are not numbered automatically. Only `1.` and `1)` can interrupt a paragraph; other numbers must follow a blank line.
- To write text that merely starts like a list item, escape it: `\- not a list`, `1\. not a list`.
- Tables in scripture text are written as raw USFM (`\tr`, `\tc1`, …).

### 3.15 Nested Bible Markdown (quotations)

Inside explanatory text, Bible Markdown can be nested with a fenced block labelled `bible`. The text after `bible` is an optional reference label.

    >>>>>>>>>>
    Paul echoes this passage:

    ```bible John 3:16
    16 For God so loved the world that he gave his only Son,
    / that whoever believes in him
    / should not perish
    ```
    >>>>>>>>>>

- The fence is read as Bible Markdown: paragraphs, poetry, additions, small caps and emphasis all work.
- **Chapter and verse numbers in a quotation are not verse markers.** They become plain superscript text (USFM `\sup 16\sup*`), so they never count in a navigator or index.
- Footnotes and headings are not available in a quotation; a footnote produces a warning and is dropped. (Quotations nest inside footnotes, but not footnotes inside quotations.)
- **USFM:** the quotation is the ordinary `\p`/`\q1` lines between two of USFM's own quotation milestones, `\qt-s |sid="bq1" x-quote="bible" x-ref="John 3:16"\*` and `\qt-e |eid="bq1"\*`. `\qt-s` / `\qt-e` is the standard milestone pair for marking a quotation that crosses paragraph boundaries; `sid` / `eid` pair the two ends, and attributes beginning with `x-` are USFM's sanctioned way to add custom attributes. A reader that does not know the `x-` attributes simply sees a quotation. Only a `\qt-s` that carries `x-quote="bible"` is read back as a nested passage; ordinary `\qt-s` quotations (speech, for example) are untouched.
- **In a footnote** the same milestones sit inside `\fp` paragraphs: `\fp \qt-s |sid="bq1" x-quote="bible"\*…` and `…\qt-e |eid="bq1"\*`.
- **Bible HTML:** `<blockquote class="qt" data-sid="bq1" data-x-quote="bible" data-x-ref="John 3:16">`.
- A tool that does not know the label shows the quotation as an ordinary code block, so the text stays readable.
- A fence can be used on its own outside a `>>>` block; it is then a quotation within the scripture text.

### 3.16 HTML

Ordinary HTML can be written anywhere. It is passed through to Bible HTML unchanged.

- **Inline HTML** in scripture text and notes: `<em>`, `<i>`, `<strong>`, `<b>`, `<sup>`, `<br>`, `<a href="…">` and `<span class="wj">` (a span with a single class that is a USFM marker name) are read as the USFM markers `\em`, `\it`, `\bd`, `\bd`, `\sup`, `//`, `\jmp` and `\wj`. This is the same mapping Bible HTML uses.
- **Block HTML**: a line that starts with a block-level tag (`<div>`, `<table>`, `<blockquote>`, `<pre>`, `<hr>`, `<img>`, `<!-- -->` and so on) starts an HTML block that lasts until the next blank line. Markdown is not read inside it.
- **Everything else is preserved** so that nothing is lost: in USFM, an unrecognized tag is stored in a custom milestone, `\zhtml |html="<mark>"\*` for inline tags and `\zhtmlb |html="<div …>…</div>"\*` for a block. Quotes and backslashes inside the value are written as `&quot;` and `&#92;` (and `&` as `&amp;`).
- The Readable and Minimal fidelity levels remove the tags and keep their text.
- Apps that display Bible HTML must sanitize it (remove scripts, event attributes, `javascript:` links, frames and similar) before showing it.

## 4. Typography

The engine converts typed punctuation into typographic characters, in scripture text, explanatory text, and notes. It does not do this in metadata, code, or raw USFM lines.

| Typed | Becomes |
|---|---|
| `---` | — (em dash) |
| `--` | – (en dash) |
| `"` | “ or ” |
| `'` | ‘ or ’ |

A quote mark is an opening quote when it follows the start of a line, whitespace, an opening bracket (`(`, `[`, `{`, `<`), a slash or a dash, and is a closing quote otherwise. An apostrophe inside a word (`God's`) is ’. Characters that are already typographic (“ ” ‘ ’ — –) are left alone. To keep a straight quote or a hyphen sequence, escape it: `\"`, `\'`, `\-`.

The conversion is one-way. When converting to Bible Markdown from USFM or Bible HTML, the typographic characters are written as they are. The conversion can be switched off with an engine option.

## 5. Escaping

| Write | To get |
|---|---|
| `483\` | the number 483 (not a verse marker) |
| `3:16\` at the start of a line | the text `3:16` (not a chapter marker) |
| `\[` `\]` `\{` `\}` `\^` | the character itself |
| `\/` at the start of a line | a slash that does not start a poetry line |
| `\*` `\_` `\#` `\"` `\'` `\-` | the character itself (as in Markdown) |
| `\\` | a single backslash |
| `\&` `\<` | a literal `&` or `<` (otherwise `&amp;` and so on are read as HTML character references, and `<span>` as a tag) |
| `\-` at the start of a line, `1\.` | text that is not a list item |

A backslash followed by a letter begins a raw USFM marker. A backslash followed by other ASCII punctuation is a Markdown escape. A backslash after a digit is the numeral escape in [3.6](#36-numbers-that-arent-verse-numbers).

## 6. Raw USFM

Any USFM marker may be written in Bible Markdown as a backslash, the marker name, and a space, for example `\m` or `\nb`. This is how Bible Markdown stays compatible with the whole of USFM. Markers are recognized by the pattern `\\([a-z][a-z0-9-]*)(\*)?` followed by whitespace or the end of the line.

There are four kinds of marker:

1. **Paragraph/block markers** (`\m`, `\mr`, `\pmo`, `\d`, `\li1`, ...) are written at the start of a line.
   - The block lasts until a blank line or the next block marker at the start of a line.
   - A single line break does not end it.
   - A block marker cannot contain another block marker.
   - A block can contain character markers and the Bible Markdown syntax above.
2. **Character/span markers** (`\w ...\w*`, `\wj ...\wj*`, `\fig ...\fig*`) can be anywhere inside text. They are closed with `\marker*`. A character marker not closed before the end of its block is closed there, with a warning. Character markers can be nested using the USFM `+` form: `\+nd`.
3. **Containers** (`\f ... \f*`, `\x ... \x*`, `\rq ... \rq*`, `\ca ... \ca*`, `\va 2\va*`, `\vp 2a\vp*`) are character markers whose contents are not formatted with Bible Markdown syntax. Verse numbers inside them are not verse markers.
4. **Word-limited markers** (`\v 3`, `\c 1`, `\b`) take only one word, or none, so that line breaks cannot affect them. `\v` and `\c` may be written, but the native syntax is preferred.

A sidebar that cannot be written as Markdown (for example one containing poetry) is written in raw form, `\esb` on its own line, then its blocks, then `\esbe` on its own line.

Milestones (`\ts\*`, `\qt-s |who="Jesus"\*`) are written as in USFM. Attributes (`\w word|lemma="x"\w*`) are written as in USFM.

Unknown markers, including custom markers that start with `\z`, are kept as they are (at fidelity levels that keep them).

## 7. Differences from ordinary Markdown

Bible Markdown aims to be compatible with ordinary Markdown, with these exceptions.

In scripture text:

- **Disabled:** block quotes, underlined headings, horizontal rules, indented code blocks and code spans, links and reference links (use raw HTML or `\jmp`), Markdown footnote and image syntax.
- **Changed:** `[ ]` mean additions, `{ }` mean footnotes, `/` at the start of a line means poetry, `^` after a word means small caps, and a number followed by a space is a verse number.
- **Enabled:** paragraphs, ATX headings (`#`), emphasis and strong emphasis, hard line breaks, backslash escapes, character references, bulleted and numbered lists (3.14), fenced `bible` quotations (3.15), and HTML (3.16).

In explanatory text and footnote bodies: all of regular Markdown is enabled; Bible syntax is disabled except the ` ```bible ` fence.

## 8. Fidelity levels

When converting, the user chooses how much information is kept. The engine keeps the full information in its document model, and the level is applied when writing.

| Level | What is written |
|---|---|
| **Full** | Everything, including unknown markers, attributes, comments and metadata |
| **Readable** (default **(proposal)**) | Everything except a configurable list of *noisy* markers and attributes |
| **Minimal** | Only what has native Bible Markdown syntax: metadata, book names, headings, chapters, verses, paragraphs, poetry, additions, simple footnotes, small caps, emphasis, explanatory text |

Default noisy list for **Readable**: word-level markup and its attributes (`\w`, `\wg`, `\wh`, `\wa`, `\rb`, `\ndx`, `\k`, and attributes such as `lemma`, `strong`, `srcloc`), milestones (`\ts`), and `\ide`, `\sts`. The list can be edited by the user.

When a marker is dropped:

- A character marker is dropped but **its text is kept**.
- A paragraph marker is dropped but **its text is kept**, as a plain paragraph (`\p`).
- A marker with no text (`\ide`, `\sts`, `\rem`, `\toc`, `\fig`) is removed completely.
- Complex footnotes (with `\fk`, `\fl` and so on) at the Minimal level are reduced to their text.

## 9. Errors and recovery

A parser never fails on a file. It produces the best document it can, plus a list of diagnostics (warning or error, location, message). Recoverable conditions include:

- Footnote without a definition, or definition without a footnote
- Unclosed character markers
- More than four poetry indent levels
- Unknown book codes
- A footnote definition that appears before the footnote it would match
- A block marker (such as `\p`) in the middle of a line instead of at the start
- An unknown USFM marker (for example a stray `\n` from escaped text)
- A footnote inside a ```bible quotation

Chapter and verse numbers are never checked for order or uniqueness (see 3.4 and 3.5).

## 10. Mapping summary

| Bible Markdown | USFM | Bible HTML |
|---|---|---|
| Metadata paragraph | `\rem meta Key: Value` | `<meta name="key" content="...">` |
| `# Romans (ROM)` | `\id ROM`, `\h`, `\toc1`, `\mt1` | `<article class="id" id="ROM">` |
| `# Title` | `\mt1` (`\mt2`, `\mt3`) | `<h1 class="mt">` |
| `##` / `###` / `####` | `\ms1` / `\s1` / `\s2` | `<h2 class="ms1">` / `<h3 class="s1">` / `<h4 class="s2">` |
| `3:` or `3:16` | `\c 3` (and `\v 16`) | `<section class="c">` (and `<sup class="v">`) |
| Blank-line paragraph | `\p` | `<p>` |
| `15` or `15-16` in text | `\v 15` or `\v 15-16` | `<sup class="v">` |
| `/` lines | `\q1`–`\q4` | `<p class="q1">`–`<p class="q4">` |
| Blank line between poetry paragraphs | `\b` | `<div class="b"></div>` |
| `[the]` | `\add the\add*` | `<span class="add">` |
| `{text}` and `{text}: note` | `\f + \fr c:v \fq text \ft note\f*` | Caller link and note in the chapter's notes list |
| `Lord^` | `\nd Lord\nd*` | `<span class="nd">` |
| `*x*` / `**x**` | `\em` / `\bd` | `<em class="em">` / `<strong class="bd">` |
| `483\` | `483` | `483` |
| `---` `--` `"` `'` | — – “ ” ‘ ’ | same characters |
| `>>>` block before chapter 1 | `\ip` … `\ie` | `<p class="ip">` … `<div class="ie">` |
| `>>>` block elsewhere | `\esb` … `\esbe` | `<aside class="esb">` |
| Two trailing spaces | `//` | `<br/>` |
| `- item` / `1. item` | `\li1` (`\li2`…) | `<ul class="li"><li class="li1">` |
| ` ```bible ` fence | `\qt-s |sid=… x-quote="bible"\*` … `\qt-e |eid=…\*`, numbers as `\sup` | `<blockquote class="qt">` |
| HTML tag with no USFM equivalent | `\zhtml |html="…"\*` / `\zhtmlb |html="…"\*` | the tag, unchanged |
| `&amp;` `&nbsp;` | `&` `~` | `&amp;` `&nbsp;` |
| `\m`, `\nb`, any marker | same | per the Bible HTML specification |

## 11. Rendering guidance (non-normative)

A Bible Markdown reading app should:

- not display metadata, backslash escapes, `^`, or curly brackets;
- let the reader choose how to show chapter numbers, verse numbers, additions, small caps, poetry, footnotes and explanatory text;
- be able to display a project made of files in any of the three formats as one Bible, organized by book and chapter.

## 12. Example

Bible Markdown:

```
Version: Kingdom Study Bible (KSB)
Copyright: CC0 or Public Domain

# Romans (ROM)

>>>>>>>>>>
In Romans, Paul is making an argument about the way Gentiles can be included in the church alongside Jews.
>>>>>>>>>>

1:1 Paul, a servant of Jesus Christ, set apart to [the] gospel of God, 2 which he promised before, 5 through whom we received favor and apostleship {for} obedience of faith in all the nations.

{for}: to

3:4 May it not be; instead, may God be true, but every human a liar, just as it is written,
/ "so that you may be vindicated in your word,
/ and you will prevail when you are judged."
```

USFM:

```
\id ROM Kingdom Study Bible (KSB)
\rem meta Version: Kingdom Study Bible (KSB)
\rem meta Copyright: CC0 or Public Domain
\h Romans
\toc1 Romans
\mt1 Romans
\ip In Romans, Paul is making an argument about the way Gentiles can be included in the church alongside Jews.
\ie
\c 1
\p
\v 1 Paul, a servant of Jesus Christ, set apart to \add the\add* gospel of God,
\v 2 which he promised before,
\v 5 through whom we received favor and apostleship for\f + \fr 1:5 \fq for \ft to\f* obedience of faith in all the nations.
\c 3
\p
\v 4 May it not be; instead, may God be true, but every human a liar, just as it is written,
\q1 “so that you may be vindicated in your word,
\q1 and you will prevail when you are judged.”
```
