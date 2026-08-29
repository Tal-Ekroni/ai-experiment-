import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyMerchant } from '../src/lib/merchants.ts';

test('common Israeli merchants classify offline, no user, no LLM', () => {
  const cases: [string, string][] = [
    ['שופרסל דיל רמת גן', 'מזון'], ['רמי לוי שיווק השקמה', 'מזון'], ['יוחננוף', 'מזון'],
    ['סונול תל אביב', 'רכב'], ['פז ילין', 'רכב'], ['דור אלון', 'רכב'], ['חניון סלופארק', 'רכב'],
    ['Wolt', 'מסעדות'], ['וולט משלוחים', 'מסעדות'], ['ארומה אספרסו בר', 'מסעדות'], ['קופיקס', 'מסעדות'],
    ['סופר פארם', 'בריאות'], ['מכבי שירותי בריאות', 'בריאות'],
    ['רב קו', 'תחבורה'], ['GETT', 'תחבורה'], ['רכבת ישראל', 'תחבורה'],
    ['חברת החשמל', 'חשבונות'], ['סלקום', 'חשבונות'], ['עיריית רמת גן', 'חשבונות'], ['הראל ביטוח', 'חשבונות'],
    ['NETFLIX.COM', 'שירותים'], ['Spotify', 'שירותים'], ['ביט העברה', 'שירותים'],
    ['ZARA', 'קניות'], ['IKEA', 'קניות'], ['קסטרו', 'קניות'],
    ['שכר דירה', 'דיור'],
    ['רמי לוי תקשורת', 'חשבונות'],   // specificity: telecom beats grocery
  ];
  let hit = 0;
  for (const [desc, want] of cases) {
    const got = classifyMerchant(desc);
    assert.equal(got, want, `${desc} → ${got} (want ${want})`);
    if (got) hit++;
  }
  assert.equal(hit, cases.length, 'all sampled merchants classified');
});

test('unknown merchant returns null (falls through to queue/LLM)', () => {
  assert.equal(classifyMerchant('חנות מקומית לא מוכרת xyz'), null);
});
