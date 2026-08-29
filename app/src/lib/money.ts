/** All money is integer agorot. These helpers are the only place formatting happens. */

export type Agorot = number;

export function assertAgorot(n: number): Agorot {
  if (!Number.isSafeInteger(n)) throw new Error(`not integer agorot: ${n}`);
  return n;
}

/** Parse a human amount string ("1,234.56", "-45.90", "1234") into agorot. Throws on garbage. */
export function parseAmount(raw: string): Agorot {
  const s = raw.replace(/[‎‏‪-‮]/g, '').replace(/[,\s₪]/g, '').trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error(`unparseable amount: ${JSON.stringify(raw)}`);
  const neg = s.startsWith('-');
  const [whole, frac = ''] = (neg ? s.slice(1) : s).split('.');
  const agorot = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return assertAgorot(neg ? -agorot : agorot);
}

/** Format agorot for display: "₪1,234.56" (no decimals when whole shekels). */
export function fmt(a: Agorot, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(a);
  const shekels = Math.floor(abs / 100);
  const rem = abs % 100;
  const body = shekels.toLocaleString('en-US') + (rem ? '.' + String(rem).padStart(2, '0') : '');
  const sign = a < 0 ? '-' : opts.sign && a > 0 ? '+' : '';
  return `${sign}₪${body}`;
}
