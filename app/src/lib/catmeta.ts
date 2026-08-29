/** Category identity: one icon + one hue per category, so the app is scannable by shape & color.
 *  Hue drives a theme-aware tint via CSS (hsl(var(--h) …)); the emoji carries its own color. */
export interface CatMeta { icon: string; h: number }
export const CAT_META: Record<string, CatMeta> = {
  'דיור':   { icon: '🏠', h: 255 },
  'מזון':   { icon: '🛒', h: 142 },
  'מסעדות': { icon: '🍽️', h: 22 },
  'תחבורה': { icon: '🚌', h: 212 },
  'רכב':    { icon: '🚗', h: 200 },
  'חשבונות':{ icon: '🧾', h: 282 },
  'בריאות': { icon: '💊', h: 334 },
  'ילדים':  { icon: '🧸', h: 38 },
  'קניות':  { icon: '🛍️', h: 315 },
  'פנאי':   { icon: '🎬', h: 265 },
  'נסיעות': { icon: '✈️', h: 190 },
  'שירותים':{ icon: '💳', h: 168 },
  'אחר':    { icon: '📦', h: 220 },
};
export function catMeta(cat: string | null | undefined): CatMeta {
  return (cat && CAT_META[cat]) || { icon: '•', h: 220 };
}
