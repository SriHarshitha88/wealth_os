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

const { data: held } = await admin.from('holdings').select('security_id, securities(symbol, exchange)');
const suffix = (exchange) => (exchange === 'BSE' ? '.BO' : '.NS');
const seen = new Set();
const rows = [];
for (const r of held ?? []) {
  const rel = r.securities;
  const sec = Array.isArray(rel) ? rel[0] : rel;
  if (!sec?.symbol) continue;
  const exchange = sec.exchange ?? 'NSE';
  const k = `${exchange}:${sec.symbol}`;
  if (seen.has(k)) continue;
  seen.add(k);
  rows.push({ symbol: sec.symbol, exchange, id: r.security_id });
}

let updated = 0;
for (const { symbol, exchange, id } of rows) {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}${suffix(exchange)}?interval=1d&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    );
    const j = await res.json();
    const m = j?.chart?.result?.[0]?.meta;
    if (m?.regularMarketPrice == null) { console.log(`  ${symbol}.${exchange}: no price`); continue; }
    const price = Number(m.regularMarketPrice);
    const prev = Number(m.chartPreviousClose ?? m.previousClose ?? price);
    await admin
      .from('securities')
      .update({ last_price: price, prev_close: prev, last_price_at: new Date().toISOString() })
      .eq('id', id);
    console.log(`  ${symbol}.${exchange}: ₹${price}`);
    updated++;
  } catch (e) {
    console.log(`  ${symbol}.${exchange}: error ${e.message}`);
  }
}
console.log(`Updated ${updated} of ${rows.length} held stocks.`);
