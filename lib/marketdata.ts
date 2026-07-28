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

export type Quote = { symbol: string; exchange: string; price: number; prevClose: number };
export type QuoteInput = string | { symbol: string; exchange?: string };

// Yahoo suffixes NSE tickers with ".NS" and BSE tickers with ".BO".
const yahooSuffix = (exchange?: string) => (exchange === 'BSE' ? '.BO' : '.NS');

// Live prices from Yahoo Finance. Accepts bare symbols (assumed NSE) or
// {symbol, exchange} so BSE-listed scrips resolve to the right ".BO" ticker.
// One request per symbol (Yahoo's free chart endpoint), run in parallel.
export async function getQuotes(inputs: QuoteInput[]): Promise<Quote[]> {
  if (inputs.length === 0) return [];

  const results = await Promise.all(
    inputs.map(async (inp): Promise<Quote | null> => {
      const symbol = typeof inp === 'string' ? inp : inp.symbol;
      const exchange = typeof inp === 'string' ? 'NSE' : inp.exchange ?? 'NSE';
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}${yahooSuffix(exchange)}?interval=1d&range=1d`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
        const json = await res.json();
        const meta = json?.chart?.result?.[0]?.meta;
        const price = meta?.regularMarketPrice;
        if (price == null) return null;
        const prevClose =
          meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPreviousClose ?? price;
        return { symbol, exchange, price: Number(price), prevClose: Number(prevClose) };
      } catch {
        return null;
      }
    }),
  );

  return results.filter((q): q is Quote => q !== null);
}

export type SearchHit = { symbol: string; name: string; exchange: string };

// Yahoo's search endpoint — resolves a name or ticker to real NSE/BSE equity
// symbols on demand, for when the local `securities` table has no match. Only
// equities on NSE (.NS) / BSE (.BO) are returned.
export async function searchSecurities(query: string): Promise<SearchHit[]> {
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' },
    );
    const json = await res.json();
    const hits: SearchHit[] = [];
    for (const q of json?.quotes ?? []) {
      if (!q?.symbol || q.quoteType !== 'EQUITY') continue;
      const m = /\.(NS|BO)$/.exec(q.symbol);
      if (!m) continue;
      hits.push({
        symbol: q.symbol.replace(/\.(NS|BO)$/, ''),
        name: q.longname || q.shortname || q.symbol,
        exchange: m[1] === 'BO' ? 'BSE' : 'NSE',
      });
    }
    return hits;
  } catch {
    return [];
  }
}
