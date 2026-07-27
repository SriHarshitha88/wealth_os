'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getQuotes } from '@/lib/marketdata';
import { computePosition } from '@/lib/portfolio-calc';
import { revalidatePath } from 'next/cache';

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
    const { data: sec } = await supabase.from('securities').select('symbol').eq('id', securityId).single();
    if (!sec?.symbol) return;
    const [q] = await getQuotes([sec.symbol]);
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

export async function recordTransaction(input: TxnInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  if (!input.clientName || !input.phone) return { ok: false, error: 'Client name and phone are required.' };
  if (!input.securityId) return { ok: false, error: 'Please pick a stock.' };

  // find-or-create client by phone within this advisor's book
  let clientId: string;
  const { data: existing } = await supabase
    .from('clients').select('id').eq('advisor_id', user.id).eq('phone', input.phone).maybeSingle();
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

  revalidatePath('/dashboard');
  revalidatePath('/clients');
  revalidatePath(`/clients/${clientId}`);
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
  if (!(input.quantity > 0)) return { ok: false, error: 'Quantity must be greater than zero.' };

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
  revalidatePath('/dashboard');
  revalidatePath('/clients');
  revalidatePath(`/clients/${input.clientId}`);
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
  revalidatePath('/dashboard');
  revalidatePath('/clients');
  revalidatePath(`/clients/${txn.client_id}`);
  return { ok: true };
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
  revalidatePath('/dashboard');
  revalidatePath('/clients');
  revalidatePath(`/clients/${txn.client_id}`);
  return { ok: true };
}
