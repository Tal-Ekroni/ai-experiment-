/**
 * Bundled Israeli-merchant classifier: descriptor substring → Kupa category.
 * Deterministic, offline, free, no user input. Runs after bank-category and rules,
 * before the LLM — so a file with no category column still auto-categorizes.
 * Order matters: more specific patterns first (first match wins).
 */
import type { Category } from './db.ts';

type Rule = [RegExp, Category];

// Specific overrides first (a telecom "רמי לוי תקשורת" must beat grocery "רמי לוי").
const RULES: Rule[] = [
  // telecom / bills — specific brand+word combos before the plain grocery brand
  [/רמי לוי.*תקשורת|תקשורת.*רמי לוי/, 'חשבונות'],
  [/סלקום|פרטנר|פלאפון|בזק|hot\b|הוט|yes\b|יס\s|גולן טלקום|019|012|רמי לוי תקשורת|we4g|רימון/i, 'חשבונות'],
  [/חברת החשמל|חשמל.*גז|מקורות|תאגיד המים|מי אביבים|מיתב|הגיחון|מים וביוב|ארנונה|עיריי|עירית|מועצה מקומית|רשות המים|משרד ה|ביטוח לאומי|מס הכנסה/, 'חשבונות'],
  [/ביטוח|הראל|כלל ביטוח|מגדל|מנורה|הפניקס|איילון|הכשרה|AIG|ביטוח ישיר|פוליסה/i, 'חשבונות'],
  // groceries — plus generic 'סופר …' (but not סופר פארם / סופר תיירות, handled elsewhere first)
  [/שופרסל|רמי לוי|ויקטורי|יוחננוף|טיב טעם|אושר עד|יינות ביתן|מגה בעיר|am:?pm|סופר יודה|קינג סטור|זול ובגדול|מחסני השוק|סופרמרקט|חצי חינם|שוק העיר|יש חסד|קופיקס מרקט|מרכול|כלבו|מעדני|פיצוצי|ירקן|מאפיית|קצביי|דליקטס|בקרי|סופר(?! ?פארם)(?! תיירות)/i, 'מזון'],
  // fuel + car
  [/סונול|(?<![א-ת])פז(?![א-ת])|דלק|דור אלון|ten\b|(?<![א-ת])טן(?![א-ת])|סד"?ש|דלקן|paz|delek|כביש 6|דרכים|חניון|park|פנגו|pango|סלופארק|cellopark|טסט|מוסך|צמיגים|טיב מוטורס|צ'מפיון מוטורס/i, 'רכב'],
  // restaurants / cafe / delivery
  [/wolt|וולט|מקדונלד|בורגר|burger|קפה|ארומה|aroma|cofix|קופיקס|גולדה|לנדוור|מסעד|פיצה|pizza|דומינו|קנטינה|ביסטרו|(?<![א-ת])בר(?![א-ת])|פאב|starbucks|רולדין|גרג|מאפה|נמנם|תמר|שגב|מזללה/i, 'מסעדות'],
  // transport (public + rideshare)
  [/רב\s?קו|רכבת|רכבת ישראל|gett|(?<![א-ת])גט(?![א-ת])|יאנגו|yango|uber|אגד|(?<![א-ת])דן(?![א-ת])|מטרופולין|קווים|מונית|taxi|נתיבי איילון|רב-קו/i, 'תחבורה'],
  // health / pharmacy
  [/סופר\s?פארם|super\s?pharm|be\b|גוד פארם|ניו פארם|כללית|מכבי|מאוחדת|לאומית|קופת חולים|בית מרקחת|מרפאה|רופא|שיניים|אופטיק|אופטיקנה|טרימר/i, 'בריאות'],
  // travel
  [/booking|בוקינג|airbnb|el\s?al|אל על| el-al|ryanair|wizz|טיסה|מלון|hotel|נופש|isrotel|fattal|דן מלונות|רכבל|נתב"?ג|טיולי/i, 'נסיעות'],
  // digital services / subscriptions
  [/google|apple\.com|itunes|microsoft|netflix|נטפליקס|spotify|amazon|aws|paypal|פייפאל|(?<![א-ת])ביט(?![א-ת])|\bbit\b|paybox|פייבוקס|openai|anthropic|github|adobe|dropbox|icloud|youtube|disney|hbo|קורסרה/i, 'שירותים'],
  // shopping / fashion / home
  [/zara|זארה|castro|קסטרו|\bfox\b|פוקס|terminal\s?x|טרמינל|ikea|איקאה|\bace\b|הום סנטר|home center|מקס סטוק|max stock|רנואר|renuar|golf|גולף|American eagle|h&m|תיק|נעל|בגד|אופנה|delta|דלתא|זר פרחים|ניקול/i, 'קניות'],
  // kids
  [/גן ילדים|בית ספר|צהרון|חוג|מעון|קייטנה|תלמוד תורה|מתנ"?ס|ליצן|יולדות/i, 'ילדים'],
  // leisure / entertainment / sport
  [/סינמה|cinema|יס פלנט|רב חן|הולמס|holmes|חדר כושר|holmesplace|גימבורי|לונה|ספורט|decathlon|דקטלון|בריכה|מנוי|תיאטרון|הופעה|כרטיס|טיקט|ticket|בילוי/i, 'פנאי'],
  // housing
  [/שכר דירה|שכירות|ועד בית|משכנתא|נדל"?ן|מתווך|דירה|arnona/i, 'דיור'],
];

export function classifyMerchant(descriptor: string): Category | null {
  const s = descriptor.trim();
  for (const [re, cat] of RULES) if (re.test(s)) return cat;
  return null;
}
