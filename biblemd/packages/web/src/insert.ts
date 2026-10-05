import { EditorView } from '@codemirror/view';

/** Helpers behind the buttons above the editor. Each returns a short message saying what to do next. */

function lineInfo(view: EditorView) {
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.head);
  return { sel, line, doc: view.state.doc };
}

/** Insert a whole block (paragraph, heading, fence) on its own lines, separated by blank lines. */
function insertBlock(view: EditorView, text: string, selectFrom = 0, selectTo = 0): void {
  const { sel, line, doc } = lineInfo(view);
  const atEmptyLine = line.text.trim() === '';
  const pos = atEmptyLine ? line.from : line.to;
  const before = atEmptyLine ? (line.number > 1 && doc.line(line.number - 1).text.trim() !== '' ? '\n' : '') : '\n\n';
  const after = '\n';
  void sel;
  const ins = before + text + after;
  view.dispatch({
    changes: { from: pos, to: atEmptyLine ? line.to : pos, insert: ins },
    selection: { anchor: pos + before.length + selectFrom, head: pos + before.length + (selectTo || selectFrom) },
    scrollIntoView: true,
  });
  view.focus();
}

export function lastNumber(text: string, re: RegExp): number {
  let n = 0; let m: RegExpExecArray | null;
  const g = new RegExp(re.source, 'gm');
  while ((m = g.exec(text))) n = Math.max(0, Number(m[1]));
  return n;
}

export function insertChapter(view: EditorView): string {
  const upto = view.state.doc.sliceString(0, view.state.selection.main.head);
  const next = lastNumber(upto, /^\/?\s*(\d+):/) + 1;
  const t = `${next}:1 `;
  insertBlock(view, t, t.length);
  return `Chapter ${next} started. Type the first verse’s text after “${next}:1”.`;
}

export function insertVerse(view: EditorView): string {
  const { sel, doc } = lineInfo(view);
  const upto = doc.sliceString(0, sel.head);
  const m = [...upto.matchAll(/(?:^|[\s/])(\d+)(?:-\d+)?(?=\s)/g)].filter((x) => !/:/.test(x[0]));
  const lastVerse = m.length ? Number(m[m.length - 1][1]) : 0;
  const cm = [...upto.matchAll(/^\/?\s*\d+:(\d+)/gm)];
  const lastChapterVerse = cm.length ? Number(cm[cm.length - 1][1]) : 0;
  const next = Math.max(lastVerse, lastChapterVerse) + 1;
  const before = /\s$/.test(upto) || upto === '' ? '' : ' ';
  const t = `${before}${next} `;
  view.dispatch({ changes: { from: sel.from, to: sel.to, insert: t }, selection: { anchor: sel.from + t.length }, scrollIntoView: true });
  view.focus();
  return `Verse ${next} inserted. Keep typing its text. A verse can start anywhere, even in the middle of a line.`;
}

export function insertHeading(view: EditorView): string {
  insertBlock(view, '### Heading text', 4, 16);
  return 'Type the heading text (it is selected). Use #### for a sub-heading, ## for a main section.';
}

export function insertPoetry(view: EditorView): string {
  const { line } = lineInfo(view);
  if (line.text.trim() === '') view.dispatch({ changes: { from: line.from, insert: '/ ' }, selection: { anchor: line.from + 2 } });
  else view.dispatch({ changes: { from: line.to, insert: '\n/ ' }, selection: { anchor: line.to + 3 } });
  view.focus();
  return 'Poetry line started. Put extra spaces after the “/” to indent a line; indents are relative within each poem.';
}

function wrap(view: EditorView, open: string, close: string, empty: string): void {
  const { sel } = lineInfo(view);
  const text = view.state.sliceDoc(sel.from, sel.to);
  if (text) view.dispatch({ changes: { from: sel.from, to: sel.to, insert: open + text + close }, selection: { anchor: sel.from + open.length, head: sel.from + open.length + text.length } });
  else view.dispatch({ changes: { from: sel.from, insert: open + empty + close }, selection: { anchor: sel.from + open.length, head: sel.from + open.length + empty.length } });
  view.focus();
}

export function insertAddition(view: EditorView): string {
  wrap(view, '[', ']', 'added words');
  return 'Words in [square brackets] are shown as added for clarity. Replace the selected text.';
}

export function insertSmallCaps(view: EditorView): string {
  const { sel, doc } = lineInfo(view);
  let pos = sel.to;
  if (sel.empty) { const line = doc.lineAt(sel.head); const m = /[\p{L}]+$/u.exec(line.text.slice(0, sel.head - line.from)); if (!m) return 'Put the cursor right after the word (for example “Lord”), then press this button.'; }
  view.dispatch({ changes: { from: pos, insert: '^' }, selection: { anchor: pos + 1 } });
  view.focus();
  return 'A “^” after a word makes it print as small capitals (Lord^ becomes LORD style).';
}

export function insertFootnote(view: EditorView): string {
  const { sel, line, doc } = lineInfo(view);
  const selected = view.state.sliceDoc(sel.from, sel.to);
  const key = selected || 'words noted';
  // end of the current paragraph
  let end = line.number;
  while (end < doc.lines && doc.line(end + 1).text.trim() !== '') end++;
  const endPos = doc.line(end).to;
  const def = `\n\n{${key}}: note text`;
  const inText = selected ? `{${selected}}` : `{${key}}`;
  view.dispatch({
    changes: [{ from: sel.from, to: sel.to, insert: inText }, { from: endPos, insert: def }],
    selection: { anchor: endPos + (inText.length - (sel.to - sel.from)) + def.length - 9, head: endPos + (inText.length - (sel.to - sel.from)) + def.length },
    scrollIntoView: true,
  });
  view.focus();
  return 'Footnote added. Type the note in place of “note text” just below the paragraph. The words in { } must match exactly in both places.';
}

export function insertList(view: EditorView): string {
  const { line } = lineInfo(view);
  if (line.text.trim() === '') view.dispatch({ changes: { from: line.from, insert: '- ' }, selection: { anchor: line.from + 2 } });
  else view.dispatch({ changes: { from: line.to, insert: '\n- ' }, selection: { anchor: line.to + 3 } });
  view.focus();
  return 'List item started. Indent two spaces for a sub-item. Numbered items (1.) also work.';
}

export function insertQuote(view: EditorView): string {
  const t = '>>>>>>>>>>\nIntroductory words, then the quoted passage:\n\n```bible John 3:16\n16 For God so loved the world\n```\n>>>>>>>>>>';
  insertBlock(view, t, 11, 50);
  return 'A quotation block was added inside an explanatory note. Replace the reference (John 3:16) and the text. Numbers inside it are not counted as verses.';
}

export function insertNote(view: EditorView): string {
  insertBlock(view, '>>>>>>>>>>\nExplanatory text, written in regular Markdown.\n>>>>>>>>>>', 11, 53);
  return 'An explanatory block was added. Before chapter 1 it becomes the book’s introduction; elsewhere it is a study note.';
}
