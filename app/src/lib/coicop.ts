/**
 * COICOP hierarchy (roadmap category-codes bet): the international standard taxonomy Israel's CBS
 * (הלמ"ס) uses for household spending. Our 13 leaf categories roll up to COICOP divisions, each
 * carrying its standard code. Non-breaking: leaves are unchanged; this is the organizing layer.
 */
import type { Category } from './db.ts';

export interface Division { code: string; label: string; h: number }

/** COICOP divisions we use (subset that maps to a household's real spending). */
export const DIVISIONS: Division[] = [
  { code: '01', label: 'מזון ומשקאות', h: 142 },
  { code: '04', label: 'דיור, מים וחשמל', h: 255 },
  { code: '05', label: 'בית וריהוט', h: 315 },
  { code: '06', label: 'בריאות', h: 334 },
  { code: '07', label: 'תחבורה', h: 212 },
  { code: '09', label: 'פנאי, תרבות ונופש', h: 265 },
  { code: '10', label: 'חינוך וילדים', h: 38 },
  { code: '11', label: 'מסעדות ובתי מלון', h: 22 },
  { code: '12', label: 'שירותים ושונות', h: 168 },
];

/** Each leaf category → its COICOP division + a specific class code. */
export const LEAF_COICOP: Record<Category, { div: string; code: string }> = {
  'מזון':    { div: '01', code: '01.1' },  // food & non-alcoholic beverages
  'דיור':    { div: '04', code: '04.1' },  // actual rentals / housing
  'חשבונות': { div: '04', code: '04.4' },  // water, electricity, gas & other utilities
  'קניות':   { div: '05', code: '05.1' },  // furnishings & household goods
  'בריאות':  { div: '06', code: '06.1' },  // health
  'תחבורה':  { div: '07', code: '07.3' },  // transport services
  'רכב':     { div: '07', code: '07.2' },  // operation of personal transport (fuel, upkeep)
  'פנאי':    { div: '09', code: '09.4' },  // recreational & cultural services
  'נסיעות':  { div: '09', code: '09.6' },  // package holidays
  'ילדים':   { div: '10', code: '10.0' },  // education
  'מסעדות':  { div: '11', code: '11.1' },  // catering / restaurants
  'שירותים': { div: '12', code: '12.6' },  // financial & other services
  'אחר':     { div: '12', code: '12.7' },  // miscellaneous
};

export function leafCode(cat: string): string {
  return (LEAF_COICOP as any)[cat]?.code ?? '—';
}

/** Group a leaf mix into COICOP divisions with subtotals + nested leaves, sorted by division total. */
export function coicopGroups(mix: { category: string; total: number }[]) {
  const byDiv = new Map<string, { division: Division; total: number; leaves: { category: string; total: number; code: string }[] }>();
  for (const row of mix) {
    const map = (LEAF_COICOP as any)[row.category];
    const divCode = map?.div ?? '12';
    const division = DIVISIONS.find(d => d.code === divCode)!;
    let g = byDiv.get(divCode);
    if (!g) { g = { division, total: 0, leaves: [] }; byDiv.set(divCode, g); }
    g.total += row.total;
    g.leaves.push({ category: row.category, total: row.total, code: map?.code ?? '—' });
  }
  return [...byDiv.values()].sort((a, b) => b.total - a.total)
    .map(g => ({ ...g, leaves: g.leaves.sort((a, b) => b.total - a.total) }));
}
