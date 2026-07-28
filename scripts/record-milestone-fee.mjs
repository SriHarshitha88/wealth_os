// Record a historical performance-fee milestone that was billed offline.
//   node --env-file=.env.local scripts/record-milestone-fee.mjs "<Client>" <bandLevel> <YYYY-MM-DD>
// Sets the client's capital snapshot (= current invested) and inserts the
// Collected fee for that 20% band, tagged PF-L<level> so the engine knows it's done.

import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
if (!globalThis.WebSocket) globalThis.WebSocket = ws;

const [, , clientName, levelArg, dateArg] = process.argv;
const level = Number(levelArg);
const BAND_RATES = [5, 10, 12.5, 15, 25];
if (!clientName || !(level >= 1 && level <= 5) || !/^\d{4}-\d{2}-\d{2}$/.test(dateArg || '')) {
  console.error('Usage: record-milestone-fee.mjs "<Client>" <1-5> <YYYY-MM-DD>');
  process.exit(1);
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: client } = await admin.from('clients').select('id,name').eq('name', clientName).maybeSingle();
if (!client) { console.error(`Client "${clientName}" not found.`); process.exit(1); }

// capital = current invested (cost basis of holdings)
const { data: hold } = await admin.from('holdings').select('quantity, avg_price').eq('client_id', client.id);
const capital = (hold ?? []).reduce((a, h) => a + Number(h.quantity) * Number(h.avg_price), 0);
if (!(capital > 0)) { console.error('Client has no holdings / invested capital.'); process.exit(1); }

// fee for this single band = rate × (20% of capital)
const bandValue = 0.2 * capital;
const fee = Math.round(BAND_RATES[level - 1] / 100 * bandValue * 100) / 100;
const paidAt = new Date(`${dateArg}T12:00:00+05:30`).toISOString();
const ts = 1_700_000_000_000 + level; // deterministic-ish suffix (no Date.now needed)

// idempotency: skip if a PF-L<level> already recorded for this client
const { data: existing } = await admin.from('fees').select('id, invoice_no').eq('client_id', client.id).like('invoice_no', `PF-L${level}-%`);
if (existing && existing.length) { console.log(`Already recorded (${existing[0].invoice_no}). Nothing to do.`); process.exit(0); }

await admin.from('fee_marks').upsert({ client_id: client.id, last_basis: capital, updated_at: new Date(paidAt).toISOString() }, { onConflict: 'client_id' });
const { error } = await admin.from('fees').insert({
  client_id: client.id, amount: fee, status: 'Collected',
  due_date: dateArg, invoice_no: `PF-L${level}-${ts}`, paid_at: paidAt,
});
if (error) { console.error('insert failed:', error.message); process.exit(1); }

console.log(`Recorded ${client.name}: +${level * 20}% milestone @ ${BAND_RATES[level - 1]}% on capital ${Math.round(capital).toLocaleString('en-IN')} = fee ₹${fee.toLocaleString('en-IN')} paid ${dateArg}.`);
