/**
 * §5.4 — the Answerer. Reads only. Sender allowlist. The question maps to a fixed intent
 * set with an enumerated parameter schema; anything failing validation is refused, not
 * repaired. Figures are inserted VERBATIM from selected rows; a model (when present)
 * supplies framing only. Every question is acknowledged before it is answered.
 */
import type { DatabaseSync } from 'node:sqlite';
import { fmt, parseAmount } from '../lib/money.ts';
import { CATEGORIES } from '../lib/db.ts';
import { monthOverMonth } from '../lib/retrospect.ts';

export type Intent =
  | { kind: 'tx_lookup'; amount?: number; day?: string }
  | { kind: 'category_month'; category: string; month?: string }
  | { kind: 'month_total'; month?: string }
  | { kind: 'why_above' };

/** Deterministic intent mapping — a bounded classifier, not a model. */
export function parseIntent(q: string): Intent | null {
  const s = q.trim();
  const catHit = CATEGORIES.find(c => s.includes(c));
  const amountM = s.match(/(\d[\d,]*(?:\.\d{1,2})?)\s*(?:ש"ח|שח|₪)|₪\s*(\d[\d,]*(?:\.\d{1,2})?)/);
  const dayM = s.match(/ב-?(\d{1,2})[\/.](\d{1,2})|ב-?(\d{1,2}) לחודש/);
  if (/למה|מדוע/.test(s) && /רגיל|נורמל|מעל/.test(s)) return { kind: 'why_above' };
  if (catHit) {
    const lastMonth = /שעבר|קודם/.test(s);
    const m = new Date(); if (lastMonth) m.setMonth(m.getMonth() - 1);
    return { kind: 'category_month', category: catHit, month: m.toISOString().slice(0, 7) };
  }
  if (amountM) {
    const amt = parseAmount(amountM[1] ?? amountM[2]);
    let day: string | undefined;
    if (dayM) {
      const d = dayM[1] ?? dayM[3], mo = dayM[2];
      const now = new Date();
      day = `${now.getFullYear()}-${String(mo ? Number(mo) : now.getMonth() + 1).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
    }
    return { kind: 'tx_lookup', amount: amt, day };
  }
  if (/כמה יצא|כמה הוצאנו|סך הכל/.test(s)) {
    const lastMonth = /שעבר|קודם/.test(s);
    const m = new Date(); if (lastMonth) m.setMonth(m.getMonth() - 1);
    return { kind: 'month_total', month: m.toISOString().slice(0, 7) };
  }
  return null;
}

/** Schema validation: refuse, don't repair (§5.4). */
export function validateIntent(i: unknown): Intent | null {
  if (!i || typeof i !== 'object') return null;
  const o = i as Record<string, unknown>;
  switch (o.kind) {
    case 'why_above': return { kind: 'why_above' };
    case 'month_total':
      return o.month === undefined || /^\d{4}-\d{2}$/.test(String(o.month))
        ? { kind: 'month_total', month: o.month as string | undefined } : null;
    case 'category_month':
      if (!(CATEGORIES as readonly string[]).includes(String(o.category))) return null;
      return o.month === undefined || /^\d{4}-\d{2}$/.test(String(o.month))
        ? { kind: 'category_month', category: String(o.category), month: o.month as string | undefined } : null;
    case 'tx_lookup': {
      if (o.amount !== undefined && !Number.isSafeInteger(o.amount)) return null;
      if (o.day !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(o.day))) return null;
      return { kind: 'tx_lookup', amount: o.amount as number | undefined, day: o.day as string | undefined };
    }
    default: return null;
  }
}

/** Deterministic retrieval + templated numeric spine. Figures verbatim from rows. */
export function answer(db: DatabaseSync, intent: Intent): string {
  switch (intent.kind) {
    case 'tx_lookup': {
      const conds: string[] = [`flow_class != 'internal'`, `status != 'superseded'`];
      const args: (number | string)[] = [];
      if (intent.amount !== undefined) { conds.push(`ABS(amount) BETWEEN ? AND ?`); args.push(intent.amount - 100, intent.amount + 100); }
      if (intent.day) { conds.push(`booking_date = ?`); args.push(intent.day); }
      const rows = db.prepare(`SELECT booking_date, amount, raw_descriptor, category FROM transactions
        WHERE ${conds.join(' AND ')} ORDER BY booking_date DESC LIMIT 3`).all(...args) as any[];
      if (rows.length === 0) return 'לא מצאתי תנועה כזאת.';
      return rows.map(r => `${r.booking_date} · ${r.raw_descriptor} · ${fmt(r.amount)}${r.category ? ` (${r.category})` : ''}`).join('\n');
    }
    case 'category_month': {
      const m = intent.month ?? new Date().toISOString().slice(0, 7);
      const r = db.prepare(`SELECT COALESCE(SUM(-amount),0) AS t, COUNT(*) AS n FROM transactions
        WHERE category = ? AND substr(booking_date,1,7) = ? AND flow_class='expense' AND status != 'superseded'`)
        .get(intent.category, m) as any;
      return `${intent.category} ב-${m}: ${fmt(r.t)} (${r.n} תנועות)`;
    }
    case 'month_total': {
      const m = intent.month ?? new Date().toISOString().slice(0, 7);
      const r = db.prepare(`SELECT COALESCE(SUM(CASE WHEN flow_class='expense' THEN -amount END),0) AS out,
        COALESCE(SUM(CASE WHEN flow_class='income' THEN amount END),0) AS inc FROM transactions
        WHERE substr(booking_date,1,7) = ? AND status != 'superseded' AND flow_class != 'internal'`).get(m) as any;
      return `${m}: יצא ${fmt(r.out)}, נכנס ${fmt(r.inc)}`;
    }
    case 'why_above': {
      const mom = monthOverMonth(db);
      if (!mom) return 'אין עדיין חודשיים מלאים להשוואה.';
      const top = mom.deltas.slice(0, 3).map(d => `${d.category}: ${fmt(d.delta, { sign: true })}`).join(' · ');
      return `${mom.curMonth} מול ${mom.prevMonth}: ${fmt(mom.delta, { sign: true })}. ${top}. חודש מול חודש — לא מגמה.`;
    }
  }
}

/** Telegram long-poll loop. Outbound only — no inbound port. Activates only with token + allowlist. */
export async function startBot(db: DatabaseSync): Promise<void> {
  const token = process.env.KUPA_TELEGRAM_TOKEN;
  const allow = (process.env.KUPA_TELEGRAM_CHATS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (!token || allow.length === 0) return;   // no token or no allowlist → the surface does not exist
  const api = (m: string, body: object) =>
    fetch(`https://api.telegram.org/bot${token}/${m}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let offset = 0;
  for (;;) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates?timeout=50&offset=${offset}`);
      const j = await r.json() as any;
      for (const u of j.result ?? []) {
        offset = u.update_id + 1;
        const chatId = String(u.message?.chat?.id ?? '');
        if (!allow.includes(chatId)) continue;           // dropped silently — no reply, no error
        const q = String(u.message?.text ?? '');
        await api('sendMessage', { chat_id: chatId, text: 'רגע, בודקת…' });  // §5.4 acknowledge
        db.prepare(`INSERT INTO job_runs(job, started_at, ok) VALUES('answerer', datetime('now'), 1)`).run();
        const intent = validateIntent(parseIntent(q));
        const text = intent ? answer(db, intent)
          : 'לא הבנתי. אפשר לשאול: "כמה יצא החודש", "מסעדות בחודש שעבר", "מה היה ה-1,200 ב-14/8", "למה אנחנו מעל הרגיל".';
        await api('sendMessage', { chat_id: chatId, text });
      }
    } catch { await new Promise(res => setTimeout(res, 5000)); }
  }
}
