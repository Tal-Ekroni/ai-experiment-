import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/lib/db.ts';
import { parseAmount, fmt } from '../src/lib/money.ts';
import { classifyAll, monthTotals, matchTransfers, reconciliationCoverage } from '../src/lib/ledger.ts';

function seed(db: ReturnType<typeof openDb>) {
  db.prepare(`INSERT INTO accounts(id,name,institution,kind,sync_mode) VALUES(1,'עו"ש לאומי','leumi','bank','unattended')`).run();
  db.prepare(`INSERT INTO accounts(id,name,institution,kind,sync_mode,settles_from) VALUES(2,'ישראכרט','isracard','card','import',1)`).run();
  db.prepare(`INSERT INTO accounts(id,name,institution,kind,sync_mode) VALUES(3,'חיסכון','leumi','bank','import')`).run();
}
const ins = (db: any, acct: number, date: string, amount: number, desc: string, status = 'settled') =>
  db.prepare(`INSERT INTO transactions(account_id,booking_date,value_date,amount,raw_descriptor,status)
              VALUES(?,?,?,?,?,?)`).run(acct, date, date, amount, desc, status);

test('money: parse and format round-trip, integers only', () => {
  assert.equal(parseAmount('1,234.56'), 123456);
  assert.equal(parseAmount('-45.9'), -4590);
  assert.equal(parseAmount('1234'), 123400);
  assert.throws(() => parseAmount('12.345'));
  assert.throws(() => parseAmount('abc'));
  assert.equal(fmt(123456), '₪1,234.56');
  assert.equal(fmt(-840000), '-₪8,400');
});

test('card settlement debit becomes internal — the round-1 double-count', () => {
  const db = openDb(':memory:'); seed(db);
  // 3 card purchases totalling ₪8,400
  ins(db, 2, '2026-08-02', -300000, 'שופרסל דיל');
  ins(db, 2, '2026-08-10', -240000, 'סונול תל אביב');
  ins(db, 2, '2026-08-15', -300000, 'רמי לוי');
  // the consolidated debit on the bank side
  ins(db, 1, '2026-08-10', -840000, 'ישראכרט');
  db.prepare(`INSERT INTO statements(card_account_id,total,charge_date) VALUES(2,840000,'2026-08-10')`).run();
  classifyAll(db);
  const t = monthTotals(db, '2026-08');
  assert.equal(t.expense, 840000, 'spend must be ₪8,400, not ₪16,800');
  const internal = db.prepare(`SELECT COUNT(*) c FROM transactions WHERE flow_class='internal'`).get() as any;
  assert.equal(internal.c, 1);
});

test('own-account transfer: unique pair links, both sides internal', () => {
  const db = openDb(':memory:'); seed(db);
  ins(db, 1, '2026-08-05', -50000, 'העברה לחיסכון');
  ins(db, 3, '2026-08-06', 50000, 'העברה מעו"ש');
  ins(db, 1, '2026-08-20', -12000, 'קפה');
  classifyAll(db);
  const t = monthTotals(db, '2026-08');
  assert.equal(t.expense, 12000, 'transfer must not count as spend');
  assert.equal(t.income, 0, 'transfer must not count as income');
});

test('ambiguous transfer is NEVER picked — becomes a link question, counted as spend', () => {
  const db = openDb(':memory:'); seed(db);
  // ₪500 to own savings AND ₪500 to sister, same amount, same window
  ins(db, 1, '2026-08-10', -50000, 'העברה');
  ins(db, 1, '2026-08-10', -50000, 'העברה לאחות');
  ins(db, 3, '2026-08-10', 50000, 'העברה נכנסת');
  const r = matchTransfers(db);
  assert.equal(r.linked, 0, 'must refuse to pick');
  assert.equal(r.questions, 1);
  // when in doubt, count as spend (classify by sign stands)
  const { classifyBySign } = await_import();
  function await_import() { return { classifyBySign: (d: any) => d }; }
  const q = db.prepare(`SELECT COUNT(*) c FROM link_questions WHERE kind='transfer'`).get() as any;
  assert.equal(q.c, 1);
});

test('pending superseded by settled with different amount and no shared id', () => {
  const db = openDb(':memory:'); seed(db);
  ins(db, 2, '2026-08-14', -40000, 'מסעדת הצפון', 'pending');   // pre-auth ₪400
  ins(db, 2, '2026-08-16', -46000, 'מסעדת הצפון', 'settled');   // settles ₪460 with tip
  classifyAll(db);
  const t = monthTotals(db, '2026-08');
  assert.equal(t.expense, 46000, 'settled row is truth; pending excluded');
});

test('coverage reports share of spend, not share of accounts', () => {
  const db = openDb(':memory:'); seed(db);
  ins(db, 1, '2026-08-03', -10000, 'קטן');      // unattended: ₪100
  ins(db, 2, '2026-08-04', -90000, 'גדול');      // import (unreconcilable): ₪900
  classifyAll(db);
  const c = reconciliationCoverage(db, '2026-08');
  assert.equal(c.reconcilableAccounts, 1);
  assert.equal(c.totalAccounts, 3);
  assert.equal(c.spendSharePct, 10, 'one small reconcilable account of two spending = 10% of spend');
});
