/**
 * Household balance sheet (roadmap wealth bet B) + free cash flow (bet A).
 * Manual/file-based only — no auto-sync (local-first gate). Balances in agorot.
 */
import type { DatabaseSync } from 'node:sqlite';
import { monthTotals } from './ledger.ts';

export type Kind = 'asset' | 'liability';
export interface WealthItem { id: number; name: string; kind: Kind; category: string; balance: number; updated_at: string }

/** Israeli-aware categories with an icon + hue for each. */
export const ASSET_CATS: Record<string, { label: string; icon: string; h: number }> = {
  cash:      { label: 'עו״ש / מזומן', icon: '💵', h: 142 },
  keren:     { label: 'קרן השתלמות', icon: '🎓', h: 255 },
  pension:   { label: 'פנסיה', icon: '🏦', h: 212 },
  gemel:     { label: 'קופת גמל', icon: '🛡️', h: 200 },
  broker:    { label: 'תיק השקעות', icon: '📈', h: 168 },
  realestate:{ label: 'נדל״ן', icon: '🏠', h: 38 },
  other_a:   { label: 'נכס אחר', icon: '💰', h: 48 },
};
export const LIAB_CATS: Record<string, { label: string; icon: string; h: number }> = {
  mortgage: { label: 'משכנתא', icon: '🏡', h: 22 },
  loan:     { label: 'הלוואה', icon: '🏷️', h: 315 },
  debt:     { label: 'חוב אשראי', icon: '💳', h: 334 },
  other_l:  { label: 'התחייבות אחרת', icon: '⚖️', h: 220 },
};
export function catMetaFor(kind: Kind, category: string) {
  return (kind === 'asset' ? ASSET_CATS : LIAB_CATS)[category] ?? { label: category, icon: '•', h: 220 };
}

const ym = (d = new Date()) => d.toISOString().slice(0, 7);

export function listItems(db: DatabaseSync, kind: Kind): WealthItem[] {
  return db.prepare(`SELECT * FROM wealth_items WHERE kind = ? ORDER BY sort, id`).all(kind) as unknown as WealthItem[];
}

export function upsertItem(db: DatabaseSync, item: { id?: number; name: string; kind: Kind; category: string; balance: number }) {
  let id = item.id;
  if (id) {
    db.prepare(`UPDATE wealth_items SET name=?, category=?, balance=?, updated_at=datetime('now') WHERE id=?`)
      .run(item.name, item.category, item.balance, id);
  } else {
    id = Number(db.prepare(`INSERT INTO wealth_items(name, kind, category, balance) VALUES(?,?,?,?)`)
      .run(item.name, item.kind, item.category, item.balance).lastInsertRowid);
  }
  // record this month's value in history (upsert)
  db.prepare(`INSERT INTO wealth_history(item_id, month, balance) VALUES(?,?,?)
              ON CONFLICT(item_id, month) DO UPDATE SET balance=excluded.balance`).run(id, ym(), item.balance);
  return id;
}

export function deleteItem(db: DatabaseSync, id: number) {
  db.prepare(`DELETE FROM wealth_history WHERE item_id=?`).run(id);
  db.prepare(`DELETE FROM wealth_items WHERE id=?`).run(id);
}

export function netWorth(db: DatabaseSync) {
  const a = (db.prepare(`SELECT COALESCE(SUM(balance),0) s FROM wealth_items WHERE kind='asset'`).get() as any).s;
  const l = (db.prepare(`SELECT COALESCE(SUM(balance),0) s FROM wealth_items WHERE kind='liability'`).get() as any).s;
  return { assets: a, liabilities: l, net: a - l };
}

/** Net worth for each of the last `n` months, using each item's latest history value at/before that month. */
export function netWorthHistory(db: DatabaseSync, n = 12) {
  const items = db.prepare(`SELECT id, kind FROM wealth_items`).all() as unknown as { id: number; kind: Kind }[];
  if (items.length === 0) return [];
  const now = new Date();
  const out: { month: string; net: number }[] = [];
  const balAt = db.prepare(`SELECT balance FROM wealth_history WHERE item_id=? AND month<=? ORDER BY month DESC LIMIT 1`);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const m = ym(d);
    let net = 0, any = false;
    for (const it of items) {
      const row = balAt.get(it.id, m) as { balance: number } | undefined;
      if (row) { any = true; net += it.kind === 'asset' ? row.balance : -row.balance; }
    }
    if (any) out.push({ month: m, net });
  }
  return out;
}

/** Free cash flow (bet A): income − expenses per month, from the existing ledger. */
export function freeCashFlow(db: DatabaseSync, n = 6) {
  const months = db.prepare(`SELECT DISTINCT substr(booking_date,1,7) m FROM transactions
    WHERE status!='superseded' AND flow_class!='internal' ORDER BY m DESC LIMIT ?`).all(n) as unknown as { m: string }[];
  const thisMonth = ym();
  return months.map(({ m }) => {
    const t = monthTotals(db, m);
    return { month: m, income: t.income, expense: t.expense, net: t.income - t.expense, partial: m === thisMonth };
  }).reverse();
}
