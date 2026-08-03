// Capital-gains classification for listed equity, per Indian rules:
//   holding > 365 days = Long-term (LTCG), else Short-term (STCG).
// Built on the FIFO slices from lib/portfolio-calc. Grandfathering (31-Jan-2018
// FMV) is intentionally NOT applied — this book has no pre-2018 holdings.

import { type RealisedSlice, type OpenLot, daysBetween, LTCG_DAYS } from './portfolio-calc';

// ---- Indian financial year (1 Apr – 31 Mar), computed in IST ----
function istYM(iso: string): { y: number; m: number } {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(new Date(iso));
  return { y: Number(p.find((x) => x.type === 'year')?.value), m: Number(p.find((x) => x.type === 'month')?.value) };
}
export function fyLabelOf(iso: string): string {
  const { y, m } = istYM(iso);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
export function currentFY(asOfISO: string = new Date().toISOString()): string {
  return fyLabelOf(asOfISO);
}

export type CGBucket = { count: number; qty: number; proceeds: number; cost: number; gain: number };
const empty = (): CGBucket => ({ count: 0, qty: 0, proceeds: 0, cost: 0, gain: 0 });
const round = (b: CGBucket): CGBucket => ({ count: b.count, qty: +b.qty.toFixed(4), proceeds: +b.proceeds.toFixed(2), cost: +b.cost.toFixed(2), gain: +b.gain.toFixed(2) });

export type RealisedCG = { fy: string | null; short: CGBucket; long: CGBucket; slices: RealisedSlice[] };

// Realised gains from FIFO sell-slices, optionally scoped to one financial year.
export function realisedGains(slices: RealisedSlice[], fy?: string | null): RealisedCG {
  const inFy = fy ? slices.filter((s) => fyLabelOf(s.sellDate) === fy) : slices;
  const short = empty(), long = empty();
  for (const s of inFy) {
    const b = s.longTerm ? long : short;
    b.count++; b.qty += s.qty; b.proceeds += s.proceeds; b.cost += s.cost; b.gain += s.gain;
  }
  return { fy: fy ?? null, short: round(short), long: round(long), slices: inFy };
}

// The distinct financial years that have any sells, newest first.
export function financialYearsWithSells(slices: RealisedSlice[]): string[] {
  return [...new Set(slices.map((s) => fyLabelOf(s.sellDate)))].sort().reverse();
}

// ---- Unrealised: what open lots would be taxed as if sold today ----
export type UnrealLot = { qty: number; buyDate: string; holdingDays: number; longTerm: boolean; cost: number; value: number; gain: number };
export type UnrealisedCG = { lots: UnrealLot[]; short: CGBucket; long: CGBucket; daysToLTCG: number | null };

export function unrealisedSplit(openLots: OpenLot[], lastPrice: number | null, asOfISO: string): UnrealisedCG {
  const short = empty(), long = empty();
  const lots: UnrealLot[] = openLots.map((l) => {
    const holdingDays = daysBetween(l.date, asOfISO);
    const longTerm = holdingDays > LTCG_DAYS;
    const cost = l.qty * l.price;
    const value = lastPrice != null ? l.qty * lastPrice : cost;
    const gain = value - cost;
    const b = longTerm ? long : short;
    b.count++; b.qty += l.qty; b.proceeds += value; b.cost += cost; b.gain += gain;
    return { qty: l.qty, buyDate: l.date, holdingDays, longTerm, cost: +cost.toFixed(2), value: +value.toFixed(2), gain: +gain.toFixed(2) };
  });
  // days until the oldest still-short lot crosses into long-term
  const st = lots.filter((l) => !l.longTerm);
  const daysToLTCG = st.length ? Math.max(0, LTCG_DAYS + 1 - Math.max(...st.map((l) => l.holdingDays))) : null;
  return { lots, short: round(short), long: round(long), daysToLTCG };
}
