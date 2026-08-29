/**
 * §5.1 — the digest earns each send; two-sided triggers, good-news bar LOWER than bad.
 * §5.2 — chores decay (fire once, standing state); broken re-states every send and leads.
 */
import type { DatabaseSync } from 'node:sqlite';
import { fmt } from '../lib/money.ts';
import { getSetting, setSetting } from '../lib/db.ts';
import { monthOverMonth } from '../lib/retrospect.ts';
import { explainability } from '../lib/categorize.ts';
import { runSelfCheck } from './selfcheck.ts';

function weekStats(db: DatabaseSync) {
  const rows = db.prepare(`SELECT strftime('%Y-%W', booking_date) AS wk, SUM(-amount) AS out
    FROM transactions WHERE flow_class='expense' AND status != 'superseded'
    GROUP BY wk ORDER BY wk DESC LIMIT 14`).all() as any[];
  if (rows.length < 4) return null;
  const [cur, ...hist] = rows;
  const mean = hist.reduce((s, r) => s + r.out, 0) / hist.length;
  const sd = Math.sqrt(hist.reduce((s, r) => s + (r.out - mean) ** 2, 0) / hist.length) || 1;
  return { cur: cur.out, mean, sd, z: (cur.out - mean) / sd };
}

const firedOnce = (db: DatabaseSync, key: string): boolean => {
  if (getSetting(db, `fired:${key}`)) return true;
  setSetting(db, `fired:${key}`, '1');
  return false;
};

export function buildWeeklyDigest(db: DatabaseSync): string | null {
  const lines: string[] = [];
  // broken tier — re-states every send, leads the message, never decays
  const broken = runSelfCheck(db, process.env.KUPA_DB ?? './data/kupa.db').filter(c => !c.ok);
  for (const b of broken) lines.push(`⛔ ${b.name}: ${b.detail}`);
  // chores + good news
  const w = weekStats(db);
  if (w && w.z > 1.5 && !firedOnce(db, `exp-week:${new Date().toISOString().slice(0, 10)}`))
    lines.push(`⚠ שבוע יקר: ${fmt(w.cur)} — ${fmt(Math.round(w.cur - w.mean))} מעל הרגיל`);
  if (w && w.z < -1.0)
    lines.push(`✓ שבוע חסכוני: ${fmt(w.cur)} — ${fmt(Math.round(w.mean - w.cur))} מתחת לרגיל שלכם`);
  const month = new Date().toISOString().slice(0, 7);
  const ex = explainability(db, month);
  if (ex.total > 0 && ex.explainedPct + ex.attributedPct < 95 && !firedOnce(db, `explain:${month}`))
    lines.push(`⚠ ${100 - ex.explainedPct - ex.attributedPct}% מההוצאה החודש עדיין בלתי מוסברת`);
  return lines.length ? lines.join('\n') : null;   // silence is information
}

export function buildMonthlyClose(db: DatabaseSync): string | null {
  const mom = monthOverMonth(db);
  if (!mom) return null;
  const good = mom.delta < 0;
  const head = good
    ? `✓ ${mom.prevMonth}: ${fmt(-mom.delta)} פחות מהחודש שלפניו. כל הכבוד.`
    : `${mom.prevMonth}: ${fmt(mom.delta)} יותר מהחודש שלפניו.`;
  const top = mom.deltas[0];
  const mover = top ? `הקטגוריה שזזה הכי הרבה: ${top.category} (${fmt(top.delta, { sign: true })})` : '';
  const ex = explainability(db, mom.prevMonth);
  return [head, `סה״כ יצא: ${fmt(mom.prevTotal)}`, mover,
    `מוסבר: ${ex.explainedPct}% · משויך: ${ex.attributedPct}%`,
    `זה חודש מול חודש — לא מגמה.`].filter(Boolean).join('\n');
}
