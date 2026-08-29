/**
 * Loan amortization (roadmap: mortgage payoff curve). Pure math, agorot in/out.
 * Handles a fixed-rate loan given (balance, aprPct, termMonths) or (…, monthlyPayment).
 * Israeli mortgages mix tracks (prime / fixed / CPI-linked); this is the standard single-rate
 * approximation — honest and useful, not a bank-exact multi-track engine.
 */
export interface AmortRow { month: number; interest: number; principal: number; balance: number }
export interface Amortization {
  payment: number; months: number; totalInterest: number; totalPaid: number;
  schedule: AmortRow[]; neverPays: boolean;
}

/** Monthly payment for principal P at monthly rate r over n months (agorot). */
export function monthlyPayment(P: number, r: number, n: number): number {
  if (n <= 0) return P;
  if (r === 0) return Math.round(P / n);
  return Math.round(P * r / (1 - Math.pow(1 + r, -n)));
}

export function amortize(opts: { balance: number; aprPct: number; termMonths?: number; payment?: number }): Amortization {
  const P = Math.max(0, Math.round(opts.balance));
  const r = opts.aprPct / 100 / 12;
  let pmt = opts.payment ?? (opts.termMonths ? monthlyPayment(P, r, opts.termMonths) : 0);
  // if payment can't cover the first month's interest, the loan never amortizes
  const firstInterest = Math.round(P * r);
  if (P > 0 && pmt <= firstInterest && r > 0) {
    return { payment: pmt, months: Infinity, totalInterest: Infinity, totalPaid: Infinity, schedule: [], neverPays: true };
  }
  const schedule: AmortRow[] = [];
  let balance = P, totalInterest = 0, m = 0;
  const CAP = 1200; // 100 years guard
  while (balance > 0 && m < CAP) {
    m++;
    const interest = Math.round(balance * r);
    let principal = pmt - interest;
    if (principal >= balance) { principal = balance; } // final (partial) payment
    balance -= principal;
    totalInterest += interest;
    schedule.push({ month: m, interest, principal, balance });
  }
  return { payment: pmt, months: m, totalInterest, totalPaid: P + totalInterest, schedule, neverPays: false };
}

/** Down-sample a schedule to ~N points for charting (keeps first & last). */
export function sampleBalance(a: Amortization, points = 24): { month: number; balance: number }[] {
  const s = a.schedule;
  if (s.length <= points) return s.map(x => ({ month: x.month, balance: x.balance }));
  const step = Math.ceil(s.length / points);
  const out = s.filter((_, i) => i % step === 0).map(x => ({ month: x.month, balance: x.balance }));
  out.unshift({ month: 0, balance: a.schedule[0].balance + a.schedule[0].principal });
  return out;
}
