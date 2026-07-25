'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getQuotes } from '@/lib/marketdata';
import { revalidatePath } from 'next/cache';

export type TxnInput = {
  clientName: string;
  phone: string;
  email?: string;
  securityId: number;
  side: 'Buy' | 'Sell';
  quantity: number;
  price: number;
};

export async function recordTransaction(input: TxnInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  if (!input.clientName || !input.phone) return { ok: false, error: 'Client name and phone are required.' };
  if (!input.securityId) return { ok: false, error: 'Please pick a stock.' };

  // 1) Find the client by phone within this advisor's book, or create them.
  let clientId: string;
  const { data: existing } = await supabase
    .from('clients')
    .select('id')
    .eq('advisor_id', user.id)
    .eq('phone', input.phone)
    .maybeSingle();

  if (existing) {
    clientId = existing.id;
  } else {
    const { data: created, error: cErr } = await supabase
      .from('clients')
      .insert({ advisor_id: user.id, name: input.clientName, phone: input.phone, email: input.email ?? null })
      .select('id')
      .single();
    if (cErr || !created) return { ok: false, error: cErr?.message ?? 'Could not create client.' };
    clientId = created.id;
  }

  // 2) Record the transaction (the source of truth).
  const { error: tErr } = await supabase.from('transactions').insert({
    client_id: clientId,
    security_id: input.securityId,
    side: input.side,
    quantity: input.quantity,
    price: input.price,
  });
  if (tErr) return { ok: false, error: tErr.message };

  // 3) Recompute the holding (average-cost method).
  const { data: h } = await supabase
    .from('holdings')
    .select('id, quantity, avg_price')
    .eq('client_id', clientId)
    .eq('security_id', input.securityId)
    .maybeSingle();

  if (input.side === 'Buy') {
    if (h) {
      const newQty = Number(h.quantity) + input.quantity;
      const newAvg = (Number(h.quantity) * Number(h.avg_price) + input.quantity * input.price) / newQty;
      await supabase.from('holdings').update({ quantity: newQty, avg_price: newAvg }).eq('id', h.id);
    } else {
      await supabase.from('holdings').insert({
        client_id: clientId,
        security_id: input.securityId,
        quantity: input.quantity,
        avg_price: input.price,
      });
    }
  } else if (h) {
    const newQty = Number(h.quantity) - input.quantity;
    if (newQty <= 0) await supabase.from('holdings').delete().eq('id', h.id);
    else await supabase.from('holdings').update({ quantity: newQty }).eq('id', h.id); // avg unchanged on sell
  }

  // 4) Refresh this security's current price so P/L shows immediately.
  // (securities is service-role-writable only, so use an admin client here.)
  try {
    const { data: sec } = await supabase
      .from('securities')
      .select('symbol')
      .eq('id', input.securityId)
      .single();
    if (sec?.symbol) {
      const [q] = await getQuotes([sec.symbol]);
      if (q) {
        const admin = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
        await admin
          .from('securities')
          .update({ last_price: q.price, prev_close: q.prevClose, last_price_at: new Date().toISOString() })
          .eq('id', input.securityId);
      }
    }
  } catch {
    // price refresh is best-effort; the scheduled cron will catch up
  }

  revalidatePath('/dashboard');
  revalidatePath('/clients');
  return { ok: true };
}
