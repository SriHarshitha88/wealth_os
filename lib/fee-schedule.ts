// Performance-fee schedule (slab on the client's own invested capital).
//
// Appreciation is measured against the fixed capital C (the invested amount).
// Every 20% band of gain over C is charged ONCE, at its own rate, when that
// milestone is first reached:
//   +20% → 5%   +40% → 10%   +60% → 12.5%   +80% → 15%   +100% → 25%
// Each band's fee = rate × (20% of C). Above +100% gain it's a flat 25% on the
// gain beyond 2C. The fee for a band is charged on the full band only once the
// milestone is crossed (not pro-rata), matching how the advisor bills it.
//
// State (which bands are already billed) is derived from the fees ledger rather
// than stored: each collected performance fee is tagged in invoice_no as
// `PF-L{level}` (bands billed up to that level) or `PF-ABOVE` (a >100% charge).

export const BAND_RATES = [5, 10, 12.5, 15, 25] as const; // % for bands 1..5
export const ABOVE_RATE = 25; // flat % on gain above +100%
export const BAND_STEP = 20;  // % of capital per band
export const MAX_BAND = BAND_RATES.length; // 5

const r2 = (n: number) => Math.round(n * 100) / 100;

export type FeeState = { capital: number; current: number; chargedBands: number; aboveSettled: number };
export type BandDue = { band: number; milestonePct: number; rate: number; fee: number };
export type FeeCalc = {
  capital: number; current: number; gainPct: number;
  reachedBands: number;      // full 20% bands the current value has reached (0..5)
  chargedBands: number;      // bands already billed
  bandsDue: BandDue[];       // newly-crossed bands not yet billed
  aboveDue: number;          // flat 25% owed on gain beyond +100%
  feeDue: number;            // total owed right now
  reachedPct: number;        // milestone reached (e.g. 20, 40), 0 if none
  nextMilestonePct: number | null;
  nextMilestoneValue: number | null;
  progressPct: number;       // 0..100 from last charged milestone to the next
};

// Replay the fees ledger to see how far a client has already been billed.
export function deriveState(
  feeRows: { invoice_no: string | null; amount: number | string; status: string }[],
  capital: number,
): { chargedBands: number; aboveSettled: number } {
  let chargedBands = 0;
  let abovePaid = 0;
  for (const f of feeRows) {
    if (f.status !== 'Collected' || !f.invoice_no) continue;
    const lvl = /^PF-L(\d)/.exec(f.invoice_no);
    if (lvl) chargedBands = Math.max(chargedBands, Number(lvl[1]));
    if (/^PF-ABOVE/.test(f.invoice_no)) abovePaid += Number(f.amount) || 0;
  }
  // each above-fee = 25% × (newValue − prevMark) ⇒ prevMark advances by fee/0.25
  const aboveSettled = 2 * capital + abovePaid / (ABOVE_RATE / 100);
  return { chargedBands: Math.min(MAX_BAND, chargedBands), aboveSettled };
}

export function computeFee({ capital, current, chargedBands, aboveSettled }: FeeState): FeeCalc {
  const gain = current - capital;
  const gainPct = capital > 0 ? (gain / capital) * 100 : 0;
  const bandValue = capital > 0 ? 0.2 * capital : 0; // ₹ per 20% band
  const reachedBands = bandValue > 0 ? Math.min(MAX_BAND, Math.max(0, Math.floor(gain / bandValue))) : 0;

  const bandsDue: BandDue[] = [];
  for (let m = chargedBands + 1; m <= reachedBands; m++) {
    bandsDue.push({ band: m, milestonePct: BAND_STEP * m, rate: BAND_RATES[m - 1], fee: r2((BAND_RATES[m - 1] / 100) * bandValue) });
  }

  let aboveDue = 0;
  const twoC = 2 * capital;
  if (capital > 0 && current > twoC) {
    const base = Math.max(aboveSettled || 0, twoC);
    if (current > base) aboveDue = r2((ABOVE_RATE / 100) * (current - base));
  }

  const feeDue = r2(bandsDue.reduce((a, b) => a + b.fee, 0) + aboveDue);

  const nextBand = chargedBands < MAX_BAND ? chargedBands + 1 : null;
  const nextMilestonePct = nextBand ? BAND_STEP * nextBand : null;
  const nextMilestoneValue = nextBand ? capital * (1 + 0.2 * nextBand) : null;
  const prevMilestoneValue = capital * (1 + 0.2 * chargedBands);
  const progressPct = nextMilestoneValue && nextMilestoneValue > prevMilestoneValue
    ? Math.max(0, Math.min(100, ((current - prevMilestoneValue) / (nextMilestoneValue - prevMilestoneValue)) * 100))
    : (current >= twoC ? 100 : 0);

  return {
    capital, current, gainPct, reachedBands, chargedBands, bandsDue, aboveDue, feeDue,
    reachedPct: reachedBands * BAND_STEP, nextMilestonePct, nextMilestoneValue, progressPct,
  };
}
