// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initHelp } from '../src/help.js';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script'));

describe('every control is explained (index.html)', () => {
  beforeEach(() => { document.body.innerHTML = body; });

  it('buttons outside dialog menus carry help text', () => {
    const missing = [...document.querySelectorAll('button')].filter((b) => !b.closest('menu') && !(b as HTMLElement).dataset.help && b.id !== 'diag-btn' && !b.dataset.act)
      .map((b) => b.id || b.textContent);
    expect(missing).toEqual([]);
    const acts = [...document.querySelectorAll<HTMLElement>('button[data-act]')].filter((b) => !b.dataset.help);
    expect(acts).toEqual([]);
  });
  it('every help text is a real sentence with a title', () => {
    for (const e of document.querySelectorAll<HTMLElement>('[data-help]')) {
      expect(e.dataset.help!.length, e.outerHTML.slice(0, 80)).toBeGreaterThan(25);
      const title = e.dataset.helpTitle ?? e.getAttribute('aria-label') ?? e.textContent;
      expect((title ?? '').trim().length, e.outerHTML.slice(0, 80)).toBeGreaterThan(0);
    }
  });
  it('text fields have placeholder text', () => {
    const bad = [...document.querySelectorAll<HTMLInputElement>('input[type=search], input:not([type]), input[type=text], textarea')].filter((i) => !i.placeholder);
    expect(bad.map((i) => i.id)).toEqual([]);
  });
  it('every dialog choice is explained by an info button or help text', () => {
    const bad = [...document.querySelectorAll<HTMLSelectElement>('dialog select')].filter((s) => !s.closest('label')?.querySelector('button.info[data-help]'));
    expect(bad.map((s) => s.name)).toEqual([]);
    const fields = [...document.querySelectorAll<HTMLInputElement>('dialog input[placeholder]')].filter((i) => !i.closest('label')?.querySelector('button.info[data-help]'));
    expect(fields.map((i) => i.id)).toEqual(['nb-code']);   // the code field sits under the Book choice, which is explained
  });
});

describe('help popover', () => {
  beforeEach(() => {
    document.body.innerHTML = body;
    (document.getElementById('msg') as HTMLElement).textContent = '';
  });
  const setup = () => { initHelp(document.getElementById('explain')!); return document.getElementById('popover')!; };

  it('an info button opens an explanation and Escape closes it', () => {
    const pop = setup();
    const i = document.querySelector<HTMLElement>('#convert-form button.info')!;
    i.click();
    expect(pop.hidden).toBe(false);
    expect(pop.textContent).toContain('USFM is the standard format');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(pop.hidden).toBe(true);
  });
  it('shows what to do next when a button has a next step', () => {
    const pop = setup();
    document.querySelector<HTMLElement>('#open-folder')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(pop.hidden).toBe(true);   // not in Explain mode: the click is left alone
    document.getElementById('explain')!.click();
    let activated = false;
    const open = document.getElementById('open-folder')!;
    open.addEventListener('click', () => { activated = true; });
    open.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(activated).toBe(false);   // Explain mode explains instead of acting
    expect(pop.hidden).toBe(false);
    expect(pop.textContent).toContain('Next:');
    expect(pop.textContent).toContain('Pick a book');
    expect(document.getElementById('msg')!.textContent).toMatch(/Explain mode is on/);
  });
});
