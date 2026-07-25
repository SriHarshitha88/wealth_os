// One-off / manual price refresh for all currently-held stocks (Yahoo Finance).
// Same logic as the scheduled cron, runnable from the terminal.
//   npm run refresh:prices

import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
if (!globalThis.WebSocket) globalThis.WebSocket = ws;

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data: held } = await admin.from('holdings').select('security_id, securities(symbol)');
const map = new Map();
for (const r of held ?? []) {
  const rel = r.securities;
  const sym = Array.isArray(rel) ? rel[0]?.symbol : rel?.symbol;
  if (sym) map.set(sym, r.security_id);
}

const symbols = [...map.keys()];
let updated = 0;
for (const sym of symbols) {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}.NS?interval=1d&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    );
    const j = await res.json();
    const m = j?.chart?.result?.[0]?.meta;
    if (m?.regularMarketPrice == null) { console.log(`  ${sym}: no price`); continue; }
    const price = Number(m.regularMarketPrice);
    const prev = Number(m.chartPreviousClose ?? m.previousClose ?? price);
    await admin
      .from('securities')
      .update({ last_price: price, prev_close: prev, last_price_at: new Date().toISOString() })
      .eq('id', map.get(sym));
    console.log(`  ${sym}: ₹${price}`);
    updated++;
  } catch (e) {
    console.log(`  ${sym}: error ${e.message}`);
  }
}
console.log(`Updated ${updated} of ${symbols.length} held stocks.`);
