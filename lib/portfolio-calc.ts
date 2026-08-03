// FIFO portfolio maths. Transactions are the source of truth; a security's
// current quantity, average cost, realised P/L, per-lot acquisition dates and
// matched buy→sell slices (for capital-gains ST/LT classification) are all
// derived by replaying the trades oldest-first, matching sells against the
// earliest open buy lots (first-in-first-out).

export type LedgerTxn = {
  side: string;          // 'Buy' | 'Sell' | 'IPO' | 'Bonus' | 'Dividend' | ...
  quantity: number | string;
  price: number | string;
  traded_at: string;
};

export type Position = {
  qty: number;       // shares still held
  avgCost: number;   // weighted-average cost of the remaining lots
  invested: number;  // cost basis of the remaining lots (qty * avgCost)
  realised: number;  // realised P/L booked from sells (FIFO)
};

// An open (still-held) lot with its acquisition date.
export type OpenLot = { qty: number; price: number; date: string };

// One FIFO-matched buy→sell slice — the row a capital-gains statement needs.
export type RealisedSlice = {
  qty: number;
  buyPrice: number; sellPrice: number;
  buyDate: string; sellDate: string;
  cost: number; proceeds: number; gain: number;
  holdingDays: number; longTerm: boolean;   // >365 days = long-term (listed equity)
};

export type LotResult = Position & {
  openLots: OpenLot[];             // remaining lots, oldest first
  realisedSlices: RealisedSlice[]; // every matched buy→sell slice
  firstBuyDate: string | null;     // earliest acquisition ever (entry into the stock)
};

const BUY_SIDES = new Set(['Buy', 'IPO', 'Bonus']);
const SELL_SIDES = new Set(['Sell']);
export const LTCG_DAYS = 365; // listed equity: > 365 days held = long-term

const DAY = 86_400_000;
export function daysBetween(fromISO: string, toISO: string): number {
  return Math.floor((new Date(toISO).getTime() - new Date(fromISO).getTime()) / DAY);
}

// Full FIFO replay with lot-level detail.
export function computeLots(txns: LedgerTxn[]): LotResult {
  const sorted = txns
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const d = new Date(a.t.traded_at).getTime() - new Date(b.t.traded_at).getTime();
      return d !== 0 ? d : a.i - b.i;
    })
    .map((x) => x.t);

  const lots: OpenLot[] = [];
  const realisedSlices: RealisedSlice[] = [];
  let realised = 0;
  let firstBuyDate: string | null = null;

  for (const t of sorted) {
    const q = Number(t.quantity) || 0;
    const p = Number(t.price) || 0;
    if (q <= 0) continue;

    if (BUY_SIDES.has(t.side)) {
      if (!firstBuyDate) firstBuyDate = t.traded_at;
      lots.push({ qty: q, price: t.side === 'Bonus' ? 0 : p, date: t.traded_at });
    } else if (SELL_SIDES.has(t.side)) {
      let toSell = q;
      while (toSell > 1e-9 && lots.length) {
        const lot = lots[0];
        const used = Math.min(toSell, lot.qty);
        const cost = used * lot.price;
        const proceeds = used * p;
        const holdingDays = daysBetween(lot.date, t.traded_at);
        realised += proceeds - cost;
        realisedSlices.push({
          qty: used, buyPrice: lot.price, sellPrice: p, buyDate: lot.date, sellDate: t.traded_at,
          cost: +cost.toFixed(2), proceeds: +proceeds.toFixed(2), gain: +(proceeds - cost).toFixed(2),
          holdingDays, longTerm: holdingDays > LTCG_DAYS,
        });
        lot.qty -= used;
        toSell -= used;
        if (lot.qty <= 1e-9) lots.shift();
      }
      // any oversell beyond held lots is ignored (data-entry guard)
    }
    // Dividend / Deposit / Withdrawal / Split: no effect on share lots here
  }

  const qty = lots.reduce((a, l) => a + l.qty, 0);
  const invested = lots.reduce((a, l) => a + l.qty * l.price, 0);
  const avgCost = qty > 1e-9 ? invested / qty : 0;
  return {
    qty: +qty.toFixed(4),
    avgCost: +avgCost.toFixed(2),
    invested: +invested.toFixed(2),
    realised: +realised.toFixed(2),
    openLots: lots.map((l) => ({ qty: +l.qty.toFixed(4), price: l.price, date: l.date })),
    realisedSlices,
    firstBuyDate,
  };
}

// Back-compatible summary (unchanged output) — now derived from computeLots.
export function computePosition(txns: LedgerTxn[]): Position {
  const { qty, avgCost, invested, realised } = computeLots(txns);
  return { qty, avgCost, invested, realised };
}
