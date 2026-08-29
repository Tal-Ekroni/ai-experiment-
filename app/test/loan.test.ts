import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amortize, monthlyPayment } from '../src/lib/loan.ts';

test('standard 30-year mortgage payment matches the formula', () => {
  // ₪1,000,000 at 5% over 360 months → ~₪5,368.22/mo
  const pmt = monthlyPayment(100_000_000, 0.05 / 12, 360);
  assert.ok(Math.abs(pmt - 536_822) < 50, `payment ${pmt}`);
});

test('amortizes to zero and totals add up', () => {
  const a = amortize({ balance: 100_000_000, aprPct: 5, termMonths: 360 });
  assert.equal(a.months, 360);
  assert.equal(a.schedule[a.schedule.length - 1].balance, 0);         // paid off exactly
  assert.ok(a.totalInterest > 90_000_000 && a.totalInterest < 95_000_000); // ~₪931k interest
  assert.equal(a.totalPaid, 100_000_000 + a.totalInterest);
});

test('zero-interest loan is straight-line', () => {
  const a = amortize({ balance: 120_000, aprPct: 0, termMonths: 12 });
  assert.equal(a.months, 12);
  assert.equal(a.totalInterest, 0);
  assert.equal(a.schedule[0].principal, 10_000);
});

test('payment below interest never amortizes (flagged, not looped forever)', () => {
  const a = amortize({ balance: 100_000_000, aprPct: 10, payment: 100_00 }); // ₪100/mo on ₪1M
  assert.equal(a.neverPays, true);
  assert.equal(a.months, Infinity);
});

test('early payoff: bigger payment shortens the term and cuts interest', () => {
  const base = amortize({ balance: 50_000_000, aprPct: 4, termMonths: 240 });
  const faster = amortize({ balance: 50_000_000, aprPct: 4, payment: base.payment + 100_00 });
  assert.ok(faster.months < base.months);
  assert.ok(faster.totalInterest < base.totalInterest);
});
