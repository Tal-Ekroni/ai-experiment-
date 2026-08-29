/**
 * Recurring-charge detection (org cycle 1). Pure arithmetic over the ledger — no deps, no LLM.
 * Honest about uncertainty: flags "looks recurring", never asserts, never auto-acts.
 */
import type { DatabaseSync } from 'node:sqlite';

export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export interface Recurring {
  merchant: string; category: string; count: number;
  cadence: Cadence; avgAmount: number; monthly: number;
  lastDate: string; nextDate: string; rose: boolean; stable: boolean;
}

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;
const median = (xs: number[]) => { const s=[...xs].sort((a,b)=>a-b); const m=s.length>>1; return s.length%2?s[m]:(s[m-1]+s[m])/2; };
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n*DAY).toISOString().slice(0,10);

const CADENCE: [Cadence, number, number, number][] = [
  // name, min gap, max gap, per-year multiplier
  ['weekly',    5,   10,  52],
  ['monthly',   25,  38,  12],
  ['quarterly', 80,  100, 4],
  ['yearly',    350, 385, 1],
];

/** Detect recurring merchants. minCount=3 occurrences at a regular cadence. */
export function detectRecurring(db: DatabaseSync, minCount = 3): Recurring[] {
  const rows = db.prepare(`SELECT COALESCE(m.normalized, t.raw_descriptor) AS merch, m.display AS display,
      t.booking_date AS d, -t.amount AS amt, t.category AS cat
    FROM transactions t LEFT JOIN merchants m ON m.id = t.merchant_id
    WHERE t.flow_class='expense' AND t.status!='superseded'
    ORDER BY merch, d`).all() as unknown as { merch: string; display: string; d: string; amt: number; cat: string }[];

  const byMerch = new Map<string, typeof rows>();
  for (const r of rows) { (byMerch.get(r.merch) ?? byMerch.set(r.merch, []).get(r.merch)!).push(r); }

  const out: Recurring[] = [];
  for (const [, txs] of byMerch) {
    if (txs.length < minCount) continue;
    const dates = txs.map(t => t.d);
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) gaps.push(days(dates[i], dates[i-1]));
    if (gaps.length === 0) continue;
    const g = median(gaps);
    const cad = CADENCE.find(([, lo, hi]) => g >= lo && g <= hi);
    if (!cad) continue;                                   // not a regular cadence → not recurring
    // amount stability: coefficient of variation
    const amts = txs.map(t => t.amt);
    const mean = amts.reduce((s,x)=>s+x,0)/amts.length;
    if (mean <= 0) continue;
    const sd = Math.sqrt(amts.reduce((s,x)=>s+(x-mean)**2,0)/amts.length);
    const cv = sd / mean;
    if (cv > 0.35) continue;                              // too variable → a habit, not a subscription
    const [cadence, , , perYear] = cad;
    const last = dates[dates.length-1];
    const rose = amts[amts.length-1] > mean * 1.12 && amts.length >= 3;
    out.push({
      merchant: txs[txs.length-1].display ?? txs[0].merch,
      category: txs[txs.length-1].cat ?? 'אחר',
      count: txs.length, cadence, avgAmount: Math.round(mean),
      monthly: Math.round(mean * perYear / 12),
      lastDate: last, nextDate: addDays(last, Math.round(g)),
      rose, stable: cv < 0.05,
    });
  }
  return out.sort((a,b) => b.monthly - a.monthly);
}

export function recurringTotal(list: Recurring[]) {
  return { monthly: list.reduce((s,r)=>s+r.monthly,0), count: list.length };
}
