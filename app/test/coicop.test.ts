import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coicopGroups, leafCode, LEAF_COICOP } from '../src/lib/coicop.ts';
import { CATEGORIES } from '../src/lib/db.ts';

test('every leaf category has a COICOP code', () => {
  for (const c of CATEGORIES) assert.ok((LEAF_COICOP as any)[c], `${c} has no COICOP mapping`);
  assert.equal(leafCode('רכב'), '07.2');
});

test('transport leaves roll up under one division', () => {
  const groups = coicopGroups([
    { category: 'תחבורה', total: 300 }, { category: 'רכב', total: 700 }, { category: 'מזון', total: 500 },
  ]);
  const transport = groups.find(g => g.division.code === '07')!;
  assert.equal(transport.total, 1000);            // 300 + 700 under division 07
  assert.equal(transport.leaves.length, 2);
  assert.equal(groups[0].division.code, '07');    // sorted: biggest division first
});
