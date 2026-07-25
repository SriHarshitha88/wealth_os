import { createClient } from '@/lib/supabase/server';
import { cr, inr, pct } from '@/lib/format';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
  if (!client) notFound();

  const { data: holdings } = await supabase
    .from('holdings')
    .select('quantity, avg_price, securities(symbol, name, last_price)')
    .eq('client_id', id);

  const rows = (holdings ?? []).map((h) => {
    const relRaw = (h as any).securities;
    const sec = Array.isArray(relRaw) ? relRaw[0] : relRaw;
    const qty = Number(h.quantity);
    const avg = Number(h.avg_price);
    const cur = sec?.last_price != null ? Number(sec.last_price) : null;
    const investedValue = qty * avg;
    const currentValue = cur != null ? qty * cur : null;
    const pl = currentValue != null ? currentValue - investedValue : null;
    const ret = pl != null && investedValue ? (pl / investedValue) * 100 : null;
    return { symbol: sec?.symbol ?? '—', name: sec?.name ?? '', qty, avg, cur, investedValue, currentValue, pl, ret };
  });

  const invested = rows.reduce((a, r) => a + r.investedValue, 0);
  const current = rows.reduce((a, r) => a + (r.currentValue ?? r.investedValue), 0);
  const pl = current - invested;
  const plPct = invested ? (pl / invested) * 100 : 0;

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
          <div className="meta">across {rows.length} holdings</div>
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
          <div className="eyebrow">Holdings</div>
          <div className="val">{rows.length}</div>
          <div className="meta">stocks</div>
        </div>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <div className="empty">
            <p style={{ fontFamily: 'var(--serif)', fontSize: 18, marginBottom: 6 }}>No holdings yet.</p>
            <p style={{ color: 'var(--ink-3)', margin: 0 }}>Record a Buy for this client to see it here.</p>
          </div>
        ) : (
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th>Stock</th><th>Qty</th><th>Invested price</th><th>Current price</th>
                  <th>Invested</th><th>Current</th><th>P/L</th><th>Return</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.symbol}>
                    <td>
                      <div className="cell-name">
                        <div className="avatar" style={{ borderRadius: 8, fontSize: 11 }}>{r.symbol.slice(0, 4)}</div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{r.symbol}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.name}</div>
                        </div>
                      </div>
                    </td>
                    <td>{r.qty.toLocaleString('en-IN')}</td>
                    <td>{inr(r.avg)}</td>
                    <td>{r.cur != null ? inr(r.cur) : '—'}</td>
                    <td>{cr(r.investedValue)}</td>
                    <td>{r.currentValue != null ? cr(r.currentValue) : '—'}</td>
                    <td className={r.pl == null ? '' : r.pl >= 0 ? 'num-pos' : 'num-neg'}>
                      {r.pl != null ? cr(r.pl) : '—'}
                    </td>
                    <td className={r.ret == null ? '' : r.ret >= 0 ? 'num-pos' : 'num-neg'}>
                      {r.ret != null ? pct(r.ret) : '—'}
                    </td>
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
