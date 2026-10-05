import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, MatchDecorator, Decoration, ViewPlugin, placeholder, type DecorationSet, type ViewUpdate, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import type { Format } from 'biblemd-core';

function marks(rules: [RegExp, string][]): Extension[] {
  return rules.map(([regexp, cls]) => {
    const md = new MatchDecorator({ regexp, decoration: Decoration.mark({ class: cls }) });
    return ViewPlugin.fromClass(class {
      decorations: DecorationSet;
      constructor(view: EditorView) { this.decorations = md.createDeco(view); }
      update(u: ViewUpdate) { this.decorations = md.updateDeco(u, this.decorations); }
    }, { decorations: (v) => v.decorations });
  });
}

const BM: [RegExp, string][] = [
  [/^(?:#{1,6} .*|>{3,})$/g, 'tok-head'],
  [/^\/(?= |\t|$)/g, 'tok-poetry'],
  [/\[[^\]\n]*\]/g, 'tok-add'],
  [/\{[^}\n]*\}/g, 'tok-fn'],
  [/^\{[^}\n]*\}:/g, 'tok-def'],
  [/\\[a-z][a-z0-9-]*\*?/g, 'tok-marker'],
  [/(?<![^\s])\d+[a-z]?(?:-\d+[a-z]?)?(?=\s|$)/g, 'tok-verse'],
  [/^\d+:\d*(?=\s|$)/g, 'tok-chapter'],
  [/\w+\^/g, 'tok-nd'],
  [/^```bible.*$|^```$/g, 'tok-head'],
  [/^[ \t]*(?:[-+*]|\d+[.)])(?=[ \t])/g, 'tok-poetry'],
];
const USFM: [RegExp, string][] = [
  [/\\(?:c|id|mt\d?|s\d?|ms\d?|h|toc\d)\b/g, 'tok-head'],
  [/\\v(?= )/g, 'tok-verse'],
  [/\\\+?[a-z][a-z0-9-]*\*?/g, 'tok-marker'],
];
const HTML: [RegExp, string][] = [
  [/<\/?[a-zA-Z][^>]*>/g, 'tok-marker'],
  [/<!--.*?-->/g, 'tok-def'],
];

export function languageFor(format: Format | null): Extension[] {
  return marks(format === 'biblemd' ? BM : format === 'usfm' ? USFM : format === 'biblehtml' ? HTML : []);
}

const PLACEHOLDER: Record<string, string> = {
  biblemd: 'Type your Bible text here.\n\nStart with a book heading, then a chapter and verse:\n\n# Genesis (GEN)\n\n1:1 In the beginning, God created the heavens and the earth. 2 The earth was formless…\n\nUse the buttons above this box to add chapters, verses, headings, poetry and footnotes. Press the Guide button for a cheat sheet.',
  usfm: 'Type USFM here, for example:\n\n\\id GEN\n\\h Genesis\n\\mt1 Genesis\n\\c 1\n\\p\n\\v 1 In the beginning…',
  biblehtml: 'Type Bible HTML here. Convert a Bible Markdown file to Bible HTML to see an example of the structure.',
};

export function makeState(doc: string, format: Format | null, onChange: (text: string) => void, onCursor: (line: number) => void): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      basicSetup,
      keymap.of([indentWithTab]),
      EditorView.lineWrapping,
      languageFor(format),
      placeholder(PLACEHOLDER[format ?? 'biblemd']),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChange(u.state.doc.toString());
        if (u.selectionSet || u.docChanged) onCursor(u.state.doc.lineAt(u.state.selection.main.head).number);
      }),
    ],
  });
}
