// Repoint a client's ledger from Twelve Data's stale/variant tickers onto the
// canonical NSE/BSE trading symbols (which are also the Yahoo pricing symbols).
// Transactions are repointed; holdings are recomputed from them (FIFO).
//
//   node --env-file=.env.local scripts/remap-client-securities.mjs ["Client Name"]

import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
if (!globalThis.WebSocket) globalThis.WebSocket = ws;

const CLIENT_NAME = process.argv[2] || 'Chandrashekar Rama Rao';

// old Twelve Data symbol -> canonical { symbol, exchange, name }.
// Every target was validated by name via Yahoo's search API and confirmed to
// return a live price under its exchange suffix. CDSL/CESC already canonical.
const MAP = {
  ADIMON:  { symbol: 'BIRLAMONEY', exchange: 'NSE', name: 'Aditya Birla Money Ltd.' },
  AGCNET:  { symbol: 'BBOX',       exchange: 'NSE', name: 'Black Box Ltd.' },
  ANARAJ:  { symbol: 'ANANTRAJ',   exchange: 'NSE', name: 'Anant Raj Ltd.' },
  APAIND:  { symbol: 'APARINDS',   exchange: 'NSE', name: 'Apar Industries Ltd.' },
  BANMAH:  { symbol: 'MAHABANK',   exchange: 'NSE', name: 'Bank of Maharashtra' },
  BANPRO:  { symbol: 'BANCOINDIA', exchange: 'NSE', name: 'Banco Products (India) Ltd.' },
  BENHOT:  { symbol: 'BENARAS',    exchange: 'BSE', name: 'Benares Hotels Ltd.' },
  BFUTI:   { symbol: 'BFUTILITIE', exchange: 'NSE', name: 'BF Utilities Ltd.' },
  BLSINT:  { symbol: 'BLS',        exchange: 'NSE', name: 'BLS International Services Ltd.' },
  BLUSTA:  { symbol: 'BLUESTARCO', exchange: 'NSE', name: 'Blue Star Ltd.' },
  BRAMOR:  { symbol: 'BRADYM',     exchange: 'BSE', name: 'Brady & Morris Engineering Co. Ltd.' },
  CDSL:    { symbol: 'CDSL',       exchange: 'NSE', name: 'Central Depository Services (India) Ltd.' },
  CESC:    { symbol: 'CESC',       exchange: 'NSE', name: 'CESC Ltd.' },
  CHOINV:  { symbol: 'CHOLAFIN',   exchange: 'NSE', name: 'Cholamandalam Investment and Finance Company Ltd.' },
  DRAGAR:  { symbol: 'DRAGARWQ',   exchange: 'NSE', name: "Dr. Agarwal's Eye Hospital Ltd." },
  ECOREC:  { symbol: 'ECORECO',    exchange: 'BSE', name: 'Eco Recycling Ltd.' },
  EICMOT:  { symbol: 'EICHERMOT',  exchange: 'NSE', name: 'Eicher Motors Ltd.' },
  ELEENG:  { symbol: 'ELECON',     exchange: 'NSE', name: 'Elecon Engineering Co. Ltd.' },
  FEDFIN:  { symbol: 'FEDFINA',    exchange: 'NSE', name: 'Fedbank Financial Services Ltd.' },
  FLUIDO:  { symbol: 'FLUIDOM',    exchange: 'BSE', name: 'Fluidomat Ltd.' },
  GANHOU:  { symbol: 'GANESHHOU',  exchange: 'NSE', name: 'Ganesh Housing Corporation Ltd.' },
  GLOHEA:  { symbol: 'MEDANTA',    exchange: 'NSE', name: 'Global Health Ltd.' },
  GODPHI:  { symbol: 'GODFRYPHLP', exchange: 'NSE', name: 'Godfrey Phillips India Ltd.' },
  GOOLUC:  { symbol: 'GOODLUCK',   exchange: 'NSE', name: 'Goodluck India Ltd.' },
  HDFBAN:  { symbol: 'HDFCBANK',   exchange: 'NSE', name: 'HDFC Bank Ltd.' },
  HINZIN:  { symbol: 'HINDZINC',   exchange: 'NSE', name: 'Hindustan Zinc Ltd.' },
  HOMFIR:  { symbol: 'HOMEFIRST',  exchange: 'NSE', name: 'Home First Finance Company India Ltd.' },
  ICIBAN:  { symbol: 'ICICIBANK',  exchange: 'NSE', name: 'ICICI Bank Ltd.' },
  KILENG:  { symbol: 'KLBRENG-B',  exchange: 'NSE', name: 'Kilburn Engineering Ltd.' },
  LIC:     { symbol: 'LICI',       exchange: 'NSE', name: 'Life Insurance Corporation of India' },
  MININD:  { symbol: 'UNOMINDA',   exchange: 'NSE', name: 'UNO Minda Ltd.' },
  MOTOSW:  { symbol: 'MOTILALOFS', exchange: 'NSE', name: 'Motilal Oswal Financial Services Ltd.' },
  NETTEC:  { symbol: 'NETWEB',     exchange: 'NSE', name: 'Netweb Technologies India Ltd.' },
  NOVAGR:  { symbol: 'NOVAAGRI',   exchange: 'NSE', name: 'Nova Agritech Ltd.' },
  ORITEC:  { symbol: 'ORIENTTECH', exchange: 'NSE', name: 'Orient Technologies Ltd.' },
  PITLAM:  { symbol: 'PITTIENG',   exchange: 'NSE', name: 'Pitti Engineering Ltd.' },
  PNBHOU:  { symbol: 'PNBHOUSING', exchange: 'NSE', name: 'PNB Housing Finance Ltd.' },
  PNGADG:  { symbol: 'PNGJL',      exchange: 'NSE', name: 'P N Gadgil Jewellers Ltd.' },
  PRAMET:  { symbol: 'PRADPME',    exchange: 'NSE', name: 'Pradeep Metals Ltd.' },
  RELNIP:  { symbol: 'NAM-INDIA',  exchange: 'NSE', name: 'Nippon Life India Asset Management Ltd.' },
  SCHELE:  { symbol: 'SCHNEIDER',  exchange: 'NSE', name: 'Schneider Electric Infrastructure Ltd.' },
  SHIELE:  { symbol: 'SHILCTECH',  exchange: 'NSE', name: 'Shilchar Technologies Ltd.' },
  SUNCLA:  { symbol: 'TVSHLTD',    exchange: 'NSE', name: 'TVS Holdings Ltd.' },
  SYRTEC:  { symbol: 'SYRMA',      exchange: 'NSE', name: 'Syrma SGS Technology Ltd.' },
  TINOVE:  { symbol: 'TINNARUBR',  exchange: 'NSE', name: 'Tinna Rubber and Infrastructure Ltd.' },
  TIPIND:  { symbol: 'TIPSMUSIC',  exchange: 'NSE', name: 'Tips Music Ltd.' },
  VARBEV:  { symbol: 'VBL',        exchange: 'NSE', name: 'Varun Beverages Ltd.' },
  VARENG:  { symbol: 'VARROC',     exchange: 'NSE', name: 'Varroc Engineering Ltd.' },
  ZAGPRE:  { symbol: 'ZAGGLE',     exchange: 'NSE', name: 'Zaggle Prepaid Ocean Services Ltd.' },
};

const BUY = new Set(['Buy', 'IPO', 'Bonus']);
function computePosition(txns) {
  const sorted = txns.map((t, i) => ({ t, i }))
    .sort((a, b) => (new Date(a.t.traded_at) - new Date(b.t.traded_at)) || (a.i - b.i)).map((x) => x.t);
  const lots = [];
  for (const t of sorted) {
    const q = Number(t.quantity) || 0, p = Number(t.price) || 0;
    if (q <= 0) continue;
    if (BUY.has(t.side)) lots.push({ qty: q, price: t.side === 'Bonus' ? 0 : p });
    else if (t.side === 'Sell') { let s = q; while (s > 1e-9 && lots.length) { const l = lots[0]; const u = Math.min(s, l.qty); l.qty -= u; s -= u; if (l.qty <= 1e-9) lots.shift(); } }
  }
  const qty = lots.reduce((a, l) => a + l.qty, 0);
  const invested = lots.reduce((a, l) => a + l.qty * l.price, 0);
  return { qty: +qty.toFixed(4), avgCost: qty > 1e-9 ? +(invested / qty).toFixed(2) : 0 };
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: client } = await admin.from('clients').select('id,name').eq('name', CLIENT_NAME).maybeSingle();
if (!client) { console.error(`Client "${CLIENT_NAME}" not found.`); process.exit(1); }

// 1) upsert canonical securities (symbol/name/exchange only — never clobber live prices)
const canon = new Map();
for (const v of Object.values(MAP)) canon.set(`${v.exchange}:${v.symbol}`, v);
const { data: secs, error: sErr } = await admin
  .from('securities').upsert([...canon.values()], { onConflict: 'exchange,symbol' }).select('id,symbol,exchange');
if (sErr) { console.error('securities upsert failed:', sErr.message); process.exit(1); }
const idByKey = new Map(secs.map((s) => [`${s.exchange}:${s.symbol}`, s.id]));
console.log(`Canonical securities ensured: ${secs.length}`);

// 2) repoint transactions
const { data: txns, error: tErr } = await admin
  .from('transactions').select('id, security_id, side, quantity, price, traded_at, securities(symbol,exchange)')
  .eq('client_id', client.id);
if (tErr) { console.error('read transactions failed:', tErr.message); process.exit(1); }

let repointed = 0, unchanged = 0;
const remapped = [];
for (const t of txns) {
  const oldSym = t.securities?.symbol;
  const target = MAP[oldSym];
  if (!target) { console.warn(`  ! no mapping for ${oldSym} (txn ${t.id}) — left as-is`); remapped.push(t); continue; }
  const newId = idByKey.get(`${target.exchange}:${target.symbol}`);
  if (newId && newId !== t.security_id) {
    const { error } = await admin.from('transactions').update({ security_id: newId }).eq('id', t.id);
    if (error) { console.error(`  update txn ${t.id} failed:`, error.message); process.exit(1); }
    repointed++;
  } else unchanged++;
  remapped.push({ ...t, security_id: newId ?? t.security_id });
}
console.log(`Transactions: ${repointed} repointed, ${unchanged} already canonical.`);

// 3) recompute holdings from the repointed ledger
await admin.from('holdings').delete().eq('client_id', client.id);
const bySec = new Map();
for (const t of remapped) { (bySec.get(t.security_id) ?? bySec.set(t.security_id, []).get(t.security_id)).push(t); }
const holdRows = [];
for (const [sid, ts] of bySec) { const pos = computePosition(ts); if (pos.qty > 1e-9) holdRows.push({ client_id: client.id, security_id: sid, quantity: pos.qty, avg_price: pos.avgCost }); }
const { error: hErr } = await admin.from('holdings').upsert(holdRows, { onConflict: 'client_id,security_id' });
if (hErr) { console.error('holdings upsert failed:', hErr.message); process.exit(1); }
console.log(`Holdings rebuilt: ${holdRows.length} for ${client.name}.`);
console.log('Done. Run refresh:prices to fill live prices.');
