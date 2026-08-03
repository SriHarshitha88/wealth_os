import { createClient } from '@/lib/supabase/server';
import { inr } from '@/lib/format';
import { computePosition } from '@/lib/portfolio-calc';
import { privacyOn, maskIf } from '@/lib/privacy';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import StockHolders, { type HolderRow } from '@/components/StockHolders';

export const dynamic = 'force-dynamic';

function rel(x: any) {
  return Array.isArray(x) ? x[0] : x;
}
const BUY = new Set(['Buy', 'IPO', 'Bonus']);

export default async function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const sym = decodeURIComponent(symbol);
  const supabase = await createClient();
  const privacy = await privacyOn();

  const { data: sec } = await supabase
    .from('securities').select('id, symbol, name, exchange, last_price').eq('symbol', sym).maybeSingle();
  if (!sec) notFound();

  const cur = sec.last_price != null ? Number(sec.last_price) : null;

  // Build holders from the transaction ledger so we get per-lot dates + prices,
  // and derive the open position (qty, avg, realised) via FIFO.
  const { data: txns } = await supabase
    .from('transactions')
    .select('side, quantity, price, traded_at, clients(id, name)')
    .eq('security_id', sec.id);

  const byClient = new Map<string, { name: string; txns: any[] }>();
  for (const t of txns ?? []) {
    const cl = rel((t as any).clients);
    if (!cl?.id) continue;
    const e = byClient.get(cl.id) ?? { name: cl.name ?? '—', txns: [] as any[] };
    e.txns.push(t);
    byClient.set(cl.id, e);
  }

  const rows: HolderRow[] = [];
  for (const [clientId, { name, txns: ts }] of byClient) {
    const pos = computePosition(ts);
    if (pos.qty <= 1e-9) continue; // only current holders
    const lots = [...ts]
      .sort((a, b) => new Date(a.traded_at).getTime() - new Date(b.traded_at).getTime())
      .map((t) => ({ date: t.traded_at as string, side: t.side as string, qty: Number(t.quantity), price: Number(t.price) }));
    const firstBuy = lots.find((l) => BUY.has(l.side))?.date ?? null;
    const invested = pos.qty * pos.avgCost;
    const current = cur != null ? pos.qty * cur : null;
    const pl = current != null ? current - invested : null;
    rows.push({
      clientId, client: maskIf(name, privacy), qty: pos.qty, avg: pos.avgCost, invested,
      current, pl, ret: pl != null && invested ? (pl / invested) * 100 : null,
      firstBuyDate: firstBuy, lots,
    });
  }
  rows.sort((a, b) => (b.current ?? 0) - (a.current ?? 0));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow"><Link href="/portfolios" style={{ color: 'var(--brand)' }}>← Portfolios</Link> · Stock</div>
          <h1>{sec.symbol}</h1>
          <p>{sec.name}{cur != null ? ` · current ${inr(cur)}` : ''} · {sec.exchange ?? 'NSE'} · held by {rows.length} client{rows.length === 1 ? '' : 's'}</p>
        </div>
      </div>

      <StockHolders security={{ id: sec.id, symbol: sec.symbol, lastPrice: cur }} rows={rows} />
    </>
  );
}
