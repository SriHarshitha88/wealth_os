'use server';

import { createClient } from '@/lib/supabase/server';
import { computeFee, deriveState, BAND_RATES, BAND_STEP, ABOVE_RATE } from '@/lib/fee-schedule';
import { revalidatePath } from 'next/cache';

function rel(x: any) {
  return Array.isArray(x) ? x[0] : x;
}
const r2 = (n: number) => Math.round(n * 100) / 100;

async function currentValue(supabase: any, clientId: string) {
  const { data } = await supabase
    .from('holdings')
    .select('quantity, avg_price, securities(last_price)')
    .eq('client_id', clientId);
  let current = 0, invested = 0;
  for (const h of data ?? []) {
    const sec = rel(h.securities);
    invested += Number(h.quantity) * Number(h.avg_price);
    if (sec?.last_price != null) current += Number(h.quantity) * Number(sec.last_price);
  }
  return { current, invested };
}

// Shared context: capital snapshot, how far the ledger says we've billed, and the calc.
async function feeContext(supabase: any, clientId: string) {
  const { current, invested } = await currentValue(supabase, clientId);
  // Capital = net invested (tracks deposits/withdrawals) — NOT a frozen snapshot,
  // so new principal isn't mistaken for appreciation. Billed bands come from the
  // fee ledger, so re-billing is still prevented.
  const capital = invested;
  const { data: feeRows } = await supabase.from('fees').select('invoice_no, amount, status').eq('client_id', clientId);
  const { chargedBands, aboveSettled } = deriveState(feeRows ?? [], capital);
  const calc = computeFee({ capital, current, chargedBands, aboveSettled });
  return { current, invested, capital, chargedBands, aboveSettled, calc };
}

async function pinCapital(supabase: any, clientId: string, capital: number, whenIso: string) {
  await supabase.from('fee_marks').upsert(
    { client_id: clientId, last_basis: capital, updated_at: whenIso },
    { onConflict: 'client_id' },
  );
}

// Bill every appreciation milestone the portfolio has crossed but not yet been
// charged for — one ledger row per band — plus any flat 25% owed above +100%.
// `paidDate` (yyyy-mm-dd, IST) lets you backfill; defaults to today.
export async function raiseFee(clientId: string, paidDate?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { capital, chargedBands, calc } = await feeContext(supabase, clientId);
  if (calc.feeDue <= 0) return { ok: false, error: 'No new appreciation milestone has been crossed yet.' };

  const day = paidDate && /^\d{4}-\d{2}-\d{2}$/.test(paidDate) ? paidDate : new Date().toISOString().slice(0, 10);
  const paidAt = new Date(`${day}T12:00:00+05:30`).toISOString();
  const bandValue = 0.2 * capital;

  const rows: Record<string, unknown>[] = [];
  for (let level = chargedBands + 1; level <= calc.reachedBands; level++) {
    rows.push({
      client_id: clientId, amount: r2((BAND_RATES[level - 1] / 100) * bandValue), status: 'Collected',
      due_date: day, invoice_no: `PF-L${level}-${Date.now()}-${level}`, paid_at: paidAt,
    });
  }
  if (calc.aboveDue > 0) {
    rows.push({
      client_id: clientId, amount: calc.aboveDue, status: 'Collected',
      due_date: day, invoice_no: `PF-ABOVE-${Date.now()}`, paid_at: paidAt,
    });
  }
  const { error } = await supabase.from('fees').insert(rows);
  if (error) return { ok: false, error: error.message };
  await pinCapital(supabase, clientId, capital, paidAt);

  revalidatePath('/fees'); revalidatePath('/dashboard');
  return { ok: true, amount: calc.feeDue };
}

// Record ONE milestone as paid on a specific date (backfilling offline payments,
// e.g. a fee collected last month). Milestones must be settled in order.
export async function recordMilestone(clientId: string, level: number, dateStr: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  if (!(Number.isInteger(level) && level >= 1 && level <= BAND_RATES.length)) return { ok: false, error: 'Invalid milestone.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { ok: false, error: 'Please pick a valid date.' };

  const { capital, chargedBands, calc } = await feeContext(supabase, clientId);
  if (!(capital > 0)) return { ok: false, error: 'Client has no invested capital yet.' };
  if (level <= chargedBands) return { ok: false, error: `The +${level * BAND_STEP}% milestone is already billed.` };
  if (level !== chargedBands + 1) return { ok: false, error: `Bill the +${(chargedBands + 1) * BAND_STEP}% milestone first — milestones are settled in order.` };
  if (level > calc.reachedBands) return { ok: false, error: `The portfolio hasn't crossed +${level * BAND_STEP}% yet.` };

  const fee = r2((BAND_RATES[level - 1] / 100) * (0.2 * capital));
  const paidAt = new Date(`${dateStr}T12:00:00+05:30`).toISOString();
  const { error } = await supabase.from('fees').insert({
    client_id: clientId, amount: fee, status: 'Collected',
    due_date: dateStr, invoice_no: `PF-L${level}-${Date.now()}-${level}`, paid_at: paidAt,
  });
  if (error) return { ok: false, error: error.message };
  await pinCapital(supabase, clientId, capital, paidAt);

  revalidatePath('/fees'); revalidatePath('/dashboard');
  return { ok: true, amount: fee };
}
