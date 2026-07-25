import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getQuotes } from '@/lib/marketdata';

// Scheduled by vercel.json (weekdays, market hours).
// Refreshes securities.last_price from Twelve Data for stocks clients actually hold.
// Uses the service-role key so it can write across all securities (RLS bypassed here only).
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Unique held securities only (keeps us inside the free-tier call budget).
  const { data: held } = await admin
    .from('holdings')
    .select('security_id, securities(symbol)');

  const symbolToId = new Map<string, number>();
  for (const row of held ?? []) {
    const rel = (row as any).securities;
    const sym = Array.isArray(rel) ? rel[0]?.symbol : rel?.symbol;
    if (sym) symbolToId.set(sym, (row as any).security_id);
  }
  const symbols = [...symbolToId.keys()];
  if (symbols.length === 0) {
    return NextResponse.json({ updated: 0, note: 'no held securities yet' });
  }

  try {
    const now = new Date().toISOString();
    let updated = 0;
    // Chunk into batches of 50 symbols per request.
    for (let i = 0; i < symbols.length; i += 50) {
      const quotes = await getQuotes(symbols.slice(i, i + 50));
      for (const q of quotes) {
        const id = symbolToId.get(q.symbol);
        if (!id) continue;
        await admin
          .from('securities')
          .update({ last_price: q.price, prev_close: q.prevClose, last_price_at: now })
          .eq('id', id);
        updated++;
      }
    }
    return NextResponse.json({ updated, at: now });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
