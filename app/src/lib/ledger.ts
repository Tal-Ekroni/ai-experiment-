/**
 * Flow classification (§3.1–§3.3 of the spec).
 * Every transaction resolves to expense | income | internal before it can reach a total.
 * Ambiguity is NEVER resolved by picking: multiple candidates → a link question.
 */
import type { DatabaseSync } from 'node:sqlite';

const DAY = 86_400_000;
const dayDiff = (a: string, b: string) =>
  Math.abs((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY);

interface TxRow {
  id: number; account_id: number; booking_date: string; value_date: string;
  amount: number; raw_descriptor: string; flow_class: string; link_id: string | null;
  status: string;
}

/** Baseline: sign decides expense/income. Runs before matchers. */
export function classifyBySign(db: DatabaseSync): void {
  db.prepare(`UPDATE transactions SET flow_class = CASE WHEN amount < 0 THEN 'expense' ELSE 'income' END
              WHERE link_id IS NULL AND status != 'superseded'`).run();
}

/**
 * §3.1 own-account transfer matching (fallback form: opposing sign, equal amount, ≤3 days).
 * Only when EXACTLY ONE candidate pair fits; otherwise a link question.
 */
export function matchTransfers(db: DatabaseSync): { linked: number; questions: number } {
  const txs = db.prepare(`SELECT * FROM transactions
    WHERE link_id IS NULL AND status != 'superseded' AND flow_class != 'internal'
    ORDER BY value_date`).all() as unknown as TxRow[];
  let linked = 0, questions = 0;
  const taken = new Set<number>();
  for (const t of txs) {
    if (taken.has(t.id) || t.amount >= 0) continue;
    const candidates = txs.filter(c =>
      !taken.has(c.id) && c.id !== t.id &&
      c.account_id !== t.account_id &&
      c.amount === -t.amount &&
      dayDiff(c.value_date, t.value_date) <= 3);
    // Uniqueness must hold in BOTH directions: if two debits could claim the same credit,
    // picking either can delete real spending (§3.2). Reverse check before linking.
    const reverseClaims = candidates.length === 1
      ? txs.filter(r =>
          !taken.has(r.id) && r.id !== candidates[0].id &&
          r.account_id !== candidates[0].account_id &&
          r.amount === -candidates[0].amount &&
          dayDiff(r.value_date, candidates[0].value_date) <= 3)
      : [];
    if (candidates.length === 1 && reverseClaims.length === 1) {
      const c = candidates[0];
      const link = `xfer:${t.id}:${c.id}`;
      db.prepare(`UPDATE transactions SET flow_class='internal', link_id=? WHERE id IN (?,?)`).run(link, t.id, c.id);
      taken.add(t.id); taken.add(c.id); linked++;
    } else if (candidates.length > 1 || reverseClaims.length > 1) {
      db.prepare(`INSERT INTO link_questions(kind, tx_ids) VALUES('transfer', ?)`)
        .run(JSON.stringify([t.id, ...candidates.map(c => c.id), ...reverseClaims.map(r => r.id)].filter((v,i,a)=>a.indexOf(v)===i)));
      taken.add(t.id); candidates.forEach(c => taken.add(c.id));
      questions++;
    }
  }
  return { linked, questions };
}

/**
 * §3.1 card settlement matching: the bank-side debit equal to a card statement total,
 * within ±4 days of the charge date, from the account the card settles from.
 * Card purchases are the truth for spend; the settling debit becomes internal.
 */
export function matchSettlements(db: DatabaseSync): { linked: number; questions: number } {
  const stmts = db.prepare(`SELECT s.*, a.settles_from FROM statements s
    JOIN accounts a ON a.id = s.card_account_id
    WHERE s.matched_tx_id IS NULL AND a.settles_from IS NOT NULL`).all() as unknown as
    { id: number; card_account_id: number; total: number; charge_date: string; settles_from: number }[];
  let linked = 0, questions = 0;
  for (const s of stmts) {
    const candidates = db.prepare(`SELECT * FROM transactions
      WHERE account_id = ? AND amount = ? AND link_id IS NULL AND status != 'superseded'`)
      .all(s.settles_from, -s.total) as unknown as TxRow[];
    const inWindow = candidates.filter(c => dayDiff(c.value_date, s.charge_date) <= 4);
    if (inWindow.length === 1) {
      const c = inWindow[0];
      db.prepare(`UPDATE transactions SET flow_class='internal', link_id=? WHERE id=?`)
        .run(`stmt:${s.id}`, c.id);
      db.prepare(`UPDATE statements SET matched_tx_id=? WHERE id=?`).run(c.id, s.id);
      linked++;
    } else if (inWindow.length > 1) {
      db.prepare(`INSERT INTO link_questions(kind, tx_ids) VALUES('settlement', ?)`)
        .run(JSON.stringify(inWindow.map(c => c.id)));
      questions++;
    }
  }
  return { linked, questions };
}

/**
 * §3.3 pending → settled supersede: keyed on account + merchant + date ≤5 days,
 * never on external id. Settled is truth; ambiguity is a link question.
 */
export function supersedePending(db: DatabaseSync): { superseded: number; questions: number } {
  const pending = db.prepare(`SELECT * FROM transactions WHERE status='pending'`).all() as unknown as TxRow[];
  let superseded = 0, questions = 0;
  for (const p of pending) {
    const settled = db.prepare(`SELECT * FROM transactions
      WHERE status='settled' AND account_id = ? AND raw_descriptor = ? AND id != ?`)
      .all(p.account_id, p.raw_descriptor, p.id) as unknown as TxRow[];
    const inWindow = settled.filter(s => dayDiff(s.value_date, p.value_date) <= 5);
    if (inWindow.length === 1) {
      db.prepare(`UPDATE transactions SET status='superseded', flow_class='internal' WHERE id=?`).run(p.id);
      superseded++;
    } else if (inWindow.length > 1) {
      db.prepare(`INSERT INTO link_questions(kind, tx_ids) VALUES('supersede', ?)`)
        .run(JSON.stringify([p.id, ...inWindow.map(s => s.id)]));
      questions++;
    }
  }
  return { superseded, questions };
}

/** Run the full pipeline in the spec's order. */
export function classifyAll(db: DatabaseSync) {
  classifyBySign(db);
  const sup = supersedePending(db);
  inferStatements(db);
  const stmt = matchSettlements(db);
  const xfer = matchTransfers(db);
  return { sup, stmt, xfer };
}

/** Month totals over classified flows only. Superseded and internal never reach totals. */
export function monthTotals(db: DatabaseSync, month: string): { income: number; expense: number } {
  const row = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN flow_class='income' THEN amount END), 0) AS income,
      COALESCE(SUM(CASE WHEN flow_class='expense' THEN -amount END), 0) AS expense
    FROM transactions
    WHERE substr(booking_date,1,7) = ? AND status != 'superseded' AND flow_class != 'internal'`)
    .get(month) as { income: number; expense: number };
  return row;
}

export function categoryTotals(db: DatabaseSync, month: string): { category: string; total: number }[] {
  return db.prepare(`SELECT COALESCE(category,'אחר') AS category, SUM(-amount) AS total
    FROM transactions
    WHERE substr(booking_date,1,7) = ? AND flow_class='expense' AND status != 'superseded'
    GROUP BY COALESCE(category,'אחר') ORDER BY total DESC`).all(month) as unknown as
    { category: string; total: number }[];
}

/**
 * §3.6.1 reconciliation coverage: which accounts are reconcilable at all, and what share
 * of the month's spend they carry. import → unreconcilable; assisted → 30-day resolution.
 */
export function reconciliationCoverage(db: DatabaseSync, month: string) {
  const accounts = db.prepare(`SELECT id, name, sync_mode FROM accounts`).all() as unknown as
    { id: number; name: string; sync_mode: string }[];
  const perAccount = accounts.map(a => {
    const spend = (db.prepare(`SELECT COALESCE(SUM(-amount),0) AS s FROM transactions
      WHERE account_id=? AND substr(booking_date,1,7)=? AND flow_class='expense' AND status!='superseded'`)
      .get(a.id, month) as { s: number }).s;
    const status = a.sync_mode === 'unattended' ? 'reconcilable'
      : a.sync_mode === 'assisted' ? '30-day resolution' : 'unreconcilable';
    return { ...a, spend, status };
  });
  const total = perAccount.reduce((s, a) => s + a.spend, 0);
  const covered = perAccount.filter(a => a.status === 'reconcilable').reduce((s, a) => s + a.spend, 0);
  return {
    accounts: perAccount,
    reconcilableAccounts: perAccount.filter(a => a.status === 'reconcilable').length,
    totalAccounts: accounts.length,
    spendSharePct: total === 0 ? 0 : Math.round((covered / total) * 100),
  };
}

/**
 * For import-mode cards there is no scraped Statement feed — but the card file IS the
 * issuer's own data, so the calendar-month sum is the issuer-reported total (§3.1).
 * One inferred statement per card-month, charged ~10th of the following month.
 */
export function inferStatements(db: DatabaseSync): number {
  const cards = db.prepare(`SELECT id FROM accounts WHERE kind='card' AND settles_from IS NOT NULL`)
    .all() as unknown as { id: number }[];
  let created = 0;
  for (const c of cards) {
    const months = db.prepare(`SELECT substr(booking_date,1,7) AS m, SUM(-amount) AS total
      FROM transactions WHERE account_id = ? AND amount < 0 AND status != 'superseded'
      GROUP BY m`).all(c.id) as unknown as { m: string; total: number }[];
    for (const mo of months) {
      const exists = db.prepare(`SELECT id FROM statements WHERE card_account_id = ? AND charge_date LIKE ?`)
        .get(c.id, nextMonth(mo.m) + '%');
      if (exists) continue;
      db.prepare(`INSERT INTO statements(card_account_id, total, charge_date) VALUES(?,?,?)`)
        .run(c.id, mo.total, nextMonth(mo.m) + '-10');
      created++;
    }
  }
  return created;
}
function nextMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}
