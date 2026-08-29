/**
 * §2.1 — file ingestion that survives real Israeli bank exports.
 * No third-party parser ever touches hostile input.
 */
import { parseAmount, type Agorot } from './money.ts';

export interface ParsedRow { date: string; amount: Agorot; descriptor: string }
export interface ParseResult {
  rows: ParsedRow[];
  headers: string[];
  raw: string[][];
  detectedMapping: Mapping | null;
}
export interface Mapping { date: number; amount: number; descriptor: number; signFlip: boolean }

/** Decode hostile bytes: UTF-8 first; if replacement chars appear, windows-1255. */
export function decodeUpload(buf: Buffer): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  const bad = (utf8.match(/�/g) ?? []).length;
  if (bad === 0) return utf8;
  try {
    const he = new TextDecoder('windows-1255', { fatal: false }).decode(buf);
    const heBad = (he.match(/�/g) ?? []).length;
    return heBad < bad ? he : utf8;
  } catch { return utf8; }
}

/** Content sniff: an ".xls" that is really an HTML table (Leumi's specialty). */
export function looksLikeHtml(text: string): boolean {
  return /^\s*</.test(text) && /<table|<tr|<html/i.test(text);
}

/** Bounded tag scanner — extracts table rows without an HTML parser. */
export function htmlTableRows(text: string): string[][] {
  const rows: string[][] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(text)) !== null) {
    const cells: string[] = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let td: RegExpExecArray | null;
    while ((td = tdRe.exec(tr[1])) !== null) {
      cells.push(td[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim());
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

/** Hand-rolled RFC-4180 CSV. Handles quotes, embedded commas/newlines, CRLF. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQ = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"' && field === '') inQ = true;   // בע"מ: a quote mid-field is literal
    else if (ch === '"') field += ch;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(c => c.trim() !== '')) rows.push(row); }
  return rows;
}

const DATE_RES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(\d{4})-(\d{2})-(\d{2})$/, m => `${m[1]}-${m[2]}-${m[3]}`],
  [/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/, m => `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`],
  [/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2})$/, m => `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`],
];
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  for (const [re, fn] of DATE_RES) { const m = s.match(re); if (m) return fn(m); }
  return null;
}

function isAmount(s: string): boolean {
  try { parseAmount(s); return true; } catch { return false; }
}

/**
 * Auto-detect the column mapping: skip junk header rows (Max puts three), find the
 * column where most cells parse as dates, ditto amounts; descriptor is the widest
 * remaining text column. Sign convention detected from the data: if >70% of amounts
 * are positive in a file that is clearly card spending, flip.
 */
export function detectMapping(raw: string[][]): { mapping: Mapping; dataStart: number } | null {
  for (let start = 0; start < Math.min(raw.length, 6); start++) {
    const sample = raw.slice(start, start + 20).filter(r => r.length >= 2);
    if (sample.length < 2) continue;
    const width = Math.max(...sample.map(r => r.length));
    const score = (fn: (c: string) => boolean) =>
      Array.from({ length: width }, (_, col) =>
        sample.filter(r => r[col] !== undefined && fn(r[col])).length);
    const dateScores = score(c => parseDate(c) !== null);
    const amtScores = score(isAmount);
    const dateCol = dateScores.indexOf(Math.max(...dateScores));
    if (dateScores[dateCol] < sample.length * 0.7) continue;
    // amount column: best numeric column that is NOT the date column
    let amtCol = -1, best = 0;
    for (let c = 0; c < width; c++) {
      if (c === dateCol) continue;
      if (amtScores[c] > best) { best = amtScores[c]; amtCol = c; }
    }
    if (amtCol === -1 || best < sample.length * 0.7) continue;
    // descriptor: longest average text among the rest
    let descCol = -1, bestLen = 0;
    for (let c = 0; c < width; c++) {
      if (c === dateCol || c === amtCol) continue;
      const avg = sample.reduce((s, r) => s + (r[c]?.replace(/[\d.,-]/g, '').length ?? 0), 0) / sample.length;
      if (avg > bestLen) { bestLen = avg; descCol = c; }
    }
    if (descCol === -1) continue;
    const amounts = sample.map(r => { try { return parseAmount(r[amtCol]); } catch { return 0; } });
    const posShare = amounts.filter(a => a > 0).length / amounts.length;
    return { mapping: { date: dateCol, amount: amtCol, descriptor: descCol, signFlip: posShare > 0.7 }, dataStart: start };
  }
  return null;
}

/** Full pipeline: bytes → rows. Returns raw grid too, for the column-mapping screen. */
export function parseUpload(buf: Buffer): ParseResult {
  const text = decodeUpload(buf);
  const raw = looksLikeHtml(text) ? htmlTableRows(text) : csvRows(text);
  const det = detectMapping(raw);
  if (!det) return { rows: [], headers: raw[0] ?? [], raw, detectedMapping: null };
  return { rows: applyMapping(raw, det.mapping, det.dataStart), headers: raw[0] ?? [], raw, detectedMapping: det.mapping };
}

export function applyMapping(raw: string[][], m: Mapping, dataStart = 0): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (const r of raw.slice(dataStart)) {
    const date = parseDate(r[m.date] ?? '');
    if (!date) continue;
    let amount: Agorot;
    try { amount = parseAmount(r[m.amount] ?? ''); } catch { continue; }
    if (m.signFlip) amount = -amount;
    const descriptor = (r[m.descriptor] ?? '').trim();
    if (!descriptor) continue;
    out.push({ date, amount, descriptor });
  }
  return out;
}
