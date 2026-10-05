/// <reference lib="webworker" />
import { convert, indexDoc, parse, serialize, type Fidelity, type Format, type BookIndex, type Diagnostic } from 'biblemd-core';

export type Req =
  | { id: number; type: 'render'; text: string; format: Format; typography: boolean }
  | { id: number; type: 'index'; text: string; format: Format; typography: boolean }
  | { id: number; type: 'convert'; text: string; from: Format; to: Format; typography: boolean; fidelity: Fidelity; noisy?: string[] };
export type Res =
  | { id: number; ok: true; html?: string; books?: BookIndex[]; diagnostics: Diagnostic[]; output?: string }
  | { id: number; ok: false; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
ctx.onmessage = (e: MessageEvent<Req>) => {
  const r = e.data;
  try {
    if (r.type === 'render') {
      const doc = parse(r.text, r.format, { typography: r.typography });
      const html = serialize(doc, 'biblehtml', { html: { fragment: true, sourceLines: true } });
      ctx.postMessage({ id: r.id, ok: true, html, books: indexDoc(doc), diagnostics: doc.diagnostics } satisfies Res);
    } else if (r.type === 'index') {
      const doc = parse(r.text, r.format, { typography: r.typography });
      ctx.postMessage({ id: r.id, ok: true, books: indexDoc(doc), diagnostics: doc.diagnostics } satisfies Res);
    } else {
      const res = convert(r.text, r.from, r.to, {
        typography: r.typography,
        fidelity: { level: r.fidelity, noisyMarkers: r.noisy },
      });
      ctx.postMessage({ id: r.id, ok: true, output: res.output, diagnostics: res.diagnostics } satisfies Res);
    }
  } catch (err) {
    ctx.postMessage({ id: r.id, ok: false, error: String((err as Error).message ?? err) } satisfies Res);
  }
};
