import { createClient } from '@/lib/supabase/server';
import { cr, inr, pct } from '@/lib/format';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function rel(x: any) {
  return Array.isArray(x) ? x[0] : x;
}

export default async function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const sym = decodeURIComponent(symbol);
  const supabase = await createClient();

  const { data: sec } = await supabase
    .from('securities')
    .select('id, symbol, name, last_price')
    .eq('symbol', sym)
    .maybeSingle();
  if (!sec) notFound();

  const { data: holdings } = await supabase
    .from('holdings')
    .select('quantity, avg_price, clients(id, name)')
    .eq('security_id', sec.id);

  const cur = sec.last_price != null ? Number(sec.last_price) : null;
  const rows = (holdings ?? []).map((h) => {
    const cl = rel((h as any).clients);
    const qty = Number(h.quantity);
    const avg = Number(h.avg_price);
    const invested = qty * avg;
    const current = cur != null ? qty * cur : null;
    const pl = current != null ? current - invested : null;
    const ret = pl != null && invested ? (pl / invested) * 100 : null;
    return { clientId: cl?.id, client: cl?.name ?? '—', qty, avg, invested, current, pl, ret };
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow"><Link href="/portfolios" style={{ color: 'var(--brand)' }}>← Portfolios</Link> · Stock</div>
          <h1>{sec.symbol}</h1>
          <p>{sec.name}{cur != null ? ` · current ${inr(cur)}` : ''} · held by {rows.length} client{rows.length === 1 ? '' : 's'}</p>
        </div>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <div className="empty">
            <p style={{ fontFamily: 'var(--serif)', fontSize: 18, marginBottom: 6 }}>No client holds this yet.</p>
            <p style={{ color: 'var(--ink-3)', margin: 0 }}>Record a Buy of {sec.symbol} for a client to see them here.</p>
          </div>
        ) : (
          <div className="twrap">
            <table>
              <thead>
                <tr><th>Client</th><th>Qty</th><th>Invested price</th><th>Current price</th><th>Invested</th><th>Current</th><th>P/L</th><th>Return</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      {r.clientId
                        ? <Link href={`/clients/${r.clientId}`} style={{ fontWeight: 600, color: 'var(--brand)' }}>{r.client}</Link>
                        : <span style={{ fontWeight: 600 }}>{r.client}</span>}
                    </td>
                    <td>{r.qty.toLocaleString('en-IN')}</td>
                    <td>{inr(r.avg)}</td>
                    <td>{cur != null ? inr(cur) : '—'}</td>
                    <td>{cr(r.invested)}</td>
                    <td>{r.current != null ? cr(r.current) : '—'}</td>
                    <td className={r.pl == null ? '' : r.pl >= 0 ? 'num-pos' : 'num-neg'}>{r.pl != null ? cr(r.pl) : '—'}</td>
                    <td className={r.ret == null ? '' : r.ret >= 0 ? 'num-pos' : 'num-neg'}>{r.ret != null ? pct(r.ret) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
