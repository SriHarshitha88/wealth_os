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
    .select('security_id, securities(symbol, exchange)');

  const key = (symbol: string, exchange: string) => `${exchange}:${symbol}`;
  const idByKey = new Map<string, number>();
  const inputs: { symbol: string; exchange: string }[] = [];
  for (const row of held ?? []) {
    const rel = (row as any).securities;
    const sec = Array.isArray(rel) ? rel[0] : rel;
    if (!sec?.symbol) continue;
    const exchange = sec.exchange ?? 'NSE';
    const k = key(sec.symbol, exchange);
    if (idByKey.has(k)) continue;
    idByKey.set(k, (row as any).security_id);
    inputs.push({ symbol: sec.symbol, exchange });
  }
  if (inputs.length === 0) {
    return NextResponse.json({ updated: 0, note: 'no held securities yet' });
  }

  try {
    const now = new Date().toISOString();
    let updated = 0;
    // Chunk into batches of 50 symbols per request.
    for (let i = 0; i < inputs.length; i += 50) {
      const quotes = await getQuotes(inputs.slice(i, i + 50));
      for (const q of quotes) {
        const id = idByKey.get(key(q.symbol, q.exchange));
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
