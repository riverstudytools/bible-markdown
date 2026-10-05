# Third-party notices

Bible Markdown itself is MIT-0 licensed. It uses the following open-source packages. Their licenses require that
their copyright notices travel with copies of the software, which includes the built web app (`packages/web/dist`).

| Package | Used by | License |
|---|---|---|
| markdown-it | `biblemd-core` (regular Markdown regions) | MIT |
| mdurl, uc.micro, linkify-it, punycode.js | dependencies of markdown-it | MIT |
| entities | dependency of markdown-it | BSD-2-Clause |
| argparse | dependency of markdown-it (its command line tool only; not used or bundled by Bible Markdown) | Python-2.0 |
| CodeMirror 6 (`codemirror`, `@codemirror/*`) | web app | MIT |
| fflate | web app (zip import and export) | MIT |
| Vite, TypeScript, Vitest | build tools only; not distributed | MIT / Apache-2.0 |

The built web app is minified and does not carry the packages' license headers, so this file is copied into
`packages/web/public` and is served next to the app. If you host the app, keep it there. Each package's full license
text is in its folder under `node_modules`. Run `npx license-checker --production --summary` to list the exact
versions in use.
