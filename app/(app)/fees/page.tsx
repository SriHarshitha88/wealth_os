import { createClient } from '@/lib/supabase/server';
import { cr } from '@/lib/format';
import RaiseFeeButton from '@/components/RaiseFeeButton';

export const dynamic = 'force-dynamic';

function rel(x: any) {
  return Array.isArray(x) ? x[0] : x;
}
const clamp = (n: number) => Math.max(0, Math.min(100, n));

export default async function FeesPage() {
  const supabase = await createClient();

  const [{ data: clients }, { data: holdings }, { data: marks }, { data: fees }] = await Promise.all([
    supabase.from('clients').select('id, name'),
    supabase.from('holdings').select('client_id, quantity, avg_price, securities(last_price)'),
    supabase.from('fee_marks').select('client_id, last_basis, step_pct, fee_rate'),
    supabase.from('fees').select('client_id, amount, status'),
  ]);

  const markBy = new Map((marks ?? []).map((m) => [m.client_id, m]));
  const collectedBy = new Map<string, number>();
  for (const f of fees ?? []) {
    if (f.status === 'Collected') collectedBy.set(f.client_id, (collectedBy.get(f.client_id) ?? 0) + Number(f.amount));
  }

  const rows = (clients ?? []).map((c) => {
    let invested = 0, current = 0;
    for (const h of holdings ?? []) {
      if (h.client_id !== c.id) continue;
      const sec = rel((h as any).securities);
      invested += Number(h.quantity) * Number(h.avg_price);
      if (sec?.last_price != null) current += Number(h.quantity) * Number(sec.last_price);
    }
    const m = markBy.get(c.id) as any;
    const basis = m ? Number(m.last_basis) : invested;
    const step = m ? Number(m.step_pct) : 20;
    const rate = m ? Number(m.fee_rate) : 15;
    const trigger = basis * (1 + step / 100);
    const crossed = current >= trigger && current > 0;
    const belowMark = current < basis;
    const progress = trigger > basis ? clamp(((current - basis) / (trigger - basis)) * 100) : 0;
    const feeDue = crossed ? (rate / 100) * (current - basis) : 0;
    return { id: c.id, name: c.name, invested, current, basis, step, rate, trigger, crossed, belowMark, progress, feeDue, collected: collectedBy.get(c.id) ?? 0 };
  }).filter((r) => r.invested > 0)
    .sort((a, b) => Number(b.crossed) - Number(a.crossed) || b.progress - a.progress);

  const totalDue = rows.reduce((a, r) => a + r.feeDue, 0);
  const totalCollected = rows.reduce((a, r) => a + r.collected, 0);
  const crossedCount = rows.filter((r) => r.crossed).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Fee Engine · High-water mark</div>
          <h1>Performance fees</h1>
          <p>When a portfolio grows past its next {rows[0]?.step ?? 20}% trigger, a fee is due. Charge it and the mark resets — so a client is never charged twice on the same gains.</p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi feature">
          <div className="eyebrow">Fee due now</div>
          <div className="val">{cr(totalDue)}</div>
          <div className="meta">{crossedCount} portfolio{crossedCount === 1 ? '' : 's'} crossed</div>
        </div>
        <div className="kpi">
          <div className="eyebrow">Collected to date</div>
          <div className="val">{cr(totalCollected)}</div>
          <div className="meta">performance fees</div>
        </div>
        <div className="kpi">
          <div className="eyebrow">Portfolios tracked</div>
          <div className="val">{rows.length}</div>
          <div className="meta">with a high-water mark</div>
        </div>
        <div className="kpi">
          <div className="eyebrow">Default fee</div>
          <div className="val">15<span style={{ fontSize: 18 }}>%</span></div>
          <div className="meta">on gains above the mark</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card"><div className="empty">
          <p style={{ fontFamily: 'var(--serif)', fontSize: 18, marginBottom: 6 }}>No portfolios yet.</p>
          <p style={{ color: 'var(--ink-3)', margin: 0 }}>Record some trades — each client’s high-water mark starts at their invested amount.</p>
        </div></div>
      ) : (
        <div className="fee-grid">
          {rows.map((r) => (
            <div className="fee-card" key={r.id}>
              <div className="fee-top">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="avatar">{r.name.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{r.name}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Performance fee {r.rate}% above high-water</div>
                  </div>
                </div>
                <span className={'pill ' + (r.crossed ? 'warn dot' : r.belowMark ? 'silv' : 'gain dot')}>
                  {r.crossed ? 'Fee due' : r.belowMark ? 'Below mark' : 'On track'}
                </span>
              </div>

              <div className="fee-figs">
                <div className="fee-fig"><div className="eyebrow">Last basis</div><div className="v">{cr(r.basis)}</div></div>
                <div className="fee-fig"><div className="eyebrow">Current value</div><div className="v" style={{ color: r.belowMark ? 'var(--loss)' : 'var(--gain)' }}>{cr(r.current)}</div></div>
                <div className="fee-fig"><div className="eyebrow">Next trigger</div><div className="v" style={{ color: 'var(--brass)' }}>{cr(r.trigger)}</div></div>
                <div className="fee-fig"><div className="eyebrow">Fee payable now</div><div className="v">{cr(r.feeDue)}</div></div>
              </div>

              <div className="feebar"><div className={'feebar-fill' + (r.crossed ? ' over' : '')} style={{ width: `${r.crossed ? 100 : r.progress}%` }} /></div>
              <div className="feebar-labels">
                <span>Basis {cr(r.basis)}</span>
                <span>{r.crossed ? 'Crossed' : `${r.progress.toFixed(0)}% to trigger`}</span>
                <span>Trigger {cr(r.trigger)}</span>
              </div>

              {r.crossed && (
                <div className="callout brass">
                  <svg viewBox="0 0 24 24" fill="none" width="20" height="20" style={{ color: 'var(--brass)', flex: 'none' }}>
                    <path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div>Crossed the {cr(r.basis)} mark. On payment, the basis resets to <b>{cr(r.current)}</b> and the next trigger moves to <b>{cr(r.current * (1 + r.step / 100))}</b>.</div>
                  <RaiseFeeButton clientId={r.id} label={`Raise ${cr(r.feeDue)} fee`} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
