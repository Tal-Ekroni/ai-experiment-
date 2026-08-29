import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseUpload, decodeUpload, looksLikeHtml, parseDate } from '../src/lib/parse.ts';

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url));

test('Leumi .xls that is HTML, windows-1255: sniffed, decoded, parsed', () => {
  const buf = fx('leumi.xls');
  const text = decodeUpload(buf);
  assert.ok(looksLikeHtml(text));
  assert.ok(text.includes('שופרסל'), 'Hebrew must survive cp1255 decode');
  const res = parseUpload(buf);
  assert.equal(res.rows.length, 3);
  assert.deepEqual(res.rows[0], { date: '2026-08-15', amount: -32050, descriptor: 'שופרסל דיל רמת גן' });
  assert.equal(res.rows[2].amount, 1850000, 'salary positive, ₪18,500');
  assert.equal(res.detectedMapping?.signFlip, false, 'mixed signs must not flip');
});

test('Isracard CSV: BOM, junk rows above data, positive-sign expenses flipped', () => {
  const res = parseUpload(fx('isracard.csv'));
  assert.equal(res.rows.length, 3);
  assert.equal(res.detectedMapping?.signFlip, true, 'all-positive card file → expenses');
  assert.deepEqual(res.rows[0], { date: '2026-08-02', amount: -41290, descriptor: 'רמי לוי שיווק' });
});

test('dates: dd/mm/yyyy, dd.mm.yy, ISO', () => {
  assert.equal(parseDate('15/08/2026'), '2026-08-15');
  assert.equal(parseDate('5.8.26'), '2026-08-05');
  assert.equal(parseDate('2026-08-15'), '2026-08-15');
  assert.equal(parseDate('garbage'), null);
});

test('unparseable file returns raw grid for the column-mapping screen, never throws', () => {
  const res = parseUpload(Buffer.from('こんにちは\nnothing tabular here'));
  assert.equal(res.rows.length, 0);
  assert.equal(res.detectedMapping, null);
  assert.ok(Array.isArray(res.raw));
});

test('unescaped quote mid-field (בע"מ) stays literal and does not swallow rows', () => {
  const csv = 'תאריך,תיאור,סכום\n10/07/2025,ישראכרט בע"מ,-7002.89\n11/07/2025,שכר דירה,-6200.00';
  const res = parseUpload(Buffer.from(csv));
  assert.equal(res.rows.length, 2);
  assert.equal(res.rows[0].descriptor, 'ישראכרט בע"מ');
  assert.equal(res.rows[0].amount, -700289);
});
