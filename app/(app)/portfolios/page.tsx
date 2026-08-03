import { createClient } from '@/lib/supabase/server';
import { cr, inr, pct } from '@/lib/format';
import { privacyOn, maskIf } from '@/lib/privacy';

export const dynamic = 'force-dynamic';

function rel(x: any) {
  return Array.isArray(x) ? x[0] : x;
}

export default async function PortfoliosPage() {
  const supabase = await createClient();
  const privacy = await privacyOn();

  const { data: holdings } = await supabase
    .from('holdings')
    .select('quantity, avg_price, clients(name), securities(symbol, name, last_price)');

  const rows = (holdings ?? []).map((h) => {
    const sec = rel((h as any).securities);
    const cl = rel((h as any).clients);
    const qty = Number(h.quantity);
    const avg = Number(h.avg_price);
    const cur = sec?.last_price != null ? Number(sec.last_price) : null;
    const investedValue = qty * avg;
    const currentValue = cur != null ? qty * cur : null;
    const pl = currentValue != null ? currentValue - investedValue : null;
    const ret = pl != null && investedValue ? (pl / investedValue) * 100 : null;
    return { client: cl?.name ? maskIf(cl.name, privacy) : '—', symbol: sec?.symbol ?? '—', name: sec?.name ?? '', qty, avg, cur, investedValue, currentValue, pl, ret };
  }).sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0));

  const invested = rows.reduce((a, r) => a + r.investedValue, 0);
  const current = rows.reduce((a, r) => a + (r.currentValue ?? r.investedValue), 0);
  const pl = current - invested;
  const plPct = invested ? (pl / invested) * 100 : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Portfolios · {rows.length} holdings</div>
          <h1>All holdings</h1>
          <p>Every position across all clients — invested price, current price and profit/loss in one place.</p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi feature">
          <div className="eyebrow">Current value</div>
          <div className="val">{cr(current)}</div>
          <div className="meta">{rows.length} holdings</div>
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
          <div className="eyebrow">Clients invested</div>
          <div className="val">{new Set(rows.map((r) => r.client)).size}</div>
          <div className="meta">with holdings</div>
        </div>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <div className="empty">
            <p style={{ fontFamily: 'var(--serif)', fontSize: 18, marginBottom: 6 }}>No holdings yet.</p>
            <p style={{ color: 'var(--ink-3)', margin: 0 }}>Record a Buy from “New transaction” to see positions here.</p>
          </div>
        ) : (
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th>Stock</th><th style={{ textAlign: 'left' }}>Client</th><th>Qty</th>
                  <th>Invested price</th><th>Current price</th>
                  <th>Invested</th><th>Current</th><th>P/L</th><th>Return</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <div className="cell-name">
                        <div className="avatar" style={{ borderRadius: 8, fontSize: 11 }}>{r.symbol.slice(0, 4)}</div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{r.symbol}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.name}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'left' }}>{r.client}</td>
                    <td>{r.qty.toLocaleString('en-IN')}</td>
                    <td>{inr(r.avg)}</td>
                    <td>{r.cur != null ? inr(r.cur) : '—'}</td>
                    <td>{cr(r.investedValue)}</td>
                    <td>{r.currentValue != null ? cr(r.currentValue) : '—'}</td>
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
