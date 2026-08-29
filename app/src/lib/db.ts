import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const CATEGORIES = [
  'דיור', 'מזון', 'מסעדות', 'תחבורה', 'רכב', 'חשבונות', 'בריאות',
  'ילדים', 'קניות', 'פנאי', 'נסיעות', 'שירותים', 'אחר',
] as const;
export type Category = (typeof CATEGORIES)[number];
export const OTHER: Category = 'אחר';

export type FlowClass = 'expense' | 'income' | 'internal';

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      institution TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('bank','card')),
      sync_mode TEXT NOT NULL DEFAULT 'import' CHECK (sync_mode IN ('unattended','assisted','import')),
      currency TEXT NOT NULL DEFAULT 'ILS',
      synced_through TEXT,
      window_days INTEGER,
      settles_from INTEGER REFERENCES accounts(id)
    );
    CREATE TABLE IF NOT EXISTS merchants (
      id INTEGER PRIMARY KEY,
      normalized TEXT NOT NULL UNIQUE,
      display TEXT NOT NULL,
      default_category TEXT NOT NULL,
      confirmed INTEGER NOT NULL DEFAULT 0,
      tx_count INTEGER NOT NULL DEFAULT 0,
      volume INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      booking_date TEXT NOT NULL,
      value_date TEXT NOT NULL,
      amount INTEGER NOT NULL,
      raw_descriptor TEXT NOT NULL,
      merchant_id INTEGER REFERENCES merchants(id),
      category TEXT,
      category_confirmed INTEGER NOT NULL DEFAULT 0,
      flow_class TEXT NOT NULL DEFAULT 'expense' CHECK (flow_class IN ('expense','income','internal')),
      link_id TEXT,
      status TEXT NOT NULL DEFAULT 'settled' CHECK (status IN ('pending','settled','superseded')),
      external_id TEXT,
      original_amount INTEGER,
      original_currency TEXT,
      import_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS tx_by_date ON transactions(booking_date);
    CREATE INDEX IF NOT EXISTS tx_by_acct ON transactions(account_id, value_date);
    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY,
      pattern TEXT NOT NULL,
      category TEXT NOT NULL,
      min_amount INTEGER,
      max_amount INTEGER,
      merchant_id INTEGER REFERENCES merchants(id)
    );
    CREATE TABLE IF NOT EXISTS statements (
      id INTEGER PRIMARY KEY,
      card_account_id INTEGER NOT NULL REFERENCES accounts(id),
      total INTEGER NOT NULL,
      charge_date TEXT NOT NULL,
      matched_tx_id INTEGER REFERENCES transactions(id)
    );
    CREATE TABLE IF NOT EXISTS balance_snapshots (
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      date TEXT NOT NULL,
      balance INTEGER NOT NULL,
      PRIMARY KEY (account_id, date)
    );
    CREATE TABLE IF NOT EXISTS link_questions (
      id INTEGER PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('transfer','settlement','supersede')),
      tx_ids TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY,
      account_id INTEGER REFERENCES accounts(id),
      filename TEXT NOT NULL,
      sha256 TEXT NOT NULL UNIQUE,
      rows INTEGER NOT NULL,
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS import_mappings (
      institution TEXT PRIMARY KEY,
      mapping_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS months (
      month TEXT PRIMARY KEY,
      totals_json TEXT,
      coverage_json TEXT,
      restated INTEGER NOT NULL DEFAULT 0,
      closed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS job_runs (
      id INTEGER PRIMARY KEY,
      job TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      ok INTEGER,
      detail TEXT
    );
    CREATE TABLE IF NOT EXISTS wealth_items (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('asset','liability')),
      category TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      sort INTEGER NOT NULL DEFAULT 0,
      apr REAL,
      term_months INTEGER
    );
    CREATE TABLE IF NOT EXISTS wealth_history (
      item_id INTEGER NOT NULL REFERENCES wealth_items(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      balance INTEGER NOT NULL,
      PRIMARY KEY (item_id, month)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  // migrate older wealth_items that predate loan fields
  for (const col of ['apr REAL', 'term_months INTEGER']) {
    try { db.exec(`ALTER TABLE wealth_items ADD COLUMN ${col}`); } catch { /* already there */ }
  }
  return db;
}

export function getSetting(db: DatabaseSync, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}
export function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}
