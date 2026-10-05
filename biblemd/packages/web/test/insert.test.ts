// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import * as ins from '../src/insert.js';

// jsdom has no layout; give CodeMirror the few measurements it asks for.
(Range.prototype as any).getClientRects = () => [];
(Range.prototype as any).getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });

function make(doc: string, at?: number, to?: number) {
  const v = new EditorView({ state: EditorState.create({ doc, selection: { anchor: at ?? doc.length, head: to ?? at ?? doc.length } }), parent: document.body });
  return v;
}
const text = (v: EditorView) => v.state.doc.toString();

describe('insert helpers', () => {
  it('chapter: numbers the next chapter', () => {
    const v = make('# Genesis (GEN)\n\n1:1 text\n\n2:1 more');
    ins.insertChapter(v);
    expect(text(v)).toMatch(/2:1 more\n\n3:1 \n$/);
  });
  it('chapter: first chapter of an empty book', () => {
    const v = make('# Genesis (GEN)\n');
    ins.insertChapter(v);
    expect(text(v)).toContain('1:1 ');
  });
  it('verse: next number after the last verse', () => {
    const v = make('1:1 In the beginning 2 God created');
    ins.insertVerse(v);
    expect(text(v)).toBe('1:1 In the beginning 2 God created 3 ');
  });
  it('verse: after only a chapter marker', () => {
    const v = make('1:1 In the beginning');
    ins.insertVerse(v);
    expect(text(v)).toBe('1:1 In the beginning 2 ');
  });
  it('addition wraps the selection', () => {
    const v = make('to all those', 7, 12);
    ins.insertAddition(v);
    expect(text(v)).toBe('to all [those]');
  });
  it('footnote wraps the selection and adds a definition below the paragraph', () => {
    const v = make('1:1 We saw the light.\n\n2 Next.', 7, 10);
    ins.insertFootnote(v);
    expect(text(v)).toBe('1:1 We {saw} the light.\n\n{saw}: note text\n\n2 Next.');
  });
  it('small caps needs a word before the cursor', () => {
    const v = make('The Lord', 8);
    ins.insertSmallCaps(v);
    expect(text(v)).toBe('The Lord^');
    const w = make('The ', 4);
    expect(ins.insertSmallCaps(w)).toMatch(/right after the word/);
    expect(text(w)).toBe('The ');
  });
  it('poetry and list start on their own line', () => {
    const v = make('1:1 text');
    ins.insertPoetry(v);
    expect(text(v)).toBe('1:1 text\n/ ');
    const w = make('');
    ins.insertList(w);
    expect(text(w)).toBe('- ');
  });
  it('heading, note and quote are separated by blank lines', () => {
    const v = make('1:1 text');
    ins.insertHeading(v);
    expect(text(v)).toBe('1:1 text\n\n### Heading text\n');
    const w = make('1:1 text');
    ins.insertQuote(w);
    expect(text(w)).toContain('\n\n>>>>>>>>>>\n');
    expect(text(w)).toContain('```bible John 3:16');
  });
});
