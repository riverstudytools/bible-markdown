/** Remove anything from Bible HTML that could run code or phone home before it is shown in the preview. */
const DROP = new Set(['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math', 'video', 'audio', 'source', 'track']);
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'srcset']);

export function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (DROP.has(child.tagName.toLowerCase())) { child.remove(); continue; }
      for (const a of Array.from(child.attributes)) {
        const n = a.name.toLowerCase();
        if (n.startsWith('on') || n === 'style' || n === 'srcdoc') { child.removeAttribute(a.name); continue; }
        if (URL_ATTRS.has(n)) {
          const v = a.value.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
          const ok = v.startsWith('#') || v.startsWith('http:') || v.startsWith('https:') || v.startsWith('mailto:') || !/^[a-z][a-z0-9+.-]*:/.test(v);
          if (!ok || n === 'srcset') child.removeAttribute(a.name);
          else if (n === 'src') child.removeAttribute(a.name); // no remote images in the preview
        }
      }
      if (child.tagName.toLowerCase() === 'a') { child.setAttribute('rel', 'noopener noreferrer'); child.setAttribute('target', '_blank'); }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
