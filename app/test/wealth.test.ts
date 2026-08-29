import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/lib/db.ts';
import { upsertItem, deleteItem, netWorth, netWorthHistory, freeCashFlow } from '../src/lib/wealth.ts';

test('net worth = assets - liabilities', () => {
  const db = openDb(':memory:');
  upsertItem(db, { name: 'עו״ש', kind: 'asset', category: 'cash', balance: 5_000_00 });
  upsertItem(db, { name: 'קרן', kind: 'asset', category: 'keren', balance: 80_000_00 });
  upsertItem(db, { name: 'משכנתא', kind: 'liability', category: 'mortgage', balance: 900_000_00 });
  const nw = netWorth(db);
  assert.equal(nw.assets, 85_000_00);
  assert.equal(nw.liabilities, 900_000_00);
  assert.equal(nw.net, 85_000_00 - 900_000_00);   // negative — honest
});

test('editing a balance updates net worth and records history for this month', () => {
  const db = openDb(':memory:');
  const id = upsertItem(db, { name: 'broker', kind: 'asset', category: 'broker', balance: 10_000_00 });
  upsertItem(db, { id, name: 'broker', kind: 'asset', category: 'broker', balance: 12_000_00 });
  assert.equal(netWorth(db).net, 12_000_00);
  const hist = netWorthHistory(db, 12);
  assert.ok(hist.length >= 1);
  assert.equal(hist[hist.length - 1].net, 12_000_00);
});

test('delete removes item and its history', () => {
  const db = openDb(':memory:');
  const id = upsertItem(db, { name: 'x', kind: 'asset', category: 'cash', balance: 100 });
  deleteItem(db, id);
  assert.equal(netWorth(db).net, 0);
  assert.equal(netWorthHistory(db, 12).length, 0);
});

test('free cash flow = income - expense per month, from the ledger', () => {
  const db = openDb(':memory:');
  db.prepare(`INSERT INTO accounts(id,name,institution,kind) VALUES(1,'x','y','bank')`).run();
  db.prepare(`INSERT INTO transactions(account_id,booking_date,value_date,amount,raw_descriptor,flow_class) VALUES(1,'2026-05-01','2026-05-01',2000000,'salary','income')`).run();
  db.prepare(`INSERT INTO transactions(account_id,booking_date,value_date,amount,raw_descriptor,flow_class) VALUES(1,'2026-05-10','2026-05-10',-1400000,'rent','expense')`).run();
  const fcf = freeCashFlow(db, 6).find(x => x.month === '2026-05')!;
  assert.equal(fcf.income, 2000000);
  assert.equal(fcf.expense, 1400000);
  assert.equal(fcf.net, 600000);   // kept 6,000
});

test('internal transfers never touch free cash flow', () => {
  const db = openDb(':memory:');
  db.prepare(`INSERT INTO accounts(id,name,institution,kind) VALUES(1,'x','y','bank')`).run();
  db.prepare(`INSERT INTO transactions(account_id,booking_date,value_date,amount,raw_descriptor,flow_class) VALUES(1,'2026-05-01','2026-05-01',2000000,'salary','income')`).run();
  db.prepare(`INSERT INTO transactions(account_id,booking_date,value_date,amount,raw_descriptor,flow_class) VALUES(1,'2026-05-05','2026-05-05',-500000,'to savings','internal')`).run();
  const fcf = freeCashFlow(db, 6).find(x => x.month === '2026-05')!;
  assert.equal(fcf.net, 2000000);   // the internal move is excluded
});
