/**
 * Help system. Any element can carry `data-help` (what it does), `data-help-title` and `data-help-next`
 * (what to do afterwards). The text is shown
 *  - as a tooltip when the element is hovered or focused,
 *  - when an "i" button (class "info") is clicked or tapped,
 *  - when Explain mode is on and the element is clicked (the click does not activate it).
 */
let pop: HTMLElement;
let anchor: Element | null = null;
let sticky = false;
let timer: number | undefined;
let explainOn = false;

function content(el: Element): { title: string; body: string; next: string } | null {
  const host = el.closest('[data-help]') as HTMLElement | null;
  if (!host) return null;
  const title = host.dataset.helpTitle ?? host.getAttribute('aria-label') ?? (host.classList.contains('info') ? '' : (host.textContent ?? '').trim());
  return { title, body: host.dataset.help ?? '', next: host.dataset.helpNext ?? '' };
}

function show(el: Element, makeSticky: boolean) {
  const c = content(el);
  if (!c) return;
  const host = el.closest('[data-help]') as HTMLElement;
  anchor = host; sticky = makeSticky;
  pop.replaceChildren();
  if (c.title) { const h = document.createElement('strong'); h.textContent = c.title; pop.append(h); }
  for (const para of c.body.split('\n')) { const p = document.createElement('p'); p.textContent = para; pop.append(p); }
  if (c.next) { const p = document.createElement('p'); p.className = 'next'; const b = document.createElement('b'); b.textContent = 'Next: '; p.append(b, c.next); pop.append(p); }
  if (makeSticky) { const x = document.createElement('button'); x.className = 'close'; x.type = 'button'; x.textContent = 'Got it'; x.onclick = hide; pop.append(x); }
  pop.hidden = false;
  if (typeof pop.showPopover === 'function' && !pop.matches(':popover-open')) pop.showPopover();   // top layer: stays above open dialogs
  host.setAttribute('aria-describedby', 'popover');
  const r = host.getBoundingClientRect();
  const w = Math.min(320, window.innerWidth - 16);
  pop.style.width = w + 'px';
  const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  pop.style.left = left + 'px';
  pop.style.top = '0px';
  const h = pop.offsetHeight;
  const below = r.bottom + 8;
  pop.style.top = (below + h > window.innerHeight && r.top - h - 8 > 0 ? r.top - h - 8 : below) + 'px';
}

function hide() {
  clearTimeout(timer);
  if (typeof pop.hidePopover === 'function' && pop.matches(':popover-open')) pop.hidePopover();
  pop.hidden = true; sticky = false;
  anchor?.removeAttribute('aria-describedby');
  anchor = null;
}

export function initHelp(explainButton: HTMLElement) {
  pop = document.getElementById('popover')!;
  pop.setAttribute('role', 'tooltip');

  const overHost = (e: Event) => (e.target as Element | null)?.closest?.('[data-help]') as HTMLElement | null;
  document.addEventListener('mouseover', (e) => {
    const h = overHost(e);
    if (!h || h.classList.contains('info') || sticky || explainOn) return;
    clearTimeout(timer); timer = window.setTimeout(() => show(h, false), 450);
  });
  document.addEventListener('mouseout', (e) => { if (!sticky && overHost(e)) { clearTimeout(timer); hide(); } });
  document.addEventListener('focusin', (e) => {
    const h = overHost(e);
    if (h && !h.classList.contains('info') && !sticky && !explainOn) show(h, false);
  });
  document.addEventListener('focusout', () => { if (!sticky) hide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) hide(); });

  document.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (pop.contains(t)) return;
    const h = overHost(e);
    if (h && h.classList.contains('info')) { e.preventDefault(); e.stopPropagation(); sticky && anchor === h ? hide() : show(h, true); return; }
    if (explainOn && h && !explainButton.contains(t)) { e.preventDefault(); e.stopPropagation(); show(h, true); return; }
    if (sticky) hide();
  }, true);

  explainButton.addEventListener('click', () => {
    explainOn = !explainOn;
    explainButton.setAttribute('aria-pressed', String(explainOn));
    document.body.classList.toggle('explain', explainOn);
    hide();
    document.getElementById('msg')!.textContent = explainOn
      ? 'Explain mode is on: click any button, link or field to learn what it does. Click “Explain” again to turn it off.'
      : 'Explain mode is off.';
  });
}
