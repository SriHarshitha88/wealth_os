import { createClient } from '@/lib/supabase/server';
import { cr, pct } from '@/lib/format';
import { computePosition } from '@/lib/portfolio-calc';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ClientTransactions from '@/components/ClientTransactions';
import ClientHoldings from '@/components/ClientHoldings';

export const dynamic = 'force-dynamic';

function rel(sec: any) {
  return Array.isArray(sec) ? sec[0] : sec;
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
  if (!client) notFound();

  // The transaction ledger is the source of truth for everything on this page.
  const { data: txns } = await supabase
    .from('transactions')
    .select('id, side, quantity, price, traded_at, security_id, securities(symbol, name, last_price)')
    .eq('client_id', id)
    .order('traded_at', { ascending: false });

  // Group by security and replay FIFO to get qty, avg cost, invested, realised.
  const bySec = new Map<number, { sec: any; txns: any[] }>();
  for (const t of txns ?? []) {
    const sec = rel((t as any).securities);
    const e = bySec.get(t.security_id) ?? { sec, txns: [] };
    e.txns.push(t);
    bySec.set(t.security_id, e);
  }

  const positions = [...bySec.entries()].map(([securityId, { sec, txns }]) => {
    const pos = computePosition(txns);
    const cur = sec?.last_price != null ? Number(sec.last_price) : null;
    const current = cur != null ? pos.qty * cur : null;
    const pl = current != null ? current - pos.invested : null;
    const ret = pl != null && pos.invested ? (pl / pos.invested) * 100 : null;
    // A holding backed by a single Buy (e.g. one import row) can be edited inline;
    // multi-trade holdings must be edited trade-by-trade in the Transactions ledger.
    const singleBuyId = txns.length === 1 && txns[0].side === 'Buy' ? String(txns[0].id) : null;
    return {
      securityId, singleBuyId,
      symbol: sec?.symbol ?? '—', name: sec?.name ?? '', qty: pos.qty, avg: pos.avgCost,
      cur, invested: pos.invested, current, pl, ret, realised: pos.realised,
    };
  });

  const open = positions.filter((r) => r.qty > 1e-9).sort((a, b) => (b.current ?? 0) - (a.current ?? 0));
  const closed = positions.filter((r) => r.qty <= 1e-9 && Math.abs(r.realised) > 0.005);
  const holdingRows = [
    ...open.map((r) => ({ ...r, closed: false })),
    ...closed.map((r) => ({ ...r, closed: true })),
  ];

  const invested = open.reduce((a, r) => a + r.invested, 0);
  const current = open.reduce((a, r) => a + (r.current ?? r.invested), 0);
  const pl = current - invested;
  const plPct = invested ? (pl / invested) * 100 : 0;
  const realisedTotal = positions.reduce((a, r) => a + r.realised, 0);

  const ledger = (txns ?? []).map((t) => {
    const sec = rel((t as any).securities);
    return { id: t.id, side: t.side, symbol: sec?.symbol ?? '—', name: sec?.name ?? '', qty: Number(t.quantity), price: Number(t.price), tradedAt: t.traded_at };
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Link href="/clients" style={{ color: 'var(--brand)' }}>← Clients</Link> · {client.tier} · {client.lifecycle_stage}
          </div>
          <h1>{client.name}</h1>
          <p>{client.phone}{client.email ? ` · ${client.email}` : ''}</p>
        </div>
        <div className="head-tools">
          <a className="btn primary" href={`/api/report/client/${client.id}`} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="none" width="15" height="15">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Download report
          </a>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi feature">
          <div className="eyebrow">Current value</div>
          <div className="val">{cr(current)}</div>
          <div className="meta">across {open.length} holdings</div>
        </div>
        <div className="kpi">
          <div className="eyebrow">Invested</div>
          <div className="val">{cr(invested)}</div>
          <div className="meta">cost basis</div>
        </div>
        <div className="kpi">
          <div className="eyebrow">Unrealized P/L</div>
          <div className="val" style={{ color: pl >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{cr(pl)}</div>
          <div className="meta"><span className="delta" style={{ color: pl >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{pct(plPct)}</span> absolute</div>
        </div>
        <div className="kpi">
          <div className="eyebrow">Realized P/L</div>
          <div className="val" style={{ color: realisedTotal >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{cr(realisedTotal)}</div>
          <div className="meta">booked on sells</div>
        </div>
      </div>

      <ClientHoldings clientId={id} rows={holdingRows} />

      <ClientTransactions clientId={id} rows={ledger} />
    </>
  );
}
