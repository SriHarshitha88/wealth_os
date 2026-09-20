// Client PMS capital-flow report: movement of capital in and out of a client's
// segregated portfolio over a period, reconciled the way a PMS statement does:
//
//   Closing AUM = Opening AUM + Net Flows + MTM Gains/(Losses)
//
// Inflows are capital deployed into the portfolio (Buy/IPO cost + Deposits),
// outflows are capital returned (Sell proceeds + Withdrawals). Advisory fees
// are invoiced and settled outside the segregated portfolio, so they are not
// capital movements and do not appear in this statement. Historical
// market prices are not stored, so AUM at a past date is stated AT COST (the
// cost basis of lots held on that date); today's closing AUM uses live market
// prices. MTM is derived as the balancing figure of the identity above.

import { computeLots, type LedgerTxn } from '@/lib/portfolio-calc';

export type FlowTxnRow = LedgerTxn & { security_id: number | null; securities?: any };

export type FlowEvent = {
  date: string;               // ISO
  kind: 'Inflow' | 'Outflow';
  label: string;              // e.g. "Buy RELIANCE · 100 @ 2,850.00"
  inAmt: number | null;
  outAmt: number | null;
};

export type FlowReport = {
  from: string; to: string;                    // ISO dates (inclusive)
  openingAum: number; openingAtCost: boolean;
  inflows: number; outflows: number; netFlows: number;
  mtm: number;                                 // derived (balancing figure)
  closingAum: number; closingAtCost: boolean;
  events: FlowEvent[];                         // chronological ledger of flows in the period
};

const rel = (x: any) => (Array.isArray(x) ? x[0] : x);
const day = (iso: string) => iso.slice(0, 10);

// Rupee amount of a ledger row: qty × price for trades; Deposit/Withdrawal
// rows may carry the amount in `price` alone (qty 0/blank).
function amountOf(t: LedgerTxn): number {
  const q = Number(t.quantity) || 0;
  const p = Number(t.price) || 0;
  return q > 0 ? q * p : p;
}

// Cost basis of everything held strictly before/at `atISO` (FIFO replay).
function costBasisAt(txns: FlowTxnRow[], atISO: string): number {
  const bySec = new Map<number, FlowTxnRow[]>();
  for (const t of txns) {
    if (day(t.traded_at) > atISO || t.security_id == null) continue;
    const list = bySec.get(t.security_id) ?? [];
    list.push(t);
    bySec.set(t.security_id, list);
  }
  let total = 0;
  for (const list of bySec.values()) total += computeLots(list).invested;
  return total;
}

// Live market value of everything held after replaying all txns up to `atISO`
// (falls back to cost where a security has no price).
function marketValueAt(txns: FlowTxnRow[], atISO: string): number {
  const bySec = new Map<number, { sec: any; list: FlowTxnRow[] }>();
  for (const t of txns) {
    if (day(t.traded_at) > atISO || t.security_id == null) continue;
    const e = bySec.get(t.security_id) ?? { sec: rel(t.securities), list: [] };
    e.list.push(t);
    bySec.set(t.security_id, e);
  }
  let total = 0;
  for (const { sec, list } of bySec.values()) {
    const pos = computeLots(list);
    const px = sec?.last_price != null ? Number(sec.last_price) : null;
    total += px != null ? pos.qty * px : pos.invested;
  }
  return total;
}

export function computeCapitalFlows(
  txns: FlowTxnRow[], from: string, to: string, todayISO: string,
): FlowReport {
  const dayBeforeFrom = new Date(new Date(from + 'T00:00:00Z').getTime() - 86_400_000).toISOString().slice(0, 10);

  const events: FlowEvent[] = [];
  let inflows = 0, outflows = 0;

  const qf = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const pf = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  for (const t of txns) {
    const d = day(t.traded_at);
    if (d < from || d > to) continue;
    const sym = rel(t.securities)?.symbol ?? '';
    const amt = amountOf(t);
    if (amt <= 0) continue;
    const q = Number(t.quantity) || 0;
    const p = Number(t.price) || 0;
    if (t.side === 'Buy' || t.side === 'IPO') {
      inflows += amt;
      events.push({ date: t.traded_at, kind: 'Inflow', label: `${t.side} ${sym} · ${qf(q)} @ ${pf(p)}`, inAmt: amt, outAmt: null });
    } else if (t.side === 'Deposit') {
      inflows += amt;
      events.push({ date: t.traded_at, kind: 'Inflow', label: 'Capital deposit', inAmt: amt, outAmt: null });
    } else if (t.side === 'Sell') {
      outflows += amt;
      events.push({ date: t.traded_at, kind: 'Outflow', label: `Sell ${sym} · ${qf(q)} @ ${pf(p)}`, inAmt: null, outAmt: amt });
    } else if (t.side === 'Withdrawal') {
      outflows += amt;
      events.push({ date: t.traded_at, kind: 'Outflow', label: 'Capital withdrawal', inAmt: null, outAmt: amt });
    }
    // Dividend / Bonus / Split: portfolio income & corporate actions, not client capital flows.
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  const openingAum = costBasisAt(txns, dayBeforeFrom);
  const closingLive = to >= todayISO;
  const closingAum = closingLive ? marketValueAt(txns, to) : costBasisAt(txns, to);

  const netFlows = inflows - outflows;
  const mtm = closingAum - openingAum - netFlows;

  return {
    from, to,
    openingAum, openingAtCost: true,
    inflows, outflows, netFlows,
    mtm,
    closingAum, closingAtCost: !closingLive,
    events,
  };
}

// ---- period helpers (IST) ----
export function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

// Indian FY: 1 Apr → 31 Mar. fyStart('2026-09-14') === '2026-04-01'.
export function fyStartOf(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `${m >= 4 ? y : y - 1}-04-01`;
}
