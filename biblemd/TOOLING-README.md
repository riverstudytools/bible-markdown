# Bible Markdown

An extension of Markdown for writing Bible translations, a matching HTML profile (Bible HTML), and tools that
convert between them and USFM.

| Package | What it is |
|---|---|
| `packages/spec` | The Bible Markdown and Bible HTML specifications, a reference stylesheet (`bible.css`) and a test corpus (`corpora/KSB.md`) |
| `packages/core` | `biblemd-core`: the conversion engine (TypeScript, no dependencies, runs in Node and browsers) |
| `packages/cli` | `biblemd`: command line converter |
| `packages/web` | Installable web app (PWA): editor, live preview, project navigator, conversion |

## Use it

```
npm install
npm run build
npm test                         # engine tests, including round trips of KSB.md

node packages/cli/dist/cli.js convert Romans.md --to usfm -o ROM.usfm
node packages/cli/dist/cli.js convert project/ --to html -o out/ --fidelity readable
node packages/cli/dist/cli.js check Romans.md
```

Once published, `npx biblemd convert in.usfm --to md` needs no install.

### The web app

`npm run dev` for development; `npm run build` produces `packages/web/dist`, which is plain static files.
Host them anywhere (GitHub Pages is set up in `.github/workflows/pages.yml`) and open the page; browsers offer to
install it. In Chrome, Edge and other Chromium browsers it edits a real project folder in place. In Firefox, Safari
and on phones it works on files held in the browser, with zip import and export.

The app explains itself: a bar under the header always says what to do next, every button has a tooltip and an
explanation, the **Explain** button turns on a mode where clicking anything describes it instead of using it, the
**Guide** has a syntax cheat sheet, and the **Insert** buttons add chapters, verses, footnotes and so on without
remembering the symbols. A test (`packages/web/test/guidance.test.ts`) fails if a new button or field is added
without help text or placeholder text.

### The engine

```ts
import { convert, parse, serialize } from 'biblemd-core';

const { output, diagnostics } = convert(text, 'biblemd', 'usfm', { fidelity: { level: 'readable' } });
```

Footnote bodies and explanatory text are read as regular Markdown (with `markdown-it`); scripture text uses Bible
Markdown syntax. Markdown lists, nested ` ```bible ` quotations and HTML work in scripture text as described in the
specification. The preview sanitizes HTML before showing it.

Every format parses into one shared document model and serializes out of it, so a new format is one parser and one
serializer. Parsers never throw: they return the best document they can plus diagnostics. Fidelity (`full`,
`readable`, `minimal`) is applied when writing, so one parsed document can be exported at any level.

## Quality checks

`npm test` runs the engine tests (element-per-marker, HTML5 validity, round-trip fuzzing, speed) and the web helper tests. `REVIEW.md` lists what the last audit found and the known limits.

## Licence

MIT-0. Third-party licenses are listed in `THIRD-PARTY-NOTICES.md`.
