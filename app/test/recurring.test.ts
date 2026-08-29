import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/lib/db.ts';
import { detectRecurring, recurringTotal, committedVsFree } from '../src/lib/recurring.ts';

function db() {
  const d = openDb(':memory:');
  d.prepare(`INSERT INTO accounts(id,name,institution,kind) VALUES(1,'x','y','bank')`).run();
  return d;
}
let mid = 0;
function merch(d: any, name: string) {
  mid++; d.prepare(`INSERT INTO merchants(id,normalized,display,default_category) VALUES(?,?,?,?)`).run(mid, name, name, 'שירותים');
  return mid;
}
function tx(d: any, m: number, date: string, agorot: number, cat='שירותים') {
  d.prepare(`INSERT INTO transactions(account_id,booking_date,value_date,amount,raw_descriptor,merchant_id,category,flow_class) VALUES(1,?,?,?,?,?,?, 'expense')`)
    .run(date, date, -agorot, 'x', m, cat);
}

test('a stable monthly subscription is detected with correct monthly cost', () => {
  const d = db(); const m = merch(d, 'נטפליקס');
  tx(d, m, '2026-01-05', 5500); tx(d, m, '2026-02-05', 5500); tx(d, m, '2026-03-05', 5500); tx(d, m, '2026-04-05', 5500);
  const r = detectRecurring(d);
  assert.equal(r.length, 1);
  assert.equal(r[0].cadence, 'monthly');
  assert.equal(r[0].monthly, 5500);
  assert.equal(r[0].nextDate, '2026-05-06');  // last + median gap (31d)
  assert.equal(r[0].stable, true);
});

test('a yearly charge is normalized to a monthly-equivalent', () => {
  const d = db(); const m = merch(d, 'ביטוח');
  tx(d, m, '2024-06-01', 120000); tx(d, m, '2025-06-01', 120000); tx(d, m, '2026-06-01', 120000);
  const r = detectRecurring(d);
  assert.equal(r[0].cadence, 'yearly');
  assert.equal(r[0].monthly, 10000);   // 1200/yr → 100/mo
});

test('one-off purchases are NOT flagged as recurring', () => {
  const d = db(); const m = merch(d, 'חנות');
  tx(d, m, '2026-01-01', 20000); tx(d, m, '2026-01-02', 5000);   // 2 random
  assert.equal(detectRecurring(d).length, 0);
});

test('highly variable same-merchant spend is not a subscription', () => {
  const d = db(); const m = merch(d, 'סופר');
  tx(d, m, '2026-01-03', 12000); tx(d, m, '2026-02-03', 48000); tx(d, m, '2026-03-03', 6000); tx(d, m, '2026-04-03', 90000);
  assert.equal(detectRecurring(d).length, 0);   // monthly cadence but CV too high
});

test('a price increase is flagged', () => {
  const d = db(); const m = merch(d, 'ספוטיפיי');
  tx(d, m, '2026-01-10', 2000); tx(d, m, '2026-02-10', 2000); tx(d, m, '2026-03-10', 2000); tx(d, m, '2026-04-10', 2600);
  const r = detectRecurring(d);
  assert.equal(r[0].rose, true);
});

test('total sums the monthly-equivalents', () => {
  const d = db();
  const a = merch(d,'a'); [1,2,3,4].forEach(i=>tx(d,a,`2026-0${i}-01`,5000));
  const b = merch(d,'b'); [1,2,3,4].forEach(i=>tx(d,b,`2026-0${i}-15`,3000));
  const t = recurringTotal(detectRecurring(d));
  assert.equal(t.count, 2); assert.equal(t.monthly, 8000);
});

test('committed vs free splits monthly spend', () => {
  const d = db();
  const sub = merch(d, 'נטפליקס');
  ['2026-01-05','2026-02-05','2026-03-05','2026-04-05'].forEach(dt => tx(d, sub, dt, 10000)); // ₪100/mo sub
  const shop = merch(d, 'קניה');
  ['2026-01-20','2026-02-20','2026-03-20','2026-04-20'].forEach(dt => tx(d, shop, dt, 40000, 'מזון')); // wait — same merchant 4x monthly stable = also recurring!
  const c = committedVsFree(d);
  // both are stable monthly here; committed = both = 50000, discretionary 0. Assert the split adds up.
  assert.equal(c.monthlySpend, 50000);
  assert.equal(c.committed + c.discretionary, c.monthlySpend);
  assert.equal(c.committedPct, Math.round(c.committed / c.monthlySpend * 100));
});
