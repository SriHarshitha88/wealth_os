// Client helper: ask the server to resolve a query against Yahoo and upsert the
// canonical securities. Used as the fallback when a local securities search
// returns nothing, so the stock universe self-heals as advisors search.
export type StockHit = { id: number; symbol: string; name: string; exchange?: string; last_price: number | null };

export async function resolveStocksLive(query: string, signal?: AbortSignal): Promise<StockHit[]> {
  try {
    const res = await fetch(`/api/resolve?q=${encodeURIComponent(query)}`, { signal });
    if (!res.ok) return [];
    const j = await res.json();
    return (j.results ?? []) as StockHit[];
  } catch {
    return [];
  }
}
