/** Server-side HTML helpers. escape() is the XSS boundary — every interpolation goes through h``. */
export function escape(s: unknown): string {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
/** Tagged template: interpolations are escaped unless wrapped in raw(). */
const RAW = Symbol('raw');
export function raw(s: string): { [RAW]: string } { return { [RAW]: s }; }
export function h(strings: TemplateStringsArray, ...vals: unknown[]): string {
  let out = '';
  strings.forEach((str, i) => {
    out += str;
    if (i < vals.length) {
      const v = vals[i];
      if (v == null || v === false) return;
      if (Array.isArray(v)) out += v.join('');
      else if (typeof v === 'object' && v !== null && RAW in (v as object)) out += (v as any)[RAW];
      else out += escape(v);
    }
  });
  return out;
}
export function page(title: string, active: string, body: string, opts: { nav?: boolean } = { nav: true }): string {
  const links: [string, string][] = [
    ['/', 'ראשי'], ['/retrospect', 'השנה'], ['/review', 'סקירה'],
    ['/transactions', 'תנועות'], ['/health', 'תקינות'], ['/settings', 'הגדרות'],
  ];
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · קופה</title><link rel="stylesheet" href="/kupa.css"></head><body>
${opts.nav === false ? '' : `<nav>${links.map(([href, label]) =>
  `<a href="${href}"${href === active ? ' aria-current="page"' : ''}>${escape(label)}</a>`).join('')}</nav>`}
<main>${body}</main></body></html>`;
}
