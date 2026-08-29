import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDb } from '../src/lib/db.ts';
import { importBuffer } from '../src/lib/ingest.ts';
import { mapBankCategory } from '../src/lib/bankcat.ts';

test('Max category labels map to Kupa categories', () => {
  assert.equal(mapBankCategory('מסעדות, קפה וברים'), 'מסעדות');
  assert.equal(mapBankCategory('מזון וצריכה'), 'מזון');
  assert.equal(mapBankCategory('תחבורה ורכבים'), 'תחבורה');
  assert.equal(mapBankCategory('שונות'), 'אחר');
  assert.equal(mapBankCategory('unknown label'), null);
  assert.equal(mapBankCategory(undefined), null);
});

test('importing a labeled .xlsx auto-categorizes without any manual step', () => {
  const db = openDb(':memory:');
  db.prepare(`INSERT INTO accounts(id,name,institution,kind) VALUES(1,'מקס','max','card')`).run();
  const buf = readFileSync(new URL('./fixtures/max-demo.xlsx', import.meta.url));
  importBuffer(db, 1, 'max-demo.xlsx', buf);
  const rows = db.prepare(`SELECT raw_descriptor, category FROM transactions ORDER BY id`).all() as any[];
  const shufersal = rows.find(r => r.raw_descriptor.includes('שופרסל'));
  assert.equal(shufersal.category, 'מזון', 'grocery row categorized from bank label at import');
  const uncategorized = db.prepare(`SELECT COUNT(*) c FROM transactions WHERE category IS NULL`).get() as any;
  assert.equal(uncategorized.c, 0, 'every labeled row got a category');
});
