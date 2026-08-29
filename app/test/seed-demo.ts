/** Generates a realistic 14-month Israeli household CSV pair (bank + card) for demo/red-team. */
import { writeFileSync } from 'node:fs';

const rnd = (() => { let s = 42; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const CARD = [
  ['שופרסל דיל רמת גן', 80, 450], ['רמי לוי שיווק השקמה', 120, 600], ['סונול תל אביב', 180, 350],
  ['מסעדת הצפון', 90, 320], ['וולט - משלוח', 60, 160], ['סופר פארם', 40, 220],
  ['ארומה קפה', 18, 42], ['צעצועי יובל', 50, 250], ['ח.י חשמל ומיזוג', 200, 900],
  ['ביט - העברה', 30, 200], ['נטפליקס', 55, 55], ['ספוטיפיי', 26, 26],
] as [string, number, number][];

const today = new Date('2026-08-25');
const bankRows: string[] = ['תאריך,תיאור,סכום'];
const cardRows: string[] = ['תאריך,שם בית עסק,סכום חיוב'];
let cardMonthTotals: Record<string, number> = {};

for (let d = new Date('2025-06-01'); d <= today; d.setDate(d.getDate() + 1)) {
  const iso = d.toISOString().slice(0, 10);
  const [y, m, day] = [iso.slice(0, 4), iso.slice(5, 7), Number(iso.slice(8))];
  const dmy = `${String(day).padStart(2, '0')}/${m}/${y}`;
  const monthKey = `${y}-${m}`;
  // salary on the 1st, rent on the 3rd, arnona every 2 months
  if (day === 1) bankRows.push(`${dmy},משכורת חודשית,21500.00`);
  if (day === 1) bankRows.push(`${dmy},משכורת בן/בת זוג,9800.00`);
  if (day === 3) bankRows.push(`${dmy},שכר דירה,-6200.00`);
  if (day === 5 && Number(m) % 2 === 0) bankRows.push(`${dmy},עיריית רמת גן ארנונה,-1240.00`);
  if (day === 12) bankRows.push(`${dmy},חברת החשמל,-${(380 + rnd() * 320).toFixed(2)}`);
  if (day === 20) bankRows.push(`${dmy},העברה לחיסכון,-2000.00`);
  // card purchases, 1-3 a day, drifting upward: eating out grows ~2.5%/month
  const monthsIn = (d.getFullYear() - 2025) * 12 + d.getMonth() - 5;
  const drift = 1 + monthsIn * 0.025;
  const n = rnd() < 0.25 ? 0 : 1 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const [name, lo, hi] = pick(CARD);
    let amt = lo + rnd() * (hi - lo);
    if (name.includes('מסעד') || name.includes('וולט') || name.includes('ארומה')) amt *= drift;
    amt = Math.round(amt * 100) / 100;
    cardRows.push(`${dmy},${name},${amt.toFixed(2)}`);   // card export: positive = spend
    cardMonthTotals[monthKey] = (cardMonthTotals[monthKey] ?? 0) + amt;
  }
}
// the consolidated card debit lands bank-side on the 10th of the following month
for (const [mk, total] of Object.entries(cardMonthTotals)) {
  const [y, m] = mk.split('-').map(Number);
  const nd = new Date(Date.UTC(y, m, 10));
  if (nd > today) continue;
  const dmy = `10/${String(nd.getUTCMonth() + 1).padStart(2, '0')}/${nd.getUTCFullYear()}`;
  bankRows.push(`${dmy},ישראכרט בע"מ,-${total.toFixed(2)}`);
}
writeFileSync(new URL('./fixtures/demo-bank.csv', import.meta.url), bankRows.join('\r\n'));
writeFileSync(new URL('./fixtures/demo-card.csv', import.meta.url), cardRows.join('\r\n'));
console.log(`bank rows: ${bankRows.length - 1}, card rows: ${cardRows.length - 1}`);
console.log('card month totals:', Object.keys(cardMonthTotals).length, 'months');
