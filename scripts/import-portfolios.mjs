// One-off backfill: load client portfolios parsed out of broker .xls exports
// into Supabase. Transactions are the source of truth; holdings are recomputed
// from them (FIFO), mirroring app/actions/import.ts.
//
//   node --env-file=.env.local scripts/import-portfolios.mjs <lots.json> [advisorId]
//
// <lots.json> shape:  { "<Client Name>": [ { name, exchange, qty, inv_price,
//   inv_date, latest, prev, side, notes }, ... ], ... }

import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import fs from 'node:fs';
if (!globalThis.WebSocket) globalThis.WebSocket = ws;

const lotsPath = process.argv[2];
const ADVISOR_ID = process.argv[3] || '6fa81724-f91e-4eb7-b407-de89bf601ccb'; // harshithajampani81@gmail.com
if (!lotsPath) { console.error('Usage: import-portfolios.mjs <lots.json> [advisorId]'); process.exit(1); }

// Sheet display name -> validated Yahoo/NSE-BSE symbol. Each symbol was checked
// against the live Yahoo price (sheets are dated today), so pricing works.
const SYMBOL = {
  'Anant Raj':       { symbol: 'ANANTRAJ',   exchange: 'NSE', name: 'Anant Raj Ltd.' },
  'BLACK BOX':       { symbol: 'BBOX',       exchange: 'NSE', name: 'Black Box Ltd.' },
  'Dynacons Sys':    { symbol: 'DSSL',       exchange: 'NSE', name: 'Dynacons Systems & Solutions Ltd.' },
  'Eco Recycling':   { symbol: 'ECORECO',    exchange: 'BSE', name: 'Eco Recycling Ltd.' },
  'Fedbank Financi': { symbol: 'FEDFINA',    exchange: 'NSE', name: 'Fedbank Financial Services Ltd.' },
  'Fluidomat':       { symbol: 'FLUIDOM',    exchange: 'BSE', name: 'Fluidomat Ltd.' },
  'Ganesh Housing':  { symbol: 'GANESHHOU',  exchange: 'NSE', name: 'Ganesh Housing Corporation Ltd.' },
  'Home First':      { symbol: 'HOMEFIRST',  exchange: 'NSE', name: 'Home First Finance Company India Ltd.' },
  'Jyoti CNC Auto':  { symbol: 'JYOTICNC',   exchange: 'NSE', name: 'Jyoti CNC Automation Ltd.' },
  'Manorama Indust': { symbol: 'MANORAMA',   exchange: 'NSE', name: 'Manorama Industries Ltd.' },
  'Motilal Oswal':   { symbol: 'MOTILALOFS', exchange: 'NSE', name: 'Motilal Oswal Financial Services Ltd.' },
  'NIBE':            { symbol: 'NIBE',       exchange: 'NSE', name: 'Nibe Ltd.' },
  'Nippon':          { symbol: 'NAM-INDIA',  exchange: 'NSE', name: 'Nippon Life India Asset Management Ltd.' },
  'Nova Agritech':   { symbol: 'NOVAAGRI',   exchange: 'NSE', name: 'Nova Agritech Ltd.' },
  'Premier Energie': { symbol: 'PREMIERENE', exchange: 'NSE', name: 'Premier Energies Ltd.' },
  'Ritco Logistics': { symbol: 'RITCO',      exchange: 'NSE', name: 'Ritco Logistics Ltd.' },
  'SJS Enterprises': { symbol: 'SJS',        exchange: 'NSE', name: 'SJS Enterprises Ltd.' },
  'Shilchar Techno': { symbol: 'SHILCTECH',  exchange: 'NSE', name: 'Shilchar Technologies Ltd.' },
  'Syrma SGS':       { symbol: 'SYRMA',      exchange: 'NSE', name: 'Syrma SGS Technology Ltd.' },
  'Amal':            { symbol: 'AMAL',       exchange: 'BSE', name: 'Amal Ltd.' },
  'Arrow Greentech': { symbol: 'ARROWGREEN', exchange: 'NSE', name: 'Arrow Greentech Ltd.' },
  'CAMS':            { symbol: 'CAMS',       exchange: 'NSE', name: 'Computer Age Management Services Ltd.' },
  'Frontier Spring': { symbol: 'FRONTSP',    exchange: 'NSE', name: 'Frontier Springs Ltd.' },
  'Pradeep Metals':  { symbol: 'PRADPME',    exchange: 'NSE', name: 'Pradeep Metals Ltd.' },
  'R R Kabel':       { symbol: 'RRKABEL',    exchange: 'NSE', name: 'R R Kabel Ltd.' },
  'Sky Gold':        { symbol: 'SKYGOLD',    exchange: 'NSE', name: 'Sky Gold Ltd.' },
  'Blue Star':       { symbol: 'BLUESTARCO', exchange: 'NSE', name: 'Blue Star Ltd.' },
  'HBL Eng':         { symbol: 'HBLENGINE',  exchange: 'NSE', name: 'HBL Engineering Ltd.' },
  'AB Money':        { symbol: 'BIRLAMONEY', exchange: 'NSE', name: 'Aditya Birla Money Ltd.' },
  'TVS Holdings':    { symbol: 'TVSHLTD',    exchange: 'NSE', name: 'TVS Holdings Ltd.' },
  'Tinna Rubber an': { symbol: 'TINNARUBR',  exchange: 'NSE', name: 'Tinna Rubber and Infrastructure Ltd.' },
  'Zodiac Energy':   { symbol: 'ZODIAC',     exchange: 'NSE', name: 'Zodiac Energy Ltd.' },
};

// Placeholder phones (sheets carry none). NOT NULL + used as the find-or-create
// idempotency key, so re-running updates the same client instead of duplicating.
const PHONE = { 'Rakesh Singh': '9000000001', 'Bala': '9000000002', 'Suresh Gupta': '9000000003', 'Ravi': '9000000004' };

// FIFO position from a ledger (ported from lib/portfolio-calc.ts).
const BUY = new Set(['Buy', 'IPO', 'Bonus']);
function computePosition(txns) {
  const sorted = txns.map((t, i) => ({ t, i }))
    .sort((a, b) => (new Date(a.t.traded_at) - new Date(b.t.traded_at)) || (a.i - b.i))
    .map((x) => x.t);
  const lots = [];
  for (const t of sorted) {
    const q = Number(t.quantity) || 0, p = Number(t.price) || 0;
    if (q <= 0) continue;
    if (BUY.has(t.side)) lots.push({ qty: q, price: t.side === 'Bonus' ? 0 : p });
    else if (t.side === 'Sell') {
      let toSell = q;
      while (toSell > 1e-9 && lots.length) {
        const lot = lots[0]; const used = Math.min(toSell, lot.qty);
        lot.qty -= used; toSell -= used; if (lot.qty <= 1e-9) lots.shift();
      }
    }
  }
  const qty = lots.reduce((a, l) => a + l.qty, 0);
  const invested = lots.reduce((a, l) => a + l.qty * l.price, 0);
  return { qty: +qty.toFixed(4), avgCost: qty > 1e-9 ? +(invested / qty).toFixed(2) : 0 };
}

const tierFor = (v) => (v >= 1e7 ? 'Platinum' : v >= 5e6 ? 'Gold' : 'Silver');
const istIso = (d) => (d ? new Date(`${d}T00:00:00+05:30`).toISOString() : new Date().toISOString());

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const portfolios = JSON.parse(fs.readFileSync(lotsPath, 'utf-8'));
const now = new Date().toISOString();

// ---- validate mapping up front ----
const missing = new Set();
for (const lots of Object.values(portfolios)) for (const l of lots) if (!SYMBOL[l.name]) missing.add(l.name);
if (missing.size) { console.error('No symbol mapping for:', [...missing]); process.exit(1); }

// ---- 1) upsert securities with today's seed price from the sheet ----
const secSeed = new Map(); // `${ex}:${sym}` -> {symbol,name,exchange,last_price,prev_close}
for (const lots of Object.values(portfolios)) {
  for (const l of lots) {
    const m = SYMBOL[l.name];
    const k = `${m.exchange}:${m.symbol}`;
    if (!secSeed.has(k)) secSeed.set(k, {
      symbol: m.symbol, name: m.name, exchange: m.exchange,
      last_price: l.latest ?? null, prev_close: l.prev ?? null, last_price_at: l.latest != null ? now : null,
    });
  }
}
const { data: secs, error: secErr } = await admin
  .from('securities').upsert([...secSeed.values()], { onConflict: 'exchange,symbol' }).select('id,symbol,exchange');
if (secErr) { console.error('securities upsert failed:', secErr.message); process.exit(1); }
const secId = new Map(secs.map((s) => [`${s.exchange}:${s.symbol}`, s.id]));
console.log(`Securities: upserted ${secs.length} (seeded with today's prices).`);

// ---- 2) per client: clean re-import ----
for (const [clientName, lots] of Object.entries(portfolios)) {
  const phone = PHONE[clientName] ?? clientName;
  const totalValue = lots.reduce((a, l) => a + (l.latest ?? 0) * l.qty, 0);
  const tier = tierFor(totalValue);

  const { data: existing } = await admin
    .from('clients').select('id').eq('advisor_id', ADVISOR_ID).eq('phone', phone).maybeSingle();

  let clientId;
  if (existing) {
    clientId = existing.id;
    await admin.from('transactions').delete().eq('client_id', clientId);
    await admin.from('holdings').delete().eq('client_id', clientId);
    await admin.from('clients').update({ name: clientName, tier }).eq('id', clientId);
  } else {
    const { data: created, error: cErr } = await admin
      .from('clients').insert({ advisor_id: ADVISOR_ID, name: clientName, phone, tier }).select('id').single();
    if (cErr) { console.error(`client ${clientName} failed:`, cErr.message); process.exit(1); }
    clientId = created.id;
  }

  // transactions (one per lot)
  const txnRows = lots.map((l) => {
    const m = SYMBOL[l.name];
    return {
      client_id: clientId, security_id: secId.get(`${m.exchange}:${m.symbol}`),
      side: l.side === 'Bonus' ? 'Bonus' : 'Buy',
      quantity: l.qty, price: l.side === 'Bonus' ? 0 : (l.inv_price || 0),
      traded_at: istIso(l.inv_date),
      note: l.notes ? `Imported holding — ${l.notes}` : 'Imported holding',
    };
  });
  const { error: tErr } = await admin.from('transactions').insert(txnRows);
  if (tErr) { console.error(`transactions ${clientName} failed:`, tErr.message); process.exit(1); }

  // holdings recomputed from the ledger, per security (FIFO)
  const bySec = new Map();
  for (const t of txnRows) { (bySec.get(t.security_id) ?? bySec.set(t.security_id, []).get(t.security_id)).push(t); }
  const holdRows = [];
  for (const [sid, ts] of bySec) {
    const pos = computePosition(ts);
    if (pos.qty > 1e-9) holdRows.push({ client_id: clientId, security_id: sid, quantity: pos.qty, avg_price: pos.avgCost });
  }
  const { error: hErr } = await admin.from('holdings').upsert(holdRows, { onConflict: 'client_id,security_id' });
  if (hErr) { console.error(`holdings ${clientName} failed:`, hErr.message); process.exit(1); }

  const invested = holdRows.reduce((a, h) => a + h.quantity * h.avg_price, 0);
  console.log(`✓ ${clientName.padEnd(14)} tier=${tier.padEnd(8)} ${lots.length} lots -> ${holdRows.length} holdings · invested ₹${Math.round(invested).toLocaleString('en-IN')} · value ₹${Math.round(totalValue).toLocaleString('en-IN')}`);
}
console.log('\nDone.');
