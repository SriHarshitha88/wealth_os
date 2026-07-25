import { createClient } from '@/lib/supabase/server';
import { cr, inr, pct } from '@/lib/format';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const IST = 'Asia/Kolkata';

function greeting() {
  const h = Number(new Date().toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: IST })) % 24;
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function rel(sec: any) {
  return Array.isArray(sec) ? sec[0] : sec;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: holdings }, { count: clientCount }, { data: fees }, { data: txns }] = await Promise.all([
    supabase.from('holdings').select('quantity, avg_price, securities(symbol, name, last_price)'),
    supabase.from('clients').select('id', { count: 'exact', head: true }),
    supabase.from('fees').select('amount, status').in('status', ['Pending', 'Overdue']),
    supabase
      .from('transactions')
      .select('id, side, quantity, price, traded_at, clients(name), securities(symbol)')
      .order('traded_at', { ascending: false })
      .limit(6),
  ]);

  let current = 0;
  let invested = 0;
  const bySec = new Map<string, { symbol: string; name: string; invested: number; current: number; hasPrice: boolean }>();

  for (const h of holdings ?? []) {
    const sec = rel((h as any).securities);
    const lp = sec?.last_price != null ? Number(sec.last_price) : null;
    const inv = Number(h.quantity) * Number(h.avg_price);
    const curVal = lp != null ? Number(h.quantity) * lp : null;
    current += curVal ?? inv;
    invested += inv;
    if (sec?.symbol) {
      const e = bySec.get(sec.symbol) ?? { symbol: sec.symbol, name: sec.name ?? '', invested: 0, current: 0, hasPrice: false };
      e.invested += inv;
      if (curVal != null) { e.current += curVal; e.hasPrice = true; }
      bySec.set(sec.symbol, e);
    }
  }

  const pl = current - invested;
  const plPct = invested ? (pl / invested) * 100 : 0;
  const pending = (fees ?? []).reduce((a, f) => a + Number(f.amount), 0);
  const empty = (holdings ?? []).length === 0;

  const topHoldings = [...bySec.values()]
    .map((e) => ({ ...e, value: e.hasPrice ? e.current : e.invested, pl: e.hasPrice ? e.current - e.invested : null }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // Allocation donut segments (by current value).
  const allocTotal = topHoldings.reduce((a, h) => a + h.value, 0) || 1;
  const ALLOC_COLORS = ['#0E5B54', '#C69A4B', '#1B8A5E', '#3BA697', '#8FB89E', '#7FB3AB'];
  let acc = 0;
  const segs = topHoldings.map((h, i) => {
    const start = (acc / allocTotal) * 100;
    acc += h.value;
    const end = (acc / allocTotal) * 100;
    return { symbol: h.symbol, color: ALLOC_COLORS[i % ALLOC_COLORS.length], start, end, pctOfTotal: (h.value / allocTotal) * 100 };
  });
  const gradient = segs.length ? segs.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(', ') : 'var(--surface-2) 0% 100%';

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: IST })}
          </div>
          <h1>{greeting()}.</h1>
          <p>
            {empty
              ? 'No transactions yet. Add your first one from “New transaction” to see your book come to life.'
              : `You manage ${clientCount ?? 0} clients worth ${cr(current)}.`}
          </p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi feature">
          <div className="eyebrow">Assets Under Management</div>
          <div className="val">{cr(current)}</div>
          <div className="meta">across {clientCount ?? 0} clients</div>
        </div>
        <div className="kpi">
          <div className="eyebrow">Invested</div>
          <div className="val">{cr(invested)}</div>
          <div className="meta">cost basis</div>
        </div>
        <div className="kpi">
          <div className="eyebrow">Unrealized P/L</div>
          <div className="val" style={{ color: pl >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{cr(pl)}</div>
          <div className="meta">
            <span className="delta" style={{ color: pl >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{pct(plPct)}</span> absolute
          </div>
        </div>
        <div className="kpi">
          <div className="eyebrow">Fees pending</div>
          <div className="val" style={{ color: pending ? 'var(--warn)' : undefined }}>{cr(pending)}</div>
          <div className="meta">pending &amp; overdue</div>
        </div>
      </div>

      {empty ? (
        <div className="card">
          <div className="empty">
            <p style={{ fontFamily: 'var(--serif)', fontSize: 18, marginBottom: 6 }}>Your dashboard is ready.</p>
            <p style={{ color: 'var(--ink-3)', margin: 0 }}>
              Record a transaction from “New transaction” — AUM, P/L and fees fill in automatically.
            </p>
          </div>
        </div>
      ) : (
        <>
        <div className="grid cols-2" style={{ marginBottom: 14 }}>
          <div className="card">
            <div className="card-head"><h3>Allocation</h3><span className="eyebrow" style={{ fontSize: 11 }}>by value</span></div>
            <div className="card-body" style={{ display: 'flex', gap: 22, alignItems: 'center', padding: '18px 20px' }}>
              <div className="donut" style={{ background: `conic-gradient(${gradient})` }}><div className="donut-hole" /></div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
                {segs.map((sgt) => (
                  <div key={sgt.symbol} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: sgt.color, flex: 'none' }} />
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{sgt.symbol}</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{sgt.pctOfTotal.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Top holdings</h3><Link href="/clients" style={{ color: 'var(--brand)', fontSize: 13, fontWeight: 600 }}>Clients →</Link></div>
            <div className="twrap">
              <table>
                <thead>
                  <tr><th>Stock</th><th>Value</th><th>P/L</th></tr>
                </thead>
                <tbody>
                  {topHoldings.map((h) => (
                    <tr key={h.symbol}>
                      <td>
                        <div className="cell-name">
                          <div className="avatar" style={{ borderRadius: 8, fontSize: 11 }}>{h.symbol.slice(0, 4)}</div>
                          <div>
                            <div style={{ fontWeight: 600 }}>{h.symbol}</div>
                            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{h.name}</div>
                          </div>
                        </div>
                      </td>
                      <td>{cr(h.value)}</td>
                      <td className={h.pl == null ? '' : h.pl >= 0 ? 'num-pos' : 'num-neg'}>
                        {h.pl != null ? cr(h.pl) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Recent transactions</h3></div>
            <div className="twrap">
              <table>
                <thead>
                  <tr><th>Trade</th><th>Client</th><th>Value</th></tr>
                </thead>
                <tbody>
                  {(txns ?? []).map((t) => {
                    const sec = rel((t as any).securities);
                    const cl = rel((t as any).clients);
                    return (
                      <tr key={t.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>
                            <span style={{ color: t.side === 'Sell' ? 'var(--loss)' : 'var(--gain)' }}>{t.side}</span> {sec?.symbol ?? '—'}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{Number(t.quantity).toLocaleString('en-IN')} @ {inr(Number(t.price))}</div>
                        </td>
                        <td style={{ textAlign: 'left' }}>{cl?.name ?? '—'}</td>
                        <td>{cr(Number(t.quantity) * Number(t.price))}</td>
                      </tr>
                    );
                  })}
                  {(txns ?? []).length === 0 && (
                    <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 24 }}>No transactions yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
