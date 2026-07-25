'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function deleteClients(ids: string[]) {
  if (!ids.length) return { ok: true };
  const supabase = await createClient();
  // RLS ensures an advisor can only delete their own clients.
  // Holdings, transactions and fees cascade automatically (see schema.sql).
  const { error } = await supabase.from('clients').delete().in('id', ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/clients');
  revalidatePath('/dashboard');
  revalidatePath('/portfolios');
  return { ok: true };
}
