/** File import → ledger, idempotent by SHA-256 (§2.1, stage-3 architecture). */
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { parseUpload, applyMapping, type Mapping, type ParsedRow } from './parse.ts';
import { upsertMerchant } from './categorize.ts';
import { mapBankCategory } from './bankcat.ts';
import { classifyAll } from './ledger.ts';

export function importBuffer(db: DatabaseSync, accountId: number, filename: string, buf: Buffer, mapping?: Mapping) {
  const sha = createHash('sha256').update(buf).digest('hex');
  const dup = db.prepare(`SELECT id FROM imports WHERE sha256 = ?`).get(sha);
  if (dup) return { duplicate: true as const, rows: 0 };
  const parsed = parseUpload(buf);
  const rows: ParsedRow[] = mapping ? applyMapping(parsed.raw, mapping) : parsed.rows;
  if (rows.length === 0) return { duplicate: false as const, rows: 0, needsMapping: true as const, raw: parsed.raw };
  const imp = db.prepare(`INSERT INTO imports(account_id, filename, sha256, rows) VALUES(?,?,?,?)`)
    .run(accountId, filename, sha, rows.length);
  const insert = db.prepare(`INSERT INTO transactions(account_id, booking_date, value_date, amount, raw_descriptor, merchant_id, import_id)
    VALUES(?,?,?,?,?,?,?)`);
  for (const r of rows) {
    const mid = upsertMerchant(db, r.descriptor, r.amount);
    const txId = insert.run(accountId, r.date, r.date, r.amount, r.descriptor, mid, Number(imp.lastInsertRowid)).lastInsertRowid;
    // The bank already categorized this row — use it (attributed, not household-confirmed).
    const bankCat = mapBankCategory(r.bankCategory);
    if (bankCat) {
      db.prepare(`UPDATE transactions SET category = ? WHERE id = ?`).run(bankCat, Number(txId));
      db.prepare(`UPDATE merchants SET default_category = ? WHERE id = ? AND confirmed = 0`).run(bankCat, mid);
    }
  }
  db.prepare(`UPDATE accounts SET synced_through = (SELECT MAX(booking_date) FROM transactions WHERE account_id = ?) WHERE id = ?`)
    .run(accountId, accountId);
  classifyAll(db);
  return { duplicate: false as const, rows: rows.length };
}
