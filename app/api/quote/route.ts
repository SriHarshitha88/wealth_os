import { NextResponse, type NextRequest } from 'next/server';
import { getQuotes } from '@/lib/marketdata';

// Live current price for one stock (used to auto-fill the transaction form).
// Protected by middleware — only signed-in advisors reach it.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol');
  const exchange = request.nextUrl.searchParams.get('exchange') || undefined;
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    const [q] = await getQuotes([{ symbol, exchange }]);
    return NextResponse.json({ price: q?.price ?? null, prevClose: q?.prevClose ?? null });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, price: null }, { status: 502 });
  }
}
