import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { searchSecurities, getQuotes } from '@/lib/marketdata';

// Self-heal the securities universe. When the local table has no match for what
// an advisor typed, resolve it against Yahoo, keep only tickers that actually
// price, and upsert them as canonical rows — so next time they're already there
// and Twelve Data's aging snapshot stops mattering. Signed-in advisors only
// (middleware); the service role is needed to write the shared securities table.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const hits = (await searchSecurities(q)).slice(0, 8);
  if (hits.length === 0) return NextResponse.json({ results: [] });

  const quotes = await getQuotes(hits.map((h) => ({ symbol: h.symbol, exchange: h.exchange })));
  const priced = new Map(quotes.map((quote) => [`${quote.exchange}:${quote.symbol}`, quote]));

  const now = new Date().toISOString();
  const rows = hits
    .map((h) => {
      const quote = priced.get(`${h.exchange}:${h.symbol}`);
      return quote
        ? { symbol: h.symbol, name: h.name, exchange: h.exchange, last_price: quote.price, prev_close: quote.prevClose, last_price_at: now }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length === 0) return NextResponse.json({ results: [] });

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await admin
    .from('securities')
    .upsert(rows, { onConflict: 'exchange,symbol' })
    .select('id, symbol, name, exchange, last_price');
  if (error) return NextResponse.json({ results: [], error: error.message }, { status: 502 });
  return NextResponse.json({ results: data ?? [] });
}
