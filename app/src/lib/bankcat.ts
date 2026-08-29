/**
 * Map an Israeli bank/card export's own category label → Kupa's 13.
 * The bank already categorized every row; using it means the household confirms almost nothing.
 * Unknown labels return null (fall through to rules/LLM/queue).
 */
import type { Category } from './db.ts';

const MAP: Record<string, Category> = {
  // Max / Leumi-Card labels seen in real exports
  'מזון וצריכה': 'מזון',
  'מסעדות, קפה וברים': 'מסעדות',
  'תחבורה ורכבים': 'תחבורה',
  'דלק, חשמל וגז': 'רכב',
  'ביטוח': 'חשבונות',
  'עירייה וממשלה': 'חשבונות',
  'שירותי תקשורת': 'חשבונות',
  'רפואה ובתי מרקחת': 'בריאות',
  'אופנה': 'קניות',
  'עיצוב הבית': 'קניות',
  'חשמל ומחשבים': 'קניות',
  'פנאי, בידור וספורט': 'פנאי',
  'טיסות ותיירות': 'נסיעות',
  'העברת כספים': 'שירותים',
  'שונות': 'אחר',
  // common variants / other issuers
  'תחבורה': 'תחבורה', 'דלק': 'רכב', 'מזון': 'מזון', 'סופרמרקט': 'מזון',
  'מסעדות': 'מסעדות', 'בריאות': 'בריאות', 'ביגוד': 'קניות', 'בית': 'דיור',
  'חינוך': 'ילדים', 'ילדים': 'ילדים', 'תקשורת': 'חשבונות',
};

export function mapBankCategory(label: string | undefined): Category | null {
  if (!label) return null;
  const t = label.trim();
  return MAP[t] ?? null;
}
