/** §11 — the twelve-month retrospect: the strongest thing the app says all year. */
import type { DatabaseSync } from 'node:sqlite';

export function retrospect(db: DatabaseSync) {
  const bounds = db.prepare(`SELECT MIN(booking_date) lo, MAX(booking_date) hi FROM transactions
    WHERE status != 'superseded'`).get() as { lo: string | null; hi: string | null };
  if (!bounds.lo) return null;
  const months = db.prepare(`SELECT substr(booking_date,1,7) AS m,
      COALESCE(SUM(CASE WHEN flow_class='income' THEN amount END),0) AS income,
      COALESCE(SUM(CASE WHEN flow_class='expense' THEN -amount END),0) AS expense
    FROM transactions WHERE status != 'superseded' AND flow_class != 'internal'
    GROUP BY m ORDER BY m DESC LIMIT 12`).all() as unknown as { m: string; income: number; expense: number }[];
  months.reverse();
  const totalIn = months.reduce((s, r) => s + r.income, 0);
  const totalOut = months.reduce((s, r) => s + r.expense, 0);
  const mix = db.prepare(`SELECT COALESCE(category,'אחר') AS category, SUM(-amount) AS total
    FROM transactions WHERE flow_class='expense' AND status != 'superseded'
    GROUP BY COALESCE(category,'אחר') ORDER BY total DESC`).all() as unknown as { category: string; total: number }[];
  const largest = db.prepare(`SELECT t.booking_date, t.amount, t.raw_descriptor
    FROM transactions t WHERE flow_class='expense' AND status != 'superseded'
    ORDER BY amount ASC LIMIT 1`).get() as { booking_date: string; amount: number; raw_descriptor: string } | undefined;
  const topMerchant = db.prepare(`SELECT m.display, m.tx_count, m.volume
    FROM merchants m ORDER BY m.tx_count DESC LIMIT 1`).get() as
    { display: string; tx_count: number; volume: number } | undefined;
  return { months, totalIn, totalOut, net: totalIn - totalOut, mix, largest, topMerchant };
}

/** §6 interim signal: this month vs last, never labelled drift. */
export function monthOverMonth(db: DatabaseSync) {
  const rows = db.prepare(`SELECT substr(booking_date,1,7) AS m, COALESCE(category,'אחר') AS category, SUM(-amount) AS total
    FROM transactions WHERE flow_class='expense' AND status != 'superseded'
    GROUP BY m, category ORDER BY m DESC`).all() as unknown as { m: string; category: string; total: number }[];
  const months = [...new Set(rows.map(r => r.m))].sort().reverse();
  if (months.length < 2) return null;
  const [cur, prev] = months;
  const get = (m: string) => Object.fromEntries(rows.filter(r => r.m === m).map(r => [r.category, r.total]));
  const c = get(cur), p = get(prev);
  const cats = [...new Set([...Object.keys(c), ...Object.keys(p)])];
  const deltas = cats.map(cat => ({ category: cat, cur: c[cat] ?? 0, prev: p[cat] ?? 0, delta: (c[cat] ?? 0) - (p[cat] ?? 0) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const curTotal = Object.values(c).reduce((s, v) => s + v, 0);
  const prevTotal = Object.values(p).reduce((s, v) => s + v, 0);
  return { cur, prev, curMonth: cur, prevMonth: prev, curTotal, prevTotal, delta: curTotal - prevTotal, deltas };
}
