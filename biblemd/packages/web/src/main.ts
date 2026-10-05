import './style.css';
import previewCss from './preview.css?raw';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { detectFormat, BOOK_CODES, DEFAULT_NOISY_MARKERS, type Format, type BookIndex, type Diagnostic, type Fidelity } from 'biblemd-core';
import { makeState } from './editor.js';
import { FsStore, MemoryStore, hasFsAccess, pickFolder, lastFolder, ensurePermission, makeZip, type Store } from './store.js';
import type { Req, Res } from './worker.js';
import { sanitize } from './sanitize.js';
import { initHelp } from './help.js';
import { BOOK_NAMES } from './books.js';
import * as ins from './insert.js';

/* ------------------------------------------------------------------ helpers */
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};
const debounce = <A extends unknown[]>(fn: (...a: A) => void, ms: number) => {
  let t: number | undefined;
  return (...a: A) => { clearTimeout(t); t = window.setTimeout(() => fn(...a), ms); };
};
const EXT: Record<Format, string> = { usfm: '.usfm', biblemd: '.md', biblehtml: '.html' };
const FORMAT_NAME: Record<Format, string> = { usfm: 'USFM', biblemd: 'Bible Markdown', biblehtml: 'Bible HTML' };
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const help = (b: HTMLElement, title: string, text: string, next = '') => { b.dataset.helpTitle = title; b.dataset.help = text; if (next) b.dataset.helpNext = next; return b; };

/* ------------------------------------------------------------------ the engine runs in a worker */
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const waiting = new Map<number, (r: Res) => void>();
let nextId = 1;
worker.onmessage = (e: MessageEvent<Res>) => { waiting.get(e.data.id)?.(e.data); waiting.delete(e.data.id); };
type Ok = Extract<Res, { ok: true }>;
function call(req: Record<string, unknown>): Promise<Ok> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, (r) => (r.ok ? resolve(r) : reject(new Error(r.error))));
    worker.postMessage({ ...req, id } as Req);
  });
}

/* ------------------------------------------------------------------ settings */
const settings = {
  typography: localStorage.getItem('typography') !== 'false',
  sync: localStorage.getItem('sync') !== 'false',
  noisy: (localStorage.getItem('noisy') ?? DEFAULT_NOISY_MARKERS.join(' ')).split(/[\s,]+/).filter(Boolean),
};

/* ------------------------------------------------------------------ state */
interface FileEntry {
  path: string; format: Format | null; text: string;
  books: BookIndex[]; diagnostics: Diagnostic[];
  state?: EditorState; dirty: boolean;
}
let store: Store | null = null;
const files = new Map<string, FileEntry>();
let current: FileEntry | null = null;
const openBooks = new Set<string>();
let saving = false;
let filterText = '';

const setMsg = (m: string) => { $('#msg').textContent = m; };

/* ------------------------------------------------------------------ editor and preview */
const view = new EditorView({ parent: $('#editor'), state: EditorState.create({ doc: '' }) });
const previewRoot = $('#preview').attachShadow({ mode: 'open' });
previewRoot.innerHTML = `<style>${previewCss}</style><div class="bible"></div>`;
const bible = previewRoot.querySelector('.bible') as HTMLElement;
const previewScroller = $('#preview-wrap');

function onEdit(text: string) {
  if (!current) return;
  current.text = text; current.dirty = true;
  $('#save-state').textContent = 'Unsaved changes — saving shortly…';
  renderSoon(); saveSoon();
}
function onCursor(line: number) { if (settings.sync) syncSoon(line); }

const renderSoon = debounce(() => void renderPreview(), 180);
const saveSoon = debounce(() => void saveCurrent(), 700);
const syncSoon = debounce((line: number) => {
  if (!current || current.format !== 'biblemd') return;
  let best: HTMLElement | null = null; let bestLine = -1;
  bible.querySelectorAll<HTMLElement>('[data-line]').forEach((n) => {
    const l = Number(n.dataset.line);
    if (l <= line && l >= bestLine) { best = n; bestLine = l; }
  });
  if (best) (best as HTMLElement).scrollIntoView({ block: 'nearest' });
}, 120);

async function renderPreview() {
  const f = current;
  if (!f) return;
  if (!f.format) { bible.textContent = 'This file type is not recognised, so it cannot be previewed.'; return; }
  try {
    const r = await call({ type: 'render', text: f.text, format: f.format, typography: settings.typography });
    if (current !== f) return;
    const top = previewScroller.scrollTop;
    bible.innerHTML = sanitize(r.html ?? '');
    previewScroller.scrollTop = top;
    f.diagnostics = r.diagnostics;
    const before = JSON.stringify(f.books);
    f.books = r.books ?? [];
    if (JSON.stringify(f.books) !== before) renderNav();
    showDiagnostics();
    updateNext();
  } catch (err) { setMsg('The preview could not be drawn: ' + (err as Error).message); }
}

bible.addEventListener('click', (e) => {
  const t = (e.target as Element).closest('[data-line]') as HTMLElement | null;
  if (!t || !current || current.format !== 'biblemd') return;
  const line = Math.min(Number(t.dataset.line), view.state.doc.lines);
  const pos = view.state.doc.line(line).from;
  view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
  view.focus();
});

/* ------------------------------------------------------------------ diagnostics */
function problems() { return (current?.diagnostics ?? []).filter((d) => d.severity !== 'info'); }
function showDiagnostics() {
  const list = problems();
  const btn = $('#diag-btn') as HTMLButtonElement;
  btn.hidden = list.length === 0;
  btn.textContent = `⚠ ${plural(list.length, 'thing')} to check`;
  const panel = $('#diag');
  panel.replaceChildren(
    el('h4', { textContent: 'Things to check in this file' }),
    el('p', { className: 'hint', textContent: 'The converter noticed these. The file still works. Click one to jump to the line in the editor.' }),
    ...list.map((d) => {
      const b = el('button', {}, el('span', { className: 'line', textContent: d.line ? `line ${d.line}` : '' }), d.message);
      b.onclick = () => {
        if (!d.line) return;
        const pos = view.state.doc.line(Math.min(d.line, view.state.doc.lines)).from;
        view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
        view.focus();
      };
      return b;
    }));
  if (list.length === 0) panel.hidden = true;
}
$('#diag-btn').onclick = () => { const p = $('#diag'); p.hidden = !p.hidden; };

/* ------------------------------------------------------------------ guidance: the "next step" bar and welcome panel */
function updateNext() {
  const text = $('#next-text'); const actions = $('#next-actions');
  actions.replaceChildren();
  const act = (label: string, fn: () => void, h?: [string, string]) => {
    const b = el('button', { textContent: label, onclick: fn });
    if (h) help(b, label, h[0], h[1]);
    actions.append(b);
  };
  const memory = store?.kind === 'memory';
  let msg: string;
  if (!store) {
    msg = 'Start here: open the folder that holds your Bible files, or look at a small example first.';
    act('Open folder', () => void openFolder());
    act('Try an example', () => void loadExample());
  } else if (files.size === 0) {
    msg = 'This project has no Bible files yet. Create your first book to begin.';
    act('New book…', openNewBook);
  } else if (!current) {
    msg = 'Pick a book from the list on the left, then a chapter number, to start reading and editing.';
  } else if (problems().length) {
    msg = `${plural(problems().length, 'thing')} to check in this file. Press “⚠” in the bar at the bottom to see ${problems().length === 1 ? 'it' : 'them'}.`;
  } else if (current.format === 'biblemd') {
    msg = 'Type in the left pane; the preview on the right updates as you type. Use the Insert buttons for chapters, verses, footnotes and more.';
  } else {
    msg = `This is a ${FORMAT_NAME[current.format ?? 'usfm']} file. You can edit it here, or press Convert… to make a Bible Markdown copy that has the Insert buttons.`;
    act('Convert…', openConvert);
  }
  if (memory && files.size) msg += ' Your files are stored in this browser only — press Download project to keep a copy.';
  text.textContent = msg;
  if (memory && files.size) act('Download project', downloadProject);
}

function renderWelcome() {
  const w = $('#welcome');
  const showing = !current;
  w.hidden = !showing;
  $('#preview').hidden = showing;
  if (!showing) return;
  const fs = hasFsAccess();
  const b = (label: string, fn: () => void, h: string) => help(el('button', { textContent: label, onclick: fn }), label, h);
  w.replaceChildren(
    el('h2', { textContent: store ? (files.size ? 'Choose a book' : 'Create your first book') : 'Welcome' }),
    ...(!store ? [
      el('p', { textContent: 'This tool lets you write a Bible translation in simple text, see how it will look, and convert between Bible Markdown, USFM and Bible HTML. Nothing is uploaded: your files stay on your computer.' }),
      el('ol', {},
        el('li', {}, el('strong', { textContent: 'Open your files. ' }), fs ? 'Choose the folder that holds your Bible files. Changes are saved straight into that folder.' : 'Your browser cannot open a folder directly, so choose the files (or a .zip). They are kept inside the browser; use Download project to keep a copy.',
          el('div', { className: 'actions' },
            b('Open folder', () => void openFolder(), 'Choose a folder of Bible files.'),
            b('Open files or zip', () => ($('#file-input') as HTMLInputElement).click(), 'Choose individual files or a .zip. They are kept in this browser.'),
            el('small', { textContent: fs ? 'You will be asked to allow access to the folder.' : 'Tip: Chrome and Edge can edit a real folder.' }))),
        el('li', {}, el('strong', { textContent: 'Or start fresh. ' }), 'Begin a new translation, or look at a short example first.',
          el('div', { className: 'actions' },
            b('Start a new project', () => void startEmpty(), 'Creates an empty project in this browser and asks which book to begin with.'),
            b('Try an example', () => void loadExample(), 'Opens three small sample files, one in each format, so you can see how everything works.'))),
        el('li', {}, el('strong', { textContent: 'Need help? ' }), 'Press ', el('b', { textContent: 'Guide' }), ' for a cheat sheet, or ', el('b', { textContent: 'Explain' }), ' to learn what any button does.')),
    ] : files.size ? [
      el('p', { textContent: 'Pick a book from the list on the left, then click a chapter number to jump to it. The text appears here and in the editor on the left.' }),
    ] : [
      el('p', { textContent: 'This project is empty. Press New book… to start the first book, or Open folder to use files you already have.' }),
      el('div', { className: 'actions' }, b('New book…', openNewBook, 'Starts a new, empty book.')),
    ]));
}

/* ------------------------------------------------------------------ insert buttons */
const INSERT: Record<string, (v: EditorView) => string> = {
  chapter: ins.insertChapter, verse: ins.insertVerse, heading: ins.insertHeading, poetry: ins.insertPoetry, addition: ins.insertAddition,
  footnote: ins.insertFootnote, smallcaps: ins.insertSmallCaps, list: ins.insertList, note: ins.insertNote, quote: ins.insertQuote,
};
$('#insert-bar').addEventListener('click', (e) => {
  const b = (e.target as Element).closest('button[data-act]') as HTMLElement | null;
  if (!b || !current || current.format !== 'biblemd') return;
  const fn = INSERT[b.dataset.act!];
  if (fn) setMsg(fn(view));
});
function updateInsertBar() {
  const bm = current?.format === 'biblemd';
  $('#insert-bar').hidden = !bm;
  $('#insert-off').hidden = !current || bm;
}

/* ------------------------------------------------------------------ saving */
async function saveCurrent() {
  const f = current;
  if (!f || !store || !f.dirty || saving) return;
  saving = true;
  try {
    $('#save-state').textContent = 'Saving…';
    const snapshot = f.text;
    await store.write(f.path, snapshot);
    if (f.text === snapshot) {
      f.dirty = false;
      $('#save-state').textContent = store.kind === 'fs' ? 'Saved to your folder' : 'Saved in this browser (not yet on your computer)';
    } else {
      $('#save-state').textContent = 'Unsaved changes — saving shortly…';   // typed while saving: save again
      saveSoon();
    }
  } catch (err) {
    $('#save-state').textContent = 'Could not save';
    setMsg('Saving failed: ' + (err as Error).message + '. Your text is still in the editor; copy it somewhere safe.');
  } finally { saving = false; }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) void saveCurrent(); });

function downloadProject() {
  if (!store) return;
  const all: Record<string, string> = {};
  for (const f of files.values()) all[f.path] = f.text;
  const url = URL.createObjectURL(new Blob([makeZip(all) as BlobPart], { type: 'application/zip' }));
  el('a', { href: url, download: `${store.name}.zip` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  setMsg(`Downloaded ${store.name}.zip with ${plural(Object.keys(all).length, 'file')}. Keep it somewhere safe.`);
}
$('#download').onclick = downloadProject;

/* ------------------------------------------------------------------ project */
function refreshChrome() {
  ($('#convert') as HTMLButtonElement).disabled = files.size === 0;
  ($('#new-book') as HTMLButtonElement).disabled = !store;
  ($('#download') as HTMLButtonElement).hidden = !(store?.kind === 'memory' && files.size > 0);
  $('#project').textContent = store ? store.name + (store.kind === 'memory' ? ' (in browser)' : '') : '';
  updateInsertBar(); renderWelcome(); updateNext();
}

async function openStore(s: Store) {
  store = s; files.clear(); current = null; openBooks.clear();
  view.setState(EditorState.create({ doc: '' }));
  $('#file-name').textContent = 'No file open'; $('#save-state').textContent = '';
  refreshChrome();
  setMsg('Reading files…');
  const paths = await s.list();
  for (const path of paths) {
    try {
      const text = await s.read(path);
      files.set(path, { path, text, format: detectFormat(path, text), books: [], diagnostics: [], dirty: false });
    } catch { /* unreadable file: skip */ }
  }
  let n = 0;
  for (const f of files.values()) {
    setMsg(`Reading ${n + 1} of ${files.size}…`); n++;
    await indexFile(f);
  }
  renderNav(); refreshChrome();
  setMsg(files.size ? `Opened ${plural(files.size, 'file')} with ${plural(buildBooks().length, 'book')}.` : 'The project is empty.');
  const first = buildBooks()[0];
  if (first) await gotoBook(first);
  else if (files.size) await selectFile([...files.keys()][0]);
}
async function indexFile(f: FileEntry) {
  if (!f.format) return;
  try {
    const r = await call({ type: 'index', text: f.text, format: f.format, typography: settings.typography });
    f.books = r.books ?? []; f.diagnostics = r.diagnostics;
  } catch { f.books = []; }
}

interface BookEntry { id: string; name: string; file: string; chapters: BookIndex['chapters'] }
const ORDER = [...BOOK_CODES];
function buildBooks(): BookEntry[] {
  const map = new Map<string, BookEntry>();
  for (const f of [...files.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    for (const b of f.books) if (b.id && !map.has(b.id)) map.set(b.id, { id: b.id, name: b.name, file: f.path, chapters: b.chapters });
  }
  const rank = (id: string) => { const i = ORDER.indexOf(id); return i < 0 ? 999 : i; };
  return [...map.values()].sort((a, b) => rank(a.id) - rank(b.id));
}

function renderNav() {
  const holder = $('#books');
  const q = filterText.trim().toLowerCase();
  const books = buildBooks().filter((b) => !q || b.name.toLowerCase().includes(q) || b.id.toLowerCase() === q || b.id.toLowerCase().startsWith(q));
  const parts: Node[] = [];
  if (!files.size) { holder.replaceChildren(el('p', { className: 'hint', textContent: 'No books yet. Open a folder, or press New book… to create one.' })); return; }
  const groups: [string, BookEntry[]][] = [
    ['Old Testament', books.filter((b) => ORDER.indexOf(b.id) >= 0 && ORDER.indexOf(b.id) < 39)],
    ['New Testament', books.filter((b) => ORDER.indexOf(b.id) >= 39 && ORDER.indexOf(b.id) < 66)],
    ['Other books', books.filter((b) => ORDER.indexOf(b.id) < 0 || ORDER.indexOf(b.id) >= 66)],
  ];
  for (const [title, list] of groups) {
    if (!list.length) continue;
    parts.push(el('h3', { textContent: title }));
    for (const b of list) {
      const d = el('details');
      d.open = openBooks.has(b.id) || !!q;
      if (current && current.books.some((x) => x.id === b.id)) d.className = 'current';
      d.ontoggle = () => { if (d.open) openBooks.add(b.id); else openBooks.delete(b.id); };
      const sum = el('summary', { textContent: b.name });
      help(sum, b.name, `Click to show or hide the chapters of ${b.name}. It is stored in ${b.file}.`);
      d.append(sum);
      const grid = el('div', { className: 'chapters' });
      for (const c of b.chapters) {
        const btn = el('button', { textContent: c.number });
        help(btn, `${b.name} ${c.number}`, `Jump to chapter ${c.number}. It has ${plural(c.verses, 'verse')}.`);
        btn.onclick = () => void gotoChapter(b, c.number);
        grid.append(btn);
      }
      if (!b.chapters.length) grid.append(help(el('button', { textContent: 'Open', onclick: () => void gotoBook(b) }), 'Open', `This book has no chapter markers yet. Open its file to start writing.`));
      d.append(grid);
      parts.push(d);
    }
  }
  if (q && !parts.length) parts.push(el('p', { className: 'hint', textContent: `No book matches “${filterText}”. Clear the box to see all books.` }));
  const loose = [...files.values()].filter((f) => f.books.every((b) => !b.id));
  if (loose.length && !q) {
    parts.push(el('h3', { textContent: 'Other files' }));
    for (const f of loose) parts.push(el('div', {}, help(el('button', { textContent: f.path, onclick: () => void selectFile(f.path) }), f.path, 'This file does not start a book, so it is listed here. Click to open it.')));
  }
  holder.replaceChildren(...parts);
}
$('#filter').addEventListener('input', (e) => { filterText = (e.target as HTMLInputElement).value; renderNav(); });

async function selectFile(path: string) {
  const f = files.get(path);
  if (!f) return;
  if (current) { current.state = view.state; if (current !== f) await saveCurrent(); }
  current = f;
  const state = f.state ?? makeState(f.text, f.format, onEdit, onCursor);
  view.setState(state);
  f.state = state;
  $('#file-name').textContent = f.path + (f.format ? ` — ${FORMAT_NAME[f.format]}` : '');
  $('#save-state').textContent = f.dirty ? 'Unsaved changes — saving shortly…' : '';
  updateInsertBar(); renderWelcome();
  await renderPreview();
  renderNav(); updateNext();
  $('#nav').classList.remove('open');
}
async function gotoBook(b: BookEntry) {
  await selectFile(b.file);
  openBooks.add(b.id);
  renderNav();
  setMsg(`${b.name}: type in the left pane, or pick a chapter number to jump to it.`);
}

function locate(text: string, format: Format | null, bookId: string, ch: string): number {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (format === 'biblemd') {
    const lines = text.split('\n');
    let start = lines.findIndex((l) => new RegExp(`^#\\s+.*\\(${esc(bookId)}\\)\\s*$`).test(l));
    if (start < 0) start = 0;
    const re = new RegExp(`^(?:/\\s+)?${esc(ch)}:(?:\\d|\\s|$)`);
    const idx = lines.findIndex((l, i) => i >= start && re.test(l));
    if (idx < 0) return -1;
    return lines.slice(0, idx).reduce((n, l) => n + l.length + 1, 0);
  }
  if (format === 'usfm') {
    const s = text.search(new RegExp(`\\\\id\\s+${esc(bookId)}\\b`));
    const m = new RegExp(`\\\\c\\s+${esc(ch)}\\b`).exec(text.slice(Math.max(s, 0)));
    return m ? Math.max(s, 0) + m.index : -1;
  }
  if (format === 'biblehtml') return text.indexOf(`id="${bookId}.${ch}"`);
  return -1;
}
async function gotoChapter(b: BookEntry, ch: string) {
  await selectFile(b.file);
  const f = current!;
  const pos = locate(f.text, f.format, b.id, ch);
  if (pos >= 0) {
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 10 }) });
    view.focus();
  }
  const target = bible.querySelector(`[id="${b.id}.${ch}"]`);
  if (target) (target as HTMLElement).scrollIntoView({ block: 'start' });
  setMsg(`${b.name} ${ch}`);
}

/* ------------------------------------------------------------------ opening projects */
async function openFolder() {
  if (hasFsAccess()) {
    const s = await pickFolder();
    if (s) await openStore(s);
    else setMsg('No folder was chosen. Press Open folder to try again.');
  } else ($('#dir-input') as HTMLInputElement).click();
}
$('#open-folder').onclick = () => void openFolder();
$('#open-files').onclick = () => ($('#file-input') as HTMLInputElement).click();
for (const id of ['#file-input', '#dir-input']) {
  const input = $(id) as HTMLInputElement;
  input.onchange = async () => {
    if (input.files?.length) await openStore(await MemoryStore.fromFileList(input.files));
    input.value = '';
  };
}
$('#menu').onclick = () => $('#nav').classList.toggle('open');

async function offerReopen() {
  const btn = $('#reopen') as HTMLButtonElement;
  if (hasFsAccess()) {
    const h = await lastFolder();
    if (h) {
      btn.hidden = false; btn.textContent = `Reopen “${h.name}”`;
      btn.onclick = async () => { if (await ensurePermission(h)) { btn.hidden = true; await openStore(new FsStore(h)); } else setMsg('Access to the folder was not allowed. Press Reopen again and choose Allow.'); };
    }
  } else {
    const m = await MemoryStore.restore();
    if (m) {
      btn.hidden = false; btn.textContent = `Reopen “${m.name}”`;
      btn.onclick = async () => { btn.hidden = true; await openStore(m); };
    }
  }
}

async function startEmpty() {
  await openStore(new MemoryStore('My Bible'));
  openNewBook();
}

/* ------------------------------------------------------------------ example project */
const EXAMPLE_MD = `Version: Example Translation
Copyright: Public Domain

# Genesis (GEN)

>>>>>>>>>>
This short example shows Bible Markdown. Edit the text on the left and the preview updates.
>>>>>>>>>>

1:1 In the beginning, God created the heavens and the earth. 2 The earth was formless and empty, and darkness {was} over the surface of the deep. And God’s Spirit was hovering over the surface of the waters.

{was}: or, "was upon"

### Light

3 God said, "Let there be light," and there was light. 4 God saw the light, that it was good, and God divided the light from the darkness.
/ "In the beginning was the Word,
/    and the Word was with God."

2:1 The heavens and the earth were finished, and all their [host].
`;
const EXAMPLE_USFM = String.raw`\id PSA Example Psalms
\h Psalms
\toc1 Psalms
\mt1 Psalms
\c 1
\s1 The Two Ways
\q1
\v 1 Blessed is the man who doesn’t walk in the counsel of the wicked,
\q2 nor stand on the path of sinners,
\q2 nor sit in the seat of scoffers;
\q1
\v 2 but his delight is in \nd Yahweh\nd*’s law.
`;
async function loadExample() {
  const s = new MemoryStore('Example');
  await s.write('genesis.md', EXAMPLE_MD);
  await s.write('psalms.usfm', EXAMPLE_USFM);
  const html = await call({ type: 'convert', text: EXAMPLE_MD.replace('GEN', 'MAT').replace('Genesis', 'Matthew'), from: 'biblemd', to: 'biblehtml', typography: true, fidelity: 'full' });
  await s.write('matthew.html', html.output ?? '');
  await openStore(s);
  setMsg('This is an example. Try typing in the left pane, or press Convert… to see the same text in another format.');
}

/* ------------------------------------------------------------------ new book */
const nbDialog = $('#newbook-dialog') as HTMLDialogElement;
function openNewBook() {
  if (!store) return;
  const sel = $('#nb-book') as HTMLSelectElement;
  if (!sel.options.length) {
    sel.append(el('option', { value: '', textContent: 'Choose a book…' }));
    for (const [code, name] of Object.entries(BOOK_NAMES)) sel.append(el('option', { value: code, textContent: `${name} (${code})` }));
    sel.append(el('option', { value: '*', textContent: 'Other (I will type the code)' }));
  }
  for (const id of ['#nb-code', '#nb-name', '#nb-file']) ($(id) as HTMLInputElement).value = '';
  sel.value = ''; $('#nb-other').hidden = true; $('#nb-error').hidden = true;
  nbDialog.showModal();
}
$('#new-book').onclick = openNewBook;
$('#nb-book').addEventListener('change', () => {
  const v = ($('#nb-book') as HTMLSelectElement).value;
  $('#nb-other').hidden = v !== '*';
  const name = $('#nb-name') as HTMLInputElement; const file = $('#nb-file') as HTMLInputElement;
  if (BOOK_NAMES[v]) {
    name.value = BOOK_NAMES[v];
    file.value = BOOK_NAMES[v].toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }
});
$('#nb-go').onclick = async (ev) => {
  ev.preventDefault();
  const f = new FormData($('#newbook-form') as HTMLFormElement);
  const book = String(f.get('book')); const err = $('#nb-error');
  const code = (book === '*' ? String(f.get('code')) : book).toUpperCase().trim();
  const name = String(f.get('name')).trim() || BOOK_NAMES[code] || code;
  const format = String(f.get('format')) as Format;
  let file = String(f.get('file')).trim().replace(/\.(md|usfm|sfm|html?)$/i, '').replace(/^\/+/, '');
  const fail = (m: string) => { err.textContent = m; err.hidden = false; };
  if (!/^[A-Z0-9]{3}$/.test(code)) return fail('Choose a book from the list, or type a three-character book code (letters and digits).');
  if (!file) file = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || code.toLowerCase();
  if (/[\\:*?"<>|]/.test(file) || file.split('/').some((p) => p === '..' || p.startsWith('.'))) return fail('The file name cannot contain  \\ : * ? " < > |  or start with a dot.');
  const path = file + EXT[format];
  if (files.has(path) && !confirm(`${path} already exists. Replace it with an empty book?`)) return;
  const md = `# ${name} (${code})\n\n1:1 `;
  let text = md;
  if (format !== 'biblemd') text = (await call({ type: 'convert', text: md, from: 'biblemd', to: format, typography: true, fidelity: 'full' })).output ?? md;
  nbDialog.close();
  await store!.write(path, text);
  const fe: FileEntry = { path, text, format, books: [], diagnostics: [], dirty: false };
  files.set(path, fe);
  await indexFile(fe);
  openBooks.add(code);
  renderNav(); refreshChrome();
  await selectFile(path);
  view.focus();
  view.dispatch({ selection: { anchor: view.state.doc.length } });
  setMsg(`Created ${path}. Type the text of verse 1 after “1:1”.`);
};

/* ------------------------------------------------------------------ converting */
const dialog = $('#convert-dialog') as HTMLDialogElement;
const FID_NAME: Record<Fidelity, string> = { full: 'keeping everything', readable: 'dropping noisy markup such as word tags', minimal: 'keeping only what Bible Markdown can show' };
function convertForm() {
  const d = new FormData($('#convert-form') as HTMLFormElement);
  return { to: String(d.get('to')) as Format, scope: String(d.get('scope')), fidelity: String(d.get('fidelity')) as Fidelity, where: String(d.get('where')) };
}
function updateConvertSummary() {
  const c = convertForm();
  const n = c.scope === 'file' ? (current ? 1 : 0) : files.size;
  const skip = c.where === 'next' ? [...(c.scope === 'file' ? (current ? [current] : []) : files.values())].filter((f) => f.format === c.to).length : 0;
  const where = c.where === 'next' ? 'next to the originals, with the new ending' : c.where === 'folder' ? `in a new folder called “${store?.name}-${c.to}”` : 'in a zip file that your browser will download';
  $('#convert-summary').textContent = `${plural(n - skip, 'file')} will be converted to ${FORMAT_NAME[c.to]}, ${FID_NAME[c.fidelity]}, and saved ${where}.` +
    (skip ? ` ${plural(skip, 'file')} already in this format will be skipped.` : '') + (n - skip === 0 ? ' Nothing to convert — choose a different format.' : '');
  ($('#convert-go') as HTMLButtonElement).disabled = n - skip === 0;
}
function openConvert() {
  if (files.size === 0) return;
  const sel = ($('#convert-form') as HTMLFormElement).elements.namedItem('scope') as HTMLSelectElement;
  sel.value = current ? 'file' : 'all';
  if (!current) sel.options[0].disabled = true; else sel.options[0].disabled = false;
  updateConvertSummary();
  dialog.showModal();
}
$('#convert').onclick = openConvert;
$('#convert-form').addEventListener('change', updateConvertSummary);
$('#convert-go').onclick = (ev) => {
  ev.preventDefault();
  const c = convertForm();
  dialog.close();
  void runConvert(c.to, c.scope, c.fidelity, c.where);
};

async function runConvert(to: Format, scope: string, fidelity: Fidelity, where: string) {
  if (!store) return;
  const targets = scope === 'file' && current ? [current] : [...files.values()];
  const out: [string, string][] = [];
  let problemsN = 0; let skipped = 0;
  let n = 0;
  for (const f of targets) {
    setMsg(`Converting ${++n} of ${targets.length}…`);
    if (!f.format || (f.format === to && where === 'next')) { skipped++; continue; }
    try {
      const r = await call({ type: 'convert', text: f.text, from: f.format, to, typography: settings.typography, fidelity, noisy: settings.noisy });
      out.push([destPath(f.path, to, where), r.output ?? '']);
      problemsN += r.diagnostics.filter((d) => d.severity !== 'info').length;
    } catch (err) { setMsg(`${f.path}: ${(err as Error).message}`); skipped++; }
  }
  if (where === 'zip') {
    const zip = makeZip(Object.fromEntries(out));
    const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
    el('a', { href: url, download: `${store.name}-${to}.zip` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } else {
    const clash = out.filter(([p]) => files.has(p) && files.get(p)!.format !== null).length;
    if (clash && !confirm(`${plural(clash, 'existing file')} will be replaced. Continue?`)) { setMsg('Cancelled. Nothing was changed.'); return; }
    for (const [path, text] of out) {
      await store.write(path, text);
      const prev = files.get(path);
      const fe: FileEntry = prev ?? { path, text, format: to, books: [], diagnostics: [], dirty: false };
      fe.text = text; fe.format = to; fe.state = undefined; fe.dirty = false;
      files.set(path, fe);
      await indexFile(fe);
    }
    renderNav();
  }
  refreshChrome();
  setMsg(`Converted ${plural(out.length, 'file')} to ${FORMAT_NAME[to]}` + (skipped ? `, skipped ${skipped}` : '') + (problemsN ? `, with ${plural(problemsN, 'warning')} (open the converted file and press ⚠ to read them)` : '') +
    (where === 'zip' ? '. Your download should start now.' : '. The new files are in the book list.'));
}
function destPath(path: string, to: Format, where: string): string {
  const base = path.replace(/\.[^./]+$/, '') + EXT[to];
  return where === 'folder' ? `${store!.name}-${to}/${base}` : base;
}

/* ------------------------------------------------------------------ settings and guide dialogs */
const sd = $('#settings-dialog') as HTMLDialogElement;
$('#settings').onclick = () => {
  ($('#opt-typography') as HTMLInputElement).checked = settings.typography;
  ($('#opt-sync') as HTMLInputElement).checked = settings.sync;
  ($('#opt-noisy') as HTMLTextAreaElement).value = settings.noisy.join(' ');
  sd.showModal();
};
$('#opt-reset').onclick = () => { ($('#opt-noisy') as HTMLTextAreaElement).value = DEFAULT_NOISY_MARKERS.join(' '); };
sd.onclose = () => {
  settings.typography = ($('#opt-typography') as HTMLInputElement).checked;
  settings.sync = ($('#opt-sync') as HTMLInputElement).checked;
  settings.noisy = ($('#opt-noisy') as HTMLTextAreaElement).value.split(/[\s,]+/).filter(Boolean);
  localStorage.setItem('typography', String(settings.typography));
  localStorage.setItem('sync', String(settings.sync));
  localStorage.setItem('noisy', settings.noisy.join(' '));
  void renderPreview();
};
$('#help-btn').onclick = () => ($('#help-dialog') as HTMLDialogElement).showModal();

/* ------------------------------------------------------------------ start */
initHelp($('#explain'));
refreshChrome();
void offerReopen();
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}
