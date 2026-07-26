'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { parsePortfolioWorkbook } from '@/lib/portfolio-import';
import { revalidatePath } from 'next/cache';

// Import a whole portfolio (many stocks) for one client from an uploaded Excel sheet.
export async function importPortfolio(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const file = formData.get('file');
  const clientName = String(formData.get('clientName') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const tier = String(formData.get('tier') ?? 'Silver');
  const purchaseDate = String(formData.get('purchaseDate') ?? '').trim(); // yyyy-mm-dd

  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Please choose an Excel (.xlsx) file.' };
  if (!clientName || !phone) return { ok: false, error: 'Client name and phone are required.' };

  let rows;
  try {
    rows = await parsePortfolioWorkbook(await file.arrayBuffer());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not read the Excel file.' };
  }

  // 1) Find the client by phone within this advisor's book, or create them.
  let clientId: string;
  const { data: existing } = await supabase
    .from('clients')
    .select('id')
    .eq('advisor_id', user.id)
    .eq('phone', phone)
    .maybeSingle();

  if (existing) {
    clientId = existing.id;
  } else {
    const { data: created, error: cErr } = await supabase
      .from('clients')
      .insert({ advisor_id: user.id, name: clientName, phone, tier })
      .select('id')
      .single();
    if (cErr || !created) return { ok: false, error: cErr?.message ?? 'Could not create the client.' };
    clientId = created.id;
  }

  // 2) Upsert the securities master (service-role only writes this table).
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const now = new Date().toISOString();
  const secRows = rows.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    exchange: 'NSE',
    last_price: r.cmp,
    prev_close: r.prev,
    last_price_at: r.cmp != null ? now : null,
  }));
  const { data: secs, error: secErr } = await admin
    .from('securities')
    .upsert(secRows, { onConflict: 'exchange,symbol' })
    .select('id, symbol');
  if (secErr) return { ok: false, error: `Could not save securities: ${secErr.message}` };
  const sym2id = new Map((secs ?? []).map((s) => [s.symbol, s.id]));

  // 3) Create holdings + a Buy transaction (the source of truth) for each stock.
  const traded = purchaseDate ? new Date(`${purchaseDate}T00:00:00+05:30`).toISOString() : now;
  const holdRows: { client_id: string; security_id: number; quantity: number; avg_price: number }[] = [];
  const txnRows: Record<string, unknown>[] = [];
  for (const r of rows) {
    const sid = sym2id.get(r.symbol);
    if (!sid) continue;
    holdRows.push({ client_id: clientId, security_id: sid, quantity: r.qty, avg_price: r.avg });
    txnRows.push({
      client_id: clientId,
      security_id: sid,
      side: 'Buy',
      quantity: r.qty,
      price: r.avg,
      traded_at: traded,
      note: 'Imported from Excel',
    });
  }

  const { error: hErr } = await supabase.from('holdings').upsert(holdRows, { onConflict: 'client_id,security_id' });
  if (hErr) return { ok: false, error: `Could not save holdings: ${hErr.message}` };
  const { error: tErr } = await supabase.from('transactions').insert(txnRows);
  if (tErr) return { ok: false, error: `Could not save transactions: ${tErr.message}` };

  revalidatePath('/clients');
  revalidatePath('/dashboard');
  return { ok: true, count: holdRows.length, clientId };
}
