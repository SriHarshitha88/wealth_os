// XIRR — money-weighted annualised return over dated cashflows.
// Outflows (buys) are negative, inflows (sells + current market value) positive.
// Solved with Newton–Raphson and a bisection fallback. Returns a percentage,
// or null when it can't be computed (single flow, no sign change, no convergence).

export type CashFlow = { amount: number; date: string };

const DAY = 86_400_000;

function npv(rate: number, flows: { amount: number; years: number }[]): number {
  return flows.reduce((acc, f) => acc + f.amount / Math.pow(1 + rate, f.years), 0);
}
function dNpv(rate: number, flows: { amount: number; years: number }[]): number {
  return flows.reduce((acc, f) => acc - (f.years * f.amount) / Math.pow(1 + rate, f.years + 1), 0);
}

// Returns XIRR as a percentage (e.g. 18.4), or null.
export function xirr(cashflows: CashFlow[]): number | null {
  const valid = cashflows.filter((f) => Number.isFinite(f.amount) && !isNaN(new Date(f.date).getTime()));
  if (valid.length < 2) return null;
  const hasPos = valid.some((f) => f.amount > 0);
  const hasNeg = valid.some((f) => f.amount < 0);
  if (!hasPos || !hasNeg) return null; // need at least one in- and one out-flow

  const t0 = Math.min(...valid.map((f) => new Date(f.date).getTime()));
  const flows = valid.map((f) => ({ amount: f.amount, years: (new Date(f.date).getTime() - t0) / DAY / 365 }));

  // Newton–Raphson
  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(rate, flows);
    const df = dNpv(rate, flows);
    if (!Number.isFinite(f) || !Number.isFinite(df) || Math.abs(df) < 1e-12) break;
    const next = rate - f / df;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - rate) < 1e-8) return +(next * 100).toFixed(2);
    rate = next;
  }

  // Bisection fallback over a wide bracket
  let lo = -0.9999, hi = 100;
  let flo = npv(lo, flows), fhi = npv(hi, flows);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fmid = npv(mid, flows);
    if (Math.abs(fmid) < 1e-7 || (hi - lo) / 2 < 1e-8) return +(mid * 100).toFixed(2);
    if (flo * fmid < 0) { hi = mid; fhi = fmid; } else { lo = mid; flo = fmid; }
  }
  return null;
}

// Build the cashflows for one security position from its ledger + current value.
export function positionCashflows(
  txns: { side: string; quantity: number | string; price: number | string; traded_at: string }[],
  currentQty: number,
  lastPrice: number | null,
  asOfISO: string,
): CashFlow[] {
  const flows: CashFlow[] = [];
  for (const t of txns) {
    const q = Number(t.quantity) || 0;
    const p = Number(t.price) || 0;
    if (q <= 0) continue;
    if (t.side === 'Buy' || t.side === 'IPO') flows.push({ amount: -(q * p), date: t.traded_at });
    else if (t.side === 'Sell') flows.push({ amount: q * p, date: t.traded_at });
    // Bonus (price 0) contributes no cashflow
  }
  if (currentQty > 1e-9 && lastPrice != null) flows.push({ amount: currentQty * lastPrice, date: asOfISO });
  return flows;
}
