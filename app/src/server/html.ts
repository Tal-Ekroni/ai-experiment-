/** Server-side HTML. escape() is the XSS boundary; h`` auto-escapes every interpolation
 *  unless the value is itself Html (a nested h`` result or raw()). Html.toString() yields
 *  the raw markup, so `.map(h``).join('')` and String() compose without extra ceremony. */
export function escape(s: unknown): string {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
export class Html {
  constructor(readonly s: string) {}
  toString() { return this.s; }
}
export function raw(s: string | Html): Html { return s instanceof Html ? s : new Html(s); }
export function render(v: Html | string): string { return v instanceof Html ? v.s : String(v); }

export function h(strings: TemplateStringsArray, ...vals: unknown[]): Html {
  let out = '';
  strings.forEach((str, i) => {
    out += str;
    if (i < vals.length) {
      const v = vals[i];
      if (v == null || v === false) return;
      if (Array.isArray(v)) out += v.map(x => x instanceof Html ? x.s : escape(x)).join('');
      else if (v instanceof Html) out += v.s;
      else out += escape(v);
    }
  });
  return new Html(out);
}

export function page(title: string, active: string, body: Html | string, opts: { nav?: boolean } = { nav: true }): string {
  const links: [string, string][] = [
    ['/', 'ראשי'], ['/retrospect', 'השנה'], ['/review', 'סקירה'],
    ['/transactions', 'תנועות'], ['/health', 'תקינות'], ['/settings', 'הגדרות'],
  ];
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · קופה</title><link rel="stylesheet" href="/kupa.css"></head><body>
${opts.nav === false ? '' : `<nav>${links.map(([href, label]) =>
  `<a href="${href}"${href === active ? ' aria-current="page"' : ''}>${escape(label)}</a>`).join('')}</nav>`}
<main>${render(body)}</main></body></html>`;
}
