# Review notes

An audit of the specifications, the engine and the web app: what was checked, what was found and fixed, and what is
still a known limit. The checks that can be automated are in `packages/core/test` and run with `npm test`.

## How it was checked

- **Elements against the USFM and USX definitions** (`elements.test.ts`): one test per marker confirms the element used.
- **Valid HTML5** (`validity.test.ts`): generated Bible HTML, including 200 random documents, is checked with
  html-validate (content-model rules such as "no block inside a paragraph"). The test also confirms the validator
  rejects a known-bad page.
- **Round-trip properties** (`fuzz.test.ts`): 300 random documents (more with `FUZZ_N=2000`) must come back unchanged
  through BM→USFM→BM, BM→HTML→USFM, USFM→BM→USFM and USFM→HTML→USFM, and Bible Markdown must be stable after one save.
- **Robustness**: random junk made of syntax fragments must never throw in any format.
- **Speed**: a 1 MB, 10-book project parses in about 0.4 s; one paragraph with 20,000 verses in about 0.1 s.

## Found and fixed

| Area | Problem | Fix |
|---|---|---|
| Elements | `\bd` used `<strong>` (importance) and `\bk`, `\rq`, `\tl`, `\k` were plain spans | `<b>`, `<cite>`, `<cite>`, `<i>`, `<b>`; rule and reasons are in the HTML spec 4.6 |
| Elements | `\fig` was a bare span; tables had no header section | span with `role="figure"`, image and caption; `<thead>`/`<tbody>` |
| Data loss | A no-break space at the start or end of a text run was trimmed as whitespace | only space, tab and line breaks are trimmed |
| Data loss | Milestones with names other than `-s`/`-e`/`ts` were lost through HTML | `data-milestone` marker |
| Data loss | `\c 2 \ca 3\ca*` lost the alternate number through Bible Markdown; a book-wide `\cl` moved after reading HTML | kept; order restored |
| Crashes | A raw `\esb` before any book, a quotation run ending at a non-block, and USFM text after `\qt-s` inside a note | fixed; found by the fuzz tests |
| Web app | Text typed while a save was in progress could be marked saved without being written | the saved text is compared with the current text; another save is queued |
| Detection | A first paragraph such as `Note: …` was taken as metadata | metadata must be followed by a book heading |
| Spec/engine | Spec described `\periph` sections, `\cat` as `data-cat`, `\usfm` and `\ide` in the head, `\zms` as noisy | engine implements `\periph`; spec corrected for the rest |
| Warnings | Stray `\n`, `~`, standalone `//`, `\|` inside a marker, a raw `\v` in text, headings in a quotation | now reported (or handled) |

## Known limits (not fixed)

1. **A number followed by a space is a verse number.** `12 o'clock` or `483 years` must be written `12\ o'clock`. The
   editor does not warn about this, because verse numbers may legitimately be out of order.
2. **USFM cannot express some Bible Markdown text.** A literal `~` is read by USFM software as a no-break space and a
   standalone `//` as an optional line break; the converter warns but cannot escape them. A `|` inside a marker such as
   `\wj` starts attributes in USFM.
3. **Straight apostrophe at the start of a word** (`'Tis`) becomes an opening quote. Type ’ directly or turn typography off.
4. **HTML lowercases attribute names.** USFM attributes that differ only by case would merge when passing through Bible HTML.
5. **A quotation that crosses a chapter boundary** (possible only in hand-written USFM) would give unbalanced
   `<blockquote>` tags in Bible HTML.
6. **Normalisation on round trips.** `\fr` is regenerated for footnotes, an `\ie` is added after an introduction,
   a ```bible quotation inside a footnote loses poetry indentation (line breaks remain), and line layout in USFM is not preserved.
7. **Regular Markdown in explanatory text** keeps what USFM can hold: emphasis, links, lists (4 levels), headings,
   block quotes, tables. Strikethrough formatting is dropped, images become their alt text, code becomes raw HTML.
8. **Web app.** It type-checks, builds and its helper logic is tested with jsdom, but it has not been exercised in a
   real browser here. The File System Access flow (Chrome/Edge), the install/offline behaviour, the Explain mode and
   drag/scroll behaviour need hands-on testing. The preview removes image sources for safety, so figures show only captions.
9. **No undo for conversions** that overwrite files (there is a confirmation, but no history).
10. **Preview-to-editor scroll sync** works for Bible Markdown only.
