// FIFO portfolio maths. Transactions are the source of truth; a security's
// current quantity, average cost of the *remaining* lots, and realised P/L are
// all derived by replaying the trades oldest-first and matching sells against
// the earliest open buy lots (first-in-first-out).

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

const BUY_SIDES = new Set(['Buy', 'IPO', 'Bonus']);
const SELL_SIDES = new Set(['Sell']);

export function computePosition(txns: LedgerTxn[]): Position {
  // oldest first; stable for same-day trades (keeps input order)
  const sorted = txns
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const d = new Date(a.t.traded_at).getTime() - new Date(b.t.traded_at).getTime();
      return d !== 0 ? d : a.i - b.i;
    })
    .map((x) => x.t);

  const lots: { qty: number; price: number }[] = [];
  let realised = 0;

  for (const t of sorted) {
    const q = Number(t.quantity) || 0;
    const p = Number(t.price) || 0;
    if (q <= 0) continue;

    if (BUY_SIDES.has(t.side)) {
      lots.push({ qty: q, price: t.side === 'Bonus' ? 0 : p });
    } else if (SELL_SIDES.has(t.side)) {
      let toSell = q;
      while (toSell > 1e-9 && lots.length) {
        const lot = lots[0];
        const used = Math.min(toSell, lot.qty);
        realised += used * (p - lot.price);
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
  };
}
