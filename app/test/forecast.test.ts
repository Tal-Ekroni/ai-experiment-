import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/lib/db.ts';
import { forecast } from '../src/lib/retrospect.ts';

function db() {
  const d = openDb(':memory:');
  d.prepare(`INSERT INTO accounts(id,name,institution,kind) VALUES(1,'x','y','bank')`).run();
  return d;
}
const spend = (d: any, date: string, agorot: number, cat = 'מזון') =>
  d.prepare(`INSERT INTO transactions(account_id,booking_date,value_date,amount,raw_descriptor,category,flow_class)
             VALUES(1,?,?,?,?,?, 'expense')`).run(date, date, -agorot, 'x', cat);

test('projects run-rate and compares to trailing baseline', () => {
  const d = db();
  spend(d, '2026-06-10', 1_000_000);      // June total 10,000
  spend(d, '2026-07-10', 1_000_000);      // July total 10,000  → baseline 10,000
  spend(d, '2026-08-05', 300_000);        // Aug so far (by day 15): 6,000
  spend(d, '2026-08-12', 300_000);
  const f = forecast(d, new Date('2026-08-15T00:00:00Z'))!;
  assert.equal(f.baseline, 1_000_000);
  assert.equal(f.spentSoFar, 600_000);
  assert.equal(f.projected, Math.round(600_000 / 15 * 31));   // 1,240,000
  assert.equal(f.delta, f.projected - 1_000_000);             // +240,000 over normal
  assert.equal(f.confident, true);
});

test('baseline EXCLUDES the in-progress month (no self-reference)', () => {
  const d = db();
  spend(d, '2026-06-10', 900_000);
  spend(d, '2026-07-10', 1_100_000);
  spend(d, '2026-08-03', 500_000);
  const f = forecast(d, new Date('2026-08-10T00:00:00Z'))!;
  assert.equal(f.baseline, 1_000_000);   // mean(900k,1100k), NOT including Aug
});

test('early in the month it still computes but flags low confidence', () => {
  const d = db();
  spend(d, '2026-06-10', 1_000_000);
  spend(d, '2026-07-10', 1_000_000);
  spend(d, '2026-08-02', 200_000);
  const f = forecast(d, new Date('2026-08-03T00:00:00Z'))!;   // day 3
  assert.equal(f.confident, false);
});

test('stays silent (null) when it cannot speak honestly', () => {
  const d = db();
  // no current-month spend
  spend(d, '2026-06-10', 1_000_000);
  spend(d, '2026-07-10', 1_000_000);
  assert.equal(forecast(d, new Date('2026-08-15T00:00:00Z')), null);
  // only one prior month → no baseline
  const d2 = db();
  spend(d2, '2026-07-10', 1_000_000);
  spend(d2, '2026-08-05', 300_000);
  assert.equal(forecast(d2, new Date('2026-08-15T00:00:00Z')), null);
});

test('internal transfers never inflate the forecast', () => {
  const d = db();
  spend(d, '2026-06-10', 1_000_000);
  spend(d, '2026-07-10', 1_000_000);
  spend(d, '2026-08-05', 300_000);
  d.prepare(`INSERT INTO transactions(account_id,booking_date,value_date,amount,raw_descriptor,flow_class)
             VALUES(1,'2026-08-06','2026-08-06',-5000000,'transfer','internal')`).run();
  const f = forecast(d, new Date('2026-08-15T00:00:00Z'))!;
  assert.equal(f.spentSoFar, 300_000);   // the 50,000 internal move is excluded
});
