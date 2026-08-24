'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getQuotes } from '@/lib/marketdata';
import { computePosition } from '@/lib/portfolio-calc';
import { revalidatePath } from 'next/cache';

// Any trade changes holdings, so every view that reads them must be revalidated —
// including /fees and /portfolios (previously missed, so fees looked stale).
function revalidateBook(clientId?: string) {
  revalidatePath('/dashboard');
  revalidatePath('/clients');
  revalidatePath('/portfolios');
  revalidatePath('/fees');
  revalidatePath('/stocks/[symbol]', 'page');
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

export type TxnInput = {
  clientName: string;
  phone: string;
  email?: string;
  securityId: number;
  side: 'Buy' | 'Sell';
  quantity: number;
  price: number;
  tradedAt?: string; // yyyy-mm-dd (IST); defaults to now
};

// Rebuild a client's holding for one security by replaying its transactions (FIFO).
// Holdings are always derived — never edited directly — so any add/edit/delete/import
// funnels through here to keep quantity + average cost correct.
async function recomputeHolding(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  securityId: number,
) {
  const { data: txns } = await supabase
    .from('transactions')
    .select('side, quantity, price, traded_at')
    .eq('client_id', clientId)
    .eq('security_id', securityId);

  const pos = computePosition(txns ?? []);
  const { data: h } = await supabase
    .from('holdings')
    .select('id')
    .eq('client_id', clientId)
    .eq('security_id', securityId)
    .maybeSingle();

  if (pos.qty > 1e-9) {
    if (h) await supabase.from('holdings').update({ quantity: pos.qty, avg_price: pos.avgCost }).eq('id', h.id);
    else await supabase.from('holdings').insert({ client_id: clientId, security_id: securityId, quantity: pos.qty, avg_price: pos.avgCost });
  } else if (h) {
    // fully exited — remove the open holding (realised P/L still lives in the ledger)
    await supabase.from('holdings').delete().eq('id', h.id);
  }
}

// Best-effort live price refresh so P/L shows immediately (cron catches up otherwise).
async function refreshSecurityPrice(supabase: Awaited<ReturnType<typeof createClient>>, securityId: number) {
  try {
    const { data: sec } = await supabase.from('securities').select('symbol, exchange').eq('id', securityId).single();
    if (!sec?.symbol) return;
    const [q] = await getQuotes([{ symbol: sec.symbol, exchange: sec.exchange ?? undefined }]);
    if (!q) return;
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await admin
      .from('securities')
      .update({ last_price: q.price, prev_close: q.prevClose, last_price_at: new Date().toISOString() })
      .eq('id', securityId);
  } catch {
    /* ignore */
  }
}

function tradedTs(tradedAt?: string) {
  return tradedAt ? new Date(`${tradedAt}T00:00:00+05:30`).toISOString() : new Date().toISOString();
}

// Guard a trade: positive quantity, non-negative price, and no overselling.
async function validateTrade(supabase: any, clientId: string, securityId: number, side: string, quantity: number, price: number): Promise<string | null> {
  if (!(quantity > 0)) return 'Quantity must be greater than zero.';
  if (!(price >= 0)) return 'Price must be zero or more.';
  if (side === 'Sell') {
    const { data: h } = await supabase.from('holdings').select('quantity').eq('client_id', clientId).eq('security_id', securityId).maybeSingle();
    const held = h ? Number(h.quantity) : 0;
    if (quantity > held + 1e-9) return `Cannot sell ${quantity.toLocaleString('en-IN')} — the client holds only ${held.toLocaleString('en-IN')}.`;
  }
  return null;
}

export async function recordTransaction(input: TxnInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  if (!input.clientName || !input.phone) return { ok: false, error: 'Client name and phone are required.' };
  if (!input.securityId) return { ok: false, error: 'Please pick a stock.' };

  // find-or-create client by phone within this advisor's book
  let clientId: string;
  // Match by phone within the firm (RLS scopes the read), so a firm-mate's
  // client isn't duplicated when another advisor records a trade.
  const { data: existing } = await supabase
    .from('clients').select('id').eq('phone', input.phone).maybeSingle();
  if (existing) {
    clientId = existing.id;
  } else {
    const { data: created, error: cErr } = await supabase
      .from('clients')
      .insert({ advisor_id: user.id, name: input.clientName, phone: input.phone, email: input.email ?? null })
      .select('id').single();
    if (cErr || !created) return { ok: false, error: cErr?.message ?? 'Could not create client.' };
    clientId = created.id;
  }

  const vErr = await validateTrade(supabase, clientId, input.securityId, input.side, input.quantity, input.price);
  if (vErr) return { ok: false, error: vErr };

  const { error: tErr } = await supabase.from('transactions').insert({
    client_id: clientId,
    security_id: input.securityId,
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    traded_at: tradedTs(input.tradedAt),
  });
  if (tErr) return { ok: false, error: tErr.message };

  await recomputeHolding(supabase, clientId, input.securityId);
  await refreshSecurityPrice(supabase, input.securityId);

  revalidateBook(clientId);
  return { ok: true };
}

// Add a Buy/Sell to an existing client (used from the client's transaction ledger).
export async function addTransaction(input: {
  clientId: string; securityId: number; side: 'Buy' | 'Sell'; quantity: number; price: number; tradedAt?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  if (!input.securityId) return { ok: false, error: 'Please pick a stock.' };
  const vErr = await validateTrade(supabase, input.clientId, input.securityId, input.side, input.quantity, input.price);
  if (vErr) return { ok: false, error: vErr };

  const { error } = await supabase.from('transactions').insert({
    client_id: input.clientId,
    security_id: input.securityId,
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    traded_at: tradedTs(input.tradedAt),
  });
  if (error) return { ok: false, error: error.message };

  await recomputeHolding(supabase, input.clientId, input.securityId);
  await refreshSecurityPrice(supabase, input.securityId);
  revalidateBook(input.clientId);
  return { ok: true };
}

export async function updateTransaction(input: {
  id: string; side?: 'Buy' | 'Sell'; quantity: number; price: number; tradedAt?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: txn } = await supabase
    .from('transactions').select('client_id, security_id').eq('id', input.id).maybeSingle();
  if (!txn) return { ok: false, error: 'Transaction not found.' };

  const patch: Record<string, unknown> = { quantity: input.quantity, price: input.price };
  if (input.side) patch.side = input.side;
  if (input.tradedAt) patch.traded_at = tradedTs(input.tradedAt);

  const { error } = await supabase.from('transactions').update(patch).eq('id', input.id);
  if (error) return { ok: false, error: error.message };

  await recomputeHolding(supabase, txn.client_id, txn.security_id);
  revalidateBook(txn.client_id);
  return { ok: true };
}

// Record a sale of one security across many clients at once (e.g. the advisor
// exits a model-portfolio position). One Sell per client; holdings recomputed
// (FIFO books realised P/L, fully-exited positions drop off).
export async function sellForAllHolders(input: {
  securityId: number;
  price: number;
  date?: string;
  sells: { clientId: string; quantity: number }[];
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  if (!input.securityId) return { ok: false, error: 'Missing stock.' };
  if (!(input.price >= 0)) return { ok: false, error: 'Enter a valid sale price.' };

  const requested = (input.sells ?? []).filter((s) => s.clientId && s.quantity > 0);
  if (!requested.length) return { ok: false, error: 'Nothing to sell — set a quantity for at least one client.' };

  // Clamp each client's sell to what they actually hold (no overselling).
  const { data: hs } = await supabase.from('holdings').select('client_id, quantity')
    .eq('security_id', input.securityId).in('client_id', requested.map((s) => s.clientId));
  const heldBy = new Map((hs ?? []).map((h: any) => [h.client_id, Number(h.quantity)]));
  const list = requested
    .map((s) => ({ clientId: s.clientId, quantity: Math.min(s.quantity, heldBy.get(s.clientId) ?? 0) }))
    .filter((s) => s.quantity > 1e-9);
  if (!list.length) return { ok: false, error: 'Nothing to sell — the quantities exceed current holdings.' };

  const traded = tradedTs(input.date);
  const rows = list.map((s) => ({
    client_id: s.clientId, security_id: input.securityId, side: 'Sell' as const,
    quantity: s.quantity, price: input.price, traded_at: traded, note: 'Bulk sale',
  }));
  const { error } = await supabase.from('transactions').insert(rows);
  if (error) return { ok: false, error: error.message };

  for (const s of list) await recomputeHolding(supabase, s.clientId, input.securityId);
  await refreshSecurityPrice(supabase, input.securityId);

  revalidateBook();
  for (const s of list) revalidatePath(`/clients/${s.clientId}`);
  return { ok: true, count: list.length };
}

export async function deleteTransaction(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: txn } = await supabase
    .from('transactions').select('client_id, security_id').eq('id', id).maybeSingle();
  if (!txn) return { ok: false, error: 'Transaction not found.' };

  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  await recomputeHolding(supabase, txn.client_id, txn.security_id);
  revalidateBook(txn.client_id);
  return { ok: true };
}
