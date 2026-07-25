// =====================================================================
//  Market data — split by what's free:
//   • Symbol list (names): Twelve Data /stocks (free)
//   • Live prices: Yahoo Finance chart endpoint (free, no key, no account)
//  Twelve Data's free tier blocks NSE *quotes*, so prices use Yahoo instead.
// =====================================================================

const TD_BASE = 'https://api.twelvedata.com';
const TD_KEY = () => process.env.TWELVEDATA_API_KEY!;

export type SymbolRow = { symbol: string; name: string; exchange: string };

// Full NSE equity list — used by the import script to fill the `securities` table.
export async function fetchNseSymbols(): Promise<SymbolRow[]> {
  const res = await fetch(`${TD_BASE}/stocks?country=India&exchange=NSE&apikey=${TD_KEY()}`);
  const json = await res.json();
  const data: any[] = json?.data ?? [];
  return data.map((s) => ({ symbol: s.symbol, name: s.name || s.symbol, exchange: 'NSE' }));
}

export type Quote = { symbol: string; price: number; prevClose: number };

// Live prices from Yahoo Finance. NSE tickers use the ".NS" suffix.
// One request per symbol (Yahoo's free chart endpoint), run in parallel.
export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  if (symbols.length === 0) return [];

  const results = await Promise.all(
    symbols.map(async (sym): Promise<Quote | null> => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}.NS?interval=1d&range=1d`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
        const json = await res.json();
        const meta = json?.chart?.result?.[0]?.meta;
        const price = meta?.regularMarketPrice;
        if (price == null) return null;
        const prevClose =
          meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPreviousClose ?? price;
        return { symbol: sym, price: Number(price), prevClose: Number(prevClose) };
      } catch {
        return null;
      }
    }),
  );

  return results.filter((q): q is Quote => q !== null);
}
