#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { basename, extname, join, relative, dirname } from 'node:path';
import { convert, detectFormat, parse, type Format, type Fidelity, type Diagnostic } from 'biblemd-core';

const FORMATS: Record<string, Format> = { usfm: 'usfm', sfm: 'usfm', md: 'biblemd', biblemd: 'biblemd', markdown: 'biblemd', html: 'biblehtml', biblehtml: 'biblehtml', htm: 'biblehtml' };
const EXT: Record<Format, string> = { usfm: '.usfm', biblemd: '.md', biblehtml: '.html' };

const HELP = `biblemd - convert between Bible Markdown, Bible HTML and USFM

Usage:
  biblemd convert <input> [-o <output>] [--to usfm|md|html] [--from usfm|md|html]
                  [--fidelity full|readable|minimal] [--no-typography] [--css <file>]
  biblemd check <input>            Print diagnostics (warnings and errors) for a file
  biblemd --help

<input> may be a file or a folder. For a folder, every .usfm/.sfm/.md/.html file is
converted and the folder structure is kept; -o names the output folder.
If -o is omitted for a file, the result is printed to standard output.
The format of each input file is detected from its extension and content.
`;

function args(argv: string[]) {
  const pos: string[] = []; const opt: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o') opt.o = argv[++i];
    else if (a.startsWith('--')) {
      const k = a.slice(2);
      if (['to', 'from', 'fidelity', 'css', 'output'].includes(k)) opt[k] = argv[++i]; else opt[k] = true;
    } else pos.push(a);
  }
  return { pos, opt };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!f.startsWith('.') && f !== 'node_modules') walk(p, out); } else out.push(p);
  }
  return out;
}

function report(file: string, ds: Diagnostic[]) {
  for (const d of ds) if (d.severity !== 'info') console.error(`${file}${d.line ? ':' + d.line : ''}: ${d.severity}: ${d.message}`);
}

function main() {
  const { pos, opt } = args(process.argv.slice(2));
  const cmd = pos[0];
  if (!cmd || opt.help || cmd === 'help') { console.log(HELP); return; }

  if (cmd === 'check') {
    let bad = 0;
    for (const f of pos.slice(1)) {
      const src = readFileSync(f, 'utf-8');
      const fmt = (opt.from && FORMATS[String(opt.from)]) || detectFormat(f, src);
      if (!fmt) { console.error(`${f}: unknown format`); bad++; continue; }
      const doc = parse(src, fmt);
      report(f, doc.diagnostics);
      bad += doc.diagnostics.filter((d) => d.severity !== 'info').length;
    }
    process.exitCode = bad ? 1 : 0;
    return;
  }

  if (cmd !== 'convert') { console.error(`Unknown command: ${cmd}\n`); console.log(HELP); process.exitCode = 2; return; }
  const input = pos[1];
  if (!input) { console.error('Missing input.\n'); console.log(HELP); process.exitCode = 2; return; }
  const out = (opt.o ?? opt.output) as string | undefined;
  const to = opt.to ? FORMATS[String(opt.to)] : out && !statSync(input).isDirectory() ? FORMATS[extname(out).slice(1).toLowerCase()] : undefined;
  if (!to) { console.error('Please say what to convert to: --to usfm|md|html'); process.exitCode = 2; return; }
  const fidelity = String(opt.fidelity ?? 'full') as Fidelity;
  if (!['full', 'readable', 'minimal'].includes(fidelity)) { console.error('--fidelity must be full, readable or minimal'); process.exitCode = 2; return; }
  const css = opt.css ? String(opt.css) : undefined;

  const one = (file: string) => {
    const src = readFileSync(file, 'utf-8');
    const from = (opt.from && FORMATS[String(opt.from)]) || detectFormat(file, src);
    if (!from) { console.error(`${file}: skipped (unknown format)`); return null; }
    const r = convert(src, from, to, { typography: !opt['no-typography'], fidelity: { level: fidelity }, html: { css } });
    report(file, r.diagnostics);
    return r.output;
  };

  if (statSync(input).isDirectory()) {
    if (!out) { console.error('Converting a folder needs -o <output folder>'); process.exitCode = 2; return; }
    let n = 0;
    for (const f of walk(input)) {
      const ext = extname(f).slice(1).toLowerCase();
      if (!FORMATS[ext]) continue;
      const text = one(f);
      if (text === null) continue;
      const dest = join(out, dirname(relative(input, f)), basename(f, extname(f)) + EXT[to]);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, text);
      n++;
    }
    console.error(`Converted ${n} file${n === 1 ? '' : 's'} to ${out}`);
    return;
  }
  const text = one(input);
  if (text === null) { process.exitCode = 1; return; }
  if (out) writeFileSync(out, text); else process.stdout.write(text);
}

main();
