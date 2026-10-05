const N = 0; void N;
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const WORDS = ['God', 'said', 'Lord', 'the', 'light', 'and', "God's", 'servant', 'Christ,', 'gospel', 'of', 'in', 'peace', 'faith.', 'grace', 'he', 'who', 'Jerusalem;', 'amen'];
const SPECIAL = ['483\\', '&amp;', '\\&amp;', '\\<b>', '&nbsp;', '"quoted"', "it's", 'a---b', 'c--d', '\\*star\\*', '\\[x\\]', '\\{y\\}', '\\\\', 'x\\^y', '#hash', '1\\. one', '\\- dash', '<mark>m</mark>', '<em>e</em>', '<span class="wj">w</span>', '*em*', '**bd**', 'Lord^', '\\wj words\\wj*', '\\w word|lemma="g" strong="G1"\\w*', '[added]', '[two words]'];

export function gen(seed: number): string {
  const r = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const int = (n: number) => Math.floor(r() * n);
  const words = (n: number, withSpecial = true) => Array.from({ length: n }, () => (withSpecial && r() < 0.18 ? pick(SPECIAL) : pick(WORDS))).join(' ');
  const out: string[] = [];
  if (r() < 0.5) out.push('Version: Test ' + seed + '\nCopyright: PD');
  out.push(`# ${pick(['Romans (ROM)', 'Genesis (GEN)', '1 Corinthians (1CO)', 'Psalms (PSA)'])}`);
  if (r() < 0.5) out.push(`>>>>>>>>>>\n${pick(['# Intro heading\n\n', ''])}Some *intro* text with a [link](https://example.org/a_b).\n\n${pick(['- one\n- two\n  - nested', '1. first\n2. second', '> quoted', '| a | b |\n|---|---|\n| 1 | 2 |'])}${r() < 0.4 ? '\n\n```bible John 3:16\n16 For God so loved\n/ the world\n```' : ''}\n>>>>>>>>>>`);
  const chapters = 1 + int(3);
  for (let c = 1; c <= chapters; c++) {
    let v = 1; const defs: string[] = [];
    const paras = 1 + int(4);
    for (let p = 0; p < paras; p++) {
      const kind = r();
      if (kind < 0.15) { out.push(`${pick(['###', '##', '####'])} ${words(2 + int(3), false)}`); continue; }
      if (kind < 0.35) {
        const lines: string[] = []; const base = pick([1, 3, 6]);
        for (let l = 0; l < 2 + int(3); l++) { const ind = base + pick([0, 0, 2, 4]); lines.push('/' + ' '.repeat(ind) + (r() < 0.6 ? `${v++} ` : '') + words(3, false)); }
        out.push(lines.join('\n')); continue;
      }
      if (kind < 0.45) { out.push([`- ${v++} ${words(3)}`, `  - ${words(2, false)}`, `- ${words(2, false)}`].join('\n')); continue; }
      if (kind < 0.5) { out.push(`${pick(['\\m', '\\pmo', '\\qr', '\\pc'])} ${words(4)}`); continue; }
      let t = p === 0 ? `${c}:${v++} ` : '';
      const n = 3 + int(5);
      for (let k = 0; k < n; k++) {
        if (r() < 0.25) t += `${v++} `;
        if (r() < 0.12) { const key = pick(['word', 'more', 'Christ,', 'the end.']); t += `{${key}} `; defs.push(`{${key}}: ${pick(['plain note', 'See [site](https://x.org/a) and *this*.', 'with "quotes" and it\'s', 'note\n\n  second paragraph', '\n  ```bible John 3:16\n  16 For God\n  ```'])}`); }
        else t += words(1 + int(3)) + ' ';
      }
      out.push(t.trim());
    }
    if (defs.length) out.push(defs.join('\n'));
  }
  return out.join('\n\n') + '\n';
}

