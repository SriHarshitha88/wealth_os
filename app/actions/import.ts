'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { parsePortfolioWorkbook } from '@/lib/portfolio-import';
import { computePosition } from '@/lib/portfolio-calc';
import { revalidatePath } from 'next/cache';

// Import a whole portfolio for one client from an uploaded Excel sheet.
// Works for a holdings summary (one Buy per stock) OR a tradebook (one row per
// trade, each with its own date & buy/sell) — transactions are the source of
// truth and holdings are recomputed from them via FIFO.
export async function importPortfolio(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const file = formData.get('file');
  const clientName = String(formData.get('clientName') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const tier = String(formData.get('tier') ?? 'Silver');
  const purchaseDate = String(formData.get('purchaseDate') ?? '').trim(); // fallback yyyy-mm-dd

  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Please choose an Excel (.xlsx) file.' };
  if (!clientName || !phone) return { ok: false, error: 'Client name and phone are required.' };

  let parsed;
  try {
    parsed = await parsePortfolioWorkbook(await file.arrayBuffer());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not read the Excel file.' };
  }
  const { rows, mode } = parsed;

  // 1) find-or-create client
  let clientId: string;
  // Match an existing client by phone within the firm (RLS scopes the read to
  // the advisor's firm), so a firm-mate's client isn't duplicated.
  const { data: existing } = await supabase
    .from('clients').select('id').eq('phone', phone).maybeSingle();
  if (existing) {
    clientId = existing.id;
  } else {
    const { data: created, error: cErr } = await supabase
      .from('clients').insert({ advisor_id: user.id, name: clientName, phone, tier }).select('id').single();
    if (cErr || !created) return { ok: false, error: cErr?.message ?? 'Could not create the client.' };
    clientId = created.id;
  }

  // 2) upsert securities (service role), preserving any existing live price when the sheet has none
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const now = new Date().toISOString();
  const uniq = new Map<string, { name: string; cmp: number | null; prev: number | null }>();
  for (const r of rows) {
    const cur = uniq.get(r.symbol);
    if (!cur) uniq.set(r.symbol, { name: r.name, cmp: r.cmp, prev: r.prev });
    else if (cur.cmp == null && r.cmp != null) { cur.cmp = r.cmp; cur.prev = r.prev; }
  }
  const symbols = [...uniq.keys()];
  const { data: existingSecs } = await admin
    .from('securities').select('id, symbol, last_price, prev_close').eq('exchange', 'NSE').in('symbol', symbols);
  const exMap = new Map((existingSecs ?? []).map((s) => [s.symbol, s]));
  const secRows = [...uniq].map(([symbol, v]) => {
    const ex = exMap.get(symbol);
    const last_price = v.cmp ?? ex?.last_price ?? null;
    const prev_close = v.prev ?? ex?.prev_close ?? null;
    return { symbol, name: v.name, exchange: 'NSE', last_price, prev_close, last_price_at: last_price != null ? now : null };
  });
  const { data: secs, error: secErr } = await admin
    .from('securities').upsert(secRows, { onConflict: 'exchange,symbol' }).select('id, symbol');
  if (secErr) return { ok: false, error: `Could not save securities: ${secErr.message}` };
  const sym2id = new Map((secs ?? []).map((s) => [s.symbol, s.id]));

  // 3) one transaction per row (its own date/side, or the fallback date)
  const fallbackTs = purchaseDate ? new Date(`${purchaseDate}T00:00:00+05:30`).toISOString() : now;
  const txnRows = rows.flatMap((r) => {
    const sid = sym2id.get(r.symbol);
    if (!sid) return [];
    const traded = r.date ? new Date(`${r.date}T00:00:00+05:30`).toISOString() : fallbackTs;
    return [{
      client_id: clientId, security_id: sid, side: r.side,
      quantity: r.qty, price: r.avg, traded_at: traded,
      note: mode === 'tradebook' ? 'Imported trade' : 'Imported holding',
    }];
  });
  if (!txnRows.length) return { ok: false, error: 'Nothing to import after matching securities.' };
  const { error: tErr } = await supabase.from('transactions').insert(txnRows);
  if (tErr) return { ok: false, error: `Could not save transactions: ${tErr.message}` };

  // 4) recompute holdings for every affected security from the full ledger (FIFO)
  const secIds = [...new Set(txnRows.map((t) => t.security_id))];
  const { data: allTxns } = await supabase
    .from('transactions').select('security_id, side, quantity, price, traded_at')
    .eq('client_id', clientId).in('security_id', secIds);
  const bySec = new Map<number, typeof allTxns>();
  for (const t of allTxns ?? []) {
    const arr = bySec.get(t.security_id) ?? [];
    arr.push(t); bySec.set(t.security_id, arr);
  }
  const holdUpserts: { client_id: string; security_id: number; quantity: number; avg_price: number }[] = [];
  const holdDeletes: number[] = [];
  for (const sid of secIds) {
    const pos = computePosition(bySec.get(sid) ?? []);
    if (pos.qty > 1e-9) holdUpserts.push({ client_id: clientId, security_id: sid, quantity: pos.qty, avg_price: pos.avgCost });
    else holdDeletes.push(sid);
  }
  if (holdUpserts.length) await supabase.from('holdings').upsert(holdUpserts, { onConflict: 'client_id,security_id' });
  for (const sid of holdDeletes) await supabase.from('holdings').delete().eq('client_id', clientId).eq('security_id', sid);

  revalidatePath('/clients');
  revalidatePath('/dashboard');
  revalidatePath('/portfolios');
  revalidatePath('/fees');
  revalidatePath('/stocks/[symbol]', 'page');
  revalidatePath(`/clients/${clientId}`);
  return { ok: true, count: holdUpserts.length, trades: txnRows.length, mode, clientId };
}
