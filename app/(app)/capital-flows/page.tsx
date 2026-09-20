import { createClient } from '@/lib/supabase/server';
import { computeCapitalFlows, fyStartOf, todayIST, type FlowTxnRow } from '@/lib/capital-flows';
import { fmtIST, latestPriceAt } from '@/lib/excel';
import { cr } from '@/lib/format';
import CapitalFlowsControls from '@/components/CapitalFlowsControls';
import DownloadMenu from '@/components/DownloadMenu';

export const dynamic = 'force-dynamic';

const rel = (x: any) => (Array.isArray(x) ? x[0] : x);
const inr2 = (n: number) => '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gl = (n: number) => (n < 0 ? `(${inr2(n)})` : inr2(n));
const dtL = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const glStyle = (n: number) => ({ color: Math.abs(n) < 0.005 ? 'inherit' : n < 0 ? 'var(--loss)' : 'var(--gain)' });

export default async function CapitalFlowsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: clients } = await supabase.from('clients').select('id, name').order('name');
  const list = clients ?? [];
  const clientId = sp.client && list.some((c) => c.id === sp.client) ? sp.client : list[0]?.id ?? null;

  const today = todayIST();
  const from = sp.from ?? fyStartOf(today);
  const to = sp.to ?? today;

  let report = null, priceAsOf: string | null = null, clientName = '';
  if (clientId) {
    clientName = list.find((c) => c.id === clientId)?.name ?? '';
    const { data: txns } = await supabase
      .from('transactions')
      .select('side, quantity, price, traded_at, security_id, securities(symbol, last_price, last_price_at)')
      .eq('client_id', clientId);
    report = computeCapitalFlows((txns ?? []) as FlowTxnRow[], from, to, today);
    if (!report.closingAtCost) {
      priceAsOf = fmtIST(latestPriceAt((txns ?? []).map((t) => rel((t as any).securities)?.last_price_at)));
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Client PMS</div>
          <h1>Capital Flows</h1>
          <p>Registered capital movements in and out of a client&apos;s portfolio — opening AUM to closing AUM.</p>
        </div>
        {clientId && (
          <div className="head-tools">
            <DownloadMenu base={`/api/report/flows/${clientId}?from=${from}&to=${to}`} label="Download report" primary />
          </div>
        )}
      </div>

      <div className="card" style={{ padding: '14px 20px', marginBottom: 18 }}>
        <CapitalFlowsControls clients={list} clientId={clientId} from={from} to={to} />
      </div>

      {!report ? (
        <div className="card"><div className="empty">Add a client to see their capital flows.</div></div>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi feature">
              <div className="eyebrow">Opening AUM · {dtL(report.from)}</div>
              <div className="val">{cr(report.openingAum)}</div>
              <div className="meta">{report.openingAtCost ? 'at cost' : 'at market'}</div>
            </div>
            <div className="kpi">
              <div className="eyebrow">Net flows</div>
              <div className="val" style={glStyle(report.netFlows)}>{(report.netFlows < 0 ? '−' : '') + cr(Math.abs(report.netFlows))}</div>
              <div className="meta">{cr(report.inflows)} in · {cr(report.outflows)} out</div>
            </div>
            <div className="kpi">
              <div className="eyebrow">MTM gain / (loss)</div>
              <div className="val" style={glStyle(report.mtm)}>{(report.mtm < 0 ? '−' : '') + cr(Math.abs(report.mtm))}</div>
              <div className="meta">derived over the period</div>
            </div>
            <div className="kpi">
              <div className="eyebrow">Closing AUM · {dtL(report.to)}</div>
              <div className="val">{cr(report.closingAum)}</div>
              <div className="meta">{report.closingAtCost ? 'at cost' : priceAsOf ? `prices as of ${priceAsOf}` : 'at market'}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-head"><h3>Reconciliation · {clientName}</h3></div>
            <div style={{ padding: '6px 20px 16px' }}>
              <table>
                <tbody>
                  <tr>
                    <td style={{ textAlign: 'left' }}>Opening AUM · {dtL(report.from)}{report.openingAtCost && <span style={{ color: 'var(--ink-3)', fontSize: 12 }}> (at cost)</span>}</td>
                    <td className="tnum">{inr2(report.openingAum)}</td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left' }}>Capital inflows <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>(purchases + deposits)</span></td>
                    <td className="tnum num-pos">{inr2(report.inflows)}</td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left' }}>Capital outflows <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>(sale proceeds + withdrawals)</span></td>
                    <td className="tnum num-neg">({inr2(report.outflows)})</td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left', fontWeight: 700 }}>Net flows</td>
                    <td className="tnum" style={{ fontWeight: 700, ...glStyle(report.netFlows) }}>{gl(report.netFlows)}</td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left' }}>Mark-to-market gains / (losses)</td>
                    <td className="tnum" style={glStyle(report.mtm)}>{gl(report.mtm)}</td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left', fontWeight: 700 }}>Closing AUM · {dtL(report.to)}{report.closingAtCost && <span style={{ color: 'var(--ink-3)', fontSize: 12, fontWeight: 400 }}> (at cost)</span>}</td>
                    <td className="tnum" style={{ fontWeight: 700 }}>{inr2(report.closingAum)}</td>
                  </tr>
                </tbody>
              </table>
              <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '10px 2px 0' }}>
                Closing AUM = Opening AUM + Net Flows + MTM. MTM is derived as the balancing figure; past-dated AUM is stated
                at cost since historical market prices are not stored. Advisory fees are invoiced separately and are not
                capital movements. Official PMS disclosures are on the{' '}
                <a href="https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doPmr=yes" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)' }}>SEBI Portfolio Managers portal</a>.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Capital movements · {dtL(report.from)} – {dtL(report.to)}</h3></div>
            {report.events.length === 0 ? (
              <div className="empty">No capital movements in this period.</div>
            ) : (
              <div className="twrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Date</th>
                      <th style={{ textAlign: 'left' }}>Type</th>
                      <th style={{ textAlign: 'left' }}>Particulars</th>
                      <th>Inflow</th>
                      <th>Outflow</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.events.map((e, i) => (
                      <tr key={i}>
                        <td style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 12.5 }}>{dtL(e.date)}</td>
                        <td style={{ textAlign: 'left' }}>
                          <span className={'pill ' + (e.kind === 'Inflow' ? 'gain' : 'silv')} style={{ fontSize: 11 }}>{e.kind}</span>
                        </td>
                        <td style={{ textAlign: 'left' }}>{e.label}</td>
                        <td className="tnum num-pos">{e.inAmt != null ? inr2(e.inAmt) : '—'}</td>
                        <td className="tnum num-neg">{e.outAmt != null ? inr2(e.outAmt) : '—'}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ textAlign: 'left', fontWeight: 700 }}>Total</td>
                      <td /><td />
                      <td className="tnum" style={{ fontWeight: 700 }}>{inr2(report.inflows)}</td>
                      <td className="tnum" style={{ fontWeight: 700 }}>{inr2(report.outflows)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
