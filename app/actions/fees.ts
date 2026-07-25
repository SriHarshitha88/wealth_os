'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

function rel(x: any) {
  return Array.isArray(x) ? x[0] : x;
}

async function currentValue(supabase: any, clientId: string) {
  const { data } = await supabase
    .from('holdings')
    .select('quantity, avg_price, securities(last_price)')
    .eq('client_id', clientId);
  let current = 0;
  let invested = 0;
  for (const h of data ?? []) {
    const sec = rel(h.securities);
    invested += Number(h.quantity) * Number(h.avg_price);
    if (sec?.last_price != null) current += Number(h.quantity) * Number(sec.last_price);
  }
  return { current, invested };
}

// Charge a performance fee when the portfolio has crossed its high-water trigger,
// then reset the basis to the new high-water mark so the client is never double-charged.
export async function raiseFee(clientId: string) {
  const supabase = await createClient();

  const { current, invested } = await currentValue(supabase, clientId);

  const { data: mark } = await supabase
    .from('fee_marks')
    .select('last_basis, step_pct, fee_rate')
    .eq('client_id', clientId)
    .maybeSingle();

  const basis = mark ? Number(mark.last_basis) : invested;
  const step = mark ? Number(mark.step_pct) : 20;
  const rate = mark ? Number(mark.fee_rate) : 15;
  const trigger = basis * (1 + step / 100);

  if (current < trigger) {
    return { ok: false, error: 'Portfolio has not crossed the fee trigger yet.' };
  }

  const feeAmount = Math.round((rate / 100) * (current - basis) * 100) / 100;

  const { error: fErr } = await supabase.from('fees').insert({
    client_id: clientId,
    amount: feeAmount,
    status: 'Collected',
    due_date: new Date().toISOString().slice(0, 10),
    invoice_no: 'PF-' + Date.now(),
    paid_at: new Date().toISOString(),
  });
  if (fErr) return { ok: false, error: fErr.message };

  // Reset the high-water mark to the current value.
  const { error: mErr } = await supabase
    .from('fee_marks')
    .upsert({ client_id: clientId, last_basis: current, step_pct: step, fee_rate: rate, updated_at: new Date().toISOString() }, { onConflict: 'client_id' });
  if (mErr) return { ok: false, error: mErr.message };

  revalidatePath('/fees');
  revalidatePath('/dashboard');
  return { ok: true, amount: feeAmount };
}
