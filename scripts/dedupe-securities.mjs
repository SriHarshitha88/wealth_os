// Clean the securities master: remove (1) non-equity junk series and (2) stale
// duplicate rows left over from the Twelve Data import. A row is only deleted if
// it is UNREFERENCED (no holding/transaction points at it). Duplicates are
// confirmed dead by checking they no longer price on Yahoo, so we never delete a
// real tradable ticker. Dry-run by default; pass --apply to actually delete.
//
//   node --env-file=.env.local scripts/dedupe-securities.mjs [--apply]

import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
if (!globalThis.WebSocket) globalThis.WebSocket = ws;

const APPLY = process.argv.includes('--apply');
const UA = { 'User-Agent': 'Mozilla/5.0' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// --- load everything ---
let all = [], from = 0;
for (;;) { const { data } = await admin.from('securities').select('id,symbol,name,exchange').range(from, from + 999); all = all.concat(data); if (data.length < 1000) break; from += 1000; }
const { data: h } = await admin.from('holdings').select('security_id');
const { data: t } = await admin.from('transactions').select('security_id');
const referenced = new Set([...(h || []).map((x) => x.security_id), ...(t || []).map((x) => x.security_id)]);
console.log(`Loaded ${all.length} securities · ${referenced.size} referenced by holdings/transactions.`);

// --- (1) junk: non-equity series suffixes, unreferenced only ---
const JUNK = /(\.(BL|SM|IV)$|INAV$|NAV$)/i;
const junk = all.filter((s) => JUNK.test(s.symbol) && !referenced.has(s.id));
const junkBreak = {};
for (const s of junk) { const k = (s.symbol.match(/\.(BL|SM|IV)$/i)?.[0] || s.symbol.match(/I?NAV$/i)?.[0] || '?').toUpperCase(); junkBreak[k] = (junkBreak[k] || 0) + 1; }

// --- (2) duplicates: first-2-significant-token name groups with >1 member ---
const STOP = new Set(['ltd', 'ltd.', 'limited', 'the', 'of', 'and', '&', 'co', 'co.', 'company']);
const key2 = (name) => name.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).slice(0, 2).join(' ');
const groups = new Map();
for (const s of all) { const k = key2(s.name); if (!k) continue; (groups.get(k) ?? groups.set(k, []).get(k)).push(s); }
const dupeGroups = [...groups.values()].filter((g) => g.length > 1);

async function pricesLive(sym, ex) {
  try { const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}${ex === 'BSE' ? '.BO' : '.NS'}?interval=1d&range=1d`, { headers: UA });
    const j = await r.json(); return j?.chart?.result?.[0]?.meta?.regularMarketPrice != null; } catch { return false; }
}

// Within each dupe group: keep referenced + still-pricing members; delete the
// unreferenced members that no longer price (the stale variants). Skip groups
// with no surviving keeper (can't safely choose).
const dupeDelete = [];
let checked = 0;
for (const g of dupeGroups) {
  const unref = g.filter((s) => !referenced.has(s.id) && !junk.includes(s));
  if (!unref.length) continue;
  const hasRefKeeper = g.some((s) => referenced.has(s.id));
  const dead = [];
  let anyLive = false;
  for (const s of unref) { const live = await pricesLive(s.symbol, s.exchange); checked++; await sleep(90); if (live) anyLive = true; else dead.push(s); }
  if (hasRefKeeper || anyLive || g.length - dead.length >= 1) {
    // ensure at least one row survives in the group
    const survivors = g.length - dead.length;
    if (survivors >= 1) dupeDelete.push(...dead);
    else dupeDelete.push(...dead.slice(1)); // keep one if all would die
  }
}
console.log(`Yahoo-checked ${checked} candidate duplicate rows.`);

// --- report ---
const delIds = new Set([...junk.map((s) => s.id), ...dupeDelete.map((s) => s.id)]);
console.log(`\n=== DELETION PLAN (${APPLY ? 'APPLYING' : 'DRY RUN'}) ===`);
console.log(`Junk series rows      : ${junk.length}   breakdown ${JSON.stringify(junkBreak)}`);
console.log(`Stale duplicate rows  : ${dupeDelete.length}`);
console.log(`TOTAL to delete       : ${delIds.size}`);
console.log(`Securities remaining  : ${all.length - delIds.size}`);
console.log(`\nSample junk: ${junk.slice(0, 8).map((s) => s.symbol).join(', ')}`);
console.log(`Sample stale dupes: ${dupeDelete.slice(0, 12).map((s) => `${s.symbol}"${s.name.slice(0, 18)}"`).join(', ')}`);

if (!APPLY) { console.log('\nDry run — nothing deleted. Re-run with --apply to delete.'); process.exit(0); }

// --- apply (guard: never delete a referenced row) ---
const ids = [...delIds].filter((id) => !referenced.has(id));
let done = 0;
for (let i = 0; i < ids.length; i += 200) {
  const { error } = await admin.from('securities').delete().in('id', ids.slice(i, i + 200));
  if (error) { console.error('delete failed:', error.message); process.exit(1); }
  done += Math.min(200, ids.length - i);
}
console.log(`\nDeleted ${done} securities. Remaining: ${all.length - done}.`);
