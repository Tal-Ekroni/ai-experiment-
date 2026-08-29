/** Shared household passcode → HMAC cookie (§7). Constant-time compare, per-install secret. */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { getSetting, setSetting } from '../lib/db.ts';

export function ensureSecret(db: DatabaseSync): string {
  let s = getSetting(db, 'cookie_secret');
  if (!s) { s = randomBytes(32).toString('hex'); setSetting(db, 'cookie_secret', s); }
  return s;
}
export function setPasscode(db: DatabaseSync, passcode: string): void {
  const salt = randomBytes(16).toString('hex');
  const mac = createHmac('sha256', salt).update(passcode).digest('hex');
  setSetting(db, 'passcode', `${salt}:${mac}`);
}
export function checkPasscode(db: DatabaseSync, passcode: string): boolean {
  const stored = getSetting(db, 'passcode');
  if (!stored) return false;
  const [salt, mac] = stored.split(':');
  const got = createHmac('sha256', salt).update(passcode).digest('hex');
  return timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(got, 'hex'));
}
export function hasPasscode(db: DatabaseSync): boolean { return getSetting(db, 'passcode') !== null; }
export function makeSession(db: DatabaseSync): string {
  const secret = ensureSecret(db);
  const payload = `s:${Date.now()}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}:${sig}`;
}
export function checkSession(db: DatabaseSync, cookie: string | undefined): boolean {
  if (!cookie) return false;
  const m = /kupa=([^;]+)/.exec(cookie);
  if (!m) return false;
  const parts = m[1].split(':');
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}:${parts[1]}`;
  const expect = createHmac('sha256', ensureSecret(db)).update(payload).digest('hex');
  const a = Buffer.from(parts[2], 'utf8'), b = Buffer.from(expect, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
