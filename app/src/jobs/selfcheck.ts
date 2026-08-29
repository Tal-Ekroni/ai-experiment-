/** §9.1 — one nightly self-check; results surface on /health and lead the digest at 'broken' tier. */
import type { DatabaseSync } from 'node:sqlite';
import { statfsSync } from 'node:fs';

export interface Check { name: string; ok: boolean; detail: string }

export function runSelfCheck(db: DatabaseSync, dbPath: string): Check[] {
  const checks: Check[] = [];
  try {
    const r = db.prepare('PRAGMA integrity_check').get() as any;
    checks.push({ name: 'שלמות בסיס הנתונים', ok: r.integrity_check === 'ok', detail: String(r.integrity_check) });
  } catch (e) { checks.push({ name: 'שלמות בסיס הנתונים', ok: false, detail: String(e) }); }
  try {
    if (dbPath !== ':memory:') {
      const s = statfsSync('.');
      const freeGb = (s.bavail * s.bsize) / 1e9;
      checks.push({ name: 'מקום פנוי בדיסק', ok: freeGb > 0.5, detail: `${freeGb.toFixed(1)}GB` });
    }
  } catch { /* container without statfs */ }
  const stale = db.prepare(`SELECT name, synced_through FROM accounts
    WHERE synced_through IS NOT NULL AND julianday('now') - julianday(synced_through) > 45`).all() as any[];
  checks.push({
    name: 'טריות נתונים', ok: stale.length === 0,
    detail: stale.length === 0 ? 'כל החשבונות עדכניים' : stale.map(a => `${a.name}: ${a.synced_through}`).join(', '),
  });
  return checks;
}
