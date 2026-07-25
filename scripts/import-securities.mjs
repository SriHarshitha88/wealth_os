// Loads the real NSE equity list (with full company names) from Twelve Data
// into the `securities` table. No broker account needed — just an API key.
//
// Run:  npm run import:securities
// (reads keys from .env.local via Node's --env-file flag)

import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

// Node < 22 has no global WebSocket, which the Supabase client expects.
if (!globalThis.WebSocket) globalThis.WebSocket = ws;

const KEY = process.env.TWELVEDATA_API_KEY;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

console.log('Downloading NSE symbol list from Twelve Data…');
const res = await fetch(`https://api.twelvedata.com/stocks?country=India&exchange=NSE&apikey=${KEY}`);
const json = await res.json();
const data = json?.data ?? [];

if (data.length === 0) {
  console.error('No symbols returned. Check TWELVEDATA_API_KEY in .env.local. Response:', json);
  process.exit(1);
}

// De-duplicate by symbol.
const seen = new Set();
const rows = [];
for (const s of data) {
  if (seen.has(s.symbol)) continue;
  if (/TEST/i.test(s.symbol) || /TEST/i.test(s.name || '')) continue; // drop exchange test instruments
  seen.add(s.symbol);
  rows.push({ symbol: s.symbol, name: s.name || s.symbol, exchange: 'NSE' });
}
console.log(`Found ${rows.length} NSE stocks. Upserting…`);

for (let i = 0; i < rows.length; i += 1000) {
  const batch = rows.slice(i, i + 1000);
  const { error } = await supabase.from('securities').upsert(batch, { onConflict: 'exchange,symbol' });
  if (error) {
    console.error('Upsert failed:', error.message);
    process.exit(1);
  }
  console.log(`  ${Math.min(i + 1000, rows.length)} / ${rows.length}`);
}
console.log('Done. The stock picker is now backed by real NSE names + tickers.');
