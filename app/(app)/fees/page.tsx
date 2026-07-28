import { createClient } from '@/lib/supabase/server';
import { cr } from '@/lib/format';
import { computeFee, deriveState } from '@/lib/fee-schedule';
import FeeEngine, { type FeeRow } from '@/components/FeeEngine';

export const dynamic = 'force-dynamic';

function rel(x: any) {
  return Array.isArray(x) ? x[0] : x;
}

export default async function FeesPage() {
  const supabase = await createClient();

  const [{ data: clients }, { data: holdings }, { data: marks }, { data: fees }] = await Promise.all([
    supabase.from('clients').select('id, name'),
    supabase.from('holdings').select('client_id, quantity, avg_price, securities(last_price)'),
    supabase.from('fee_marks').select('client_id, last_basis'),
    supabase.from('fees').select('client_id, amount, status, invoice_no, paid_at, due_date'),
  ]);

  const markBy = new Map((marks ?? []).map((m) => [m.client_id, m]));
  const feesBy = new Map<string, typeof fees>();
  for (const f of fees ?? []) {
    const arr = feesBy.get(f.client_id) ?? [];
    arr.push(f); feesBy.set(f.client_id, arr);
  }

  const rows: (FeeRow & { collectedTotal: number })[] = (clients ?? []).map((c) => {
    let invested = 0, current = 0;
    for (const h of holdings ?? []) {
      if (h.client_id !== c.id) continue;
      const sec = rel((h as any).securities);
      invested += Number(h.quantity) * Number(h.avg_price);
      if (sec?.last_price != null) current += Number(h.quantity) * Number(sec.last_price);
    }
    const m = markBy.get(c.id) as any;
    const capital = m && Number(m.last_basis) > 0 ? Number(m.last_basis) : invested;
    const clientFees = feesBy.get(c.id) ?? [];
    const { chargedBands, aboveSettled } = deriveState(clientFees, capital);
    const calc = computeFee({ capital, current, chargedBands, aboveSettled });

    const collected = clientFees
      .filter((f) => f.status === 'Collected' && /^PF-(L\d|ABOVE)/.test(f.invoice_no ?? ''))
      .map((f) => {
        const lvl = /^PF-L(\d)/.exec(f.invoice_no ?? '');
        return { level: lvl ? Number(lvl[1]) : null, isAbove: /^PF-ABOVE/.test(f.invoice_no ?? ''), amount: Number(f.amount), date: (f.paid_at ?? f.due_date) as string | null };
      })
      .sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime());
    const collectedTotal = collected.reduce((a, f) => a + f.amount, 0);

    return {
      id: c.id, name: c.name, invested,
      capital: calc.capital, current: calc.current, gainPct: calc.gainPct,
      reachedBands: calc.reachedBands, chargedBands: calc.chargedBands, reachedPct: calc.reachedPct,
      nextMilestonePct: calc.nextMilestonePct, nextMilestoneValue: calc.nextMilestoneValue,
      progressPct: calc.progressPct, feeDue: calc.feeDue, collected, collectedTotal,
    };
  }).filter((r) => r.invested > 0)
    .sort((a, b) => Number(b.feeDue > 0) - Number(a.feeDue > 0) || b.gainPct - a.gainPct);

  const totalDue = rows.reduce((a, r) => a + r.feeDue, 0);
  const totalCollected = rows.reduce((a, r) => a + r.collectedTotal, 0);
  const dueCount = rows.filter((r) => r.feeDue > 0).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Fee Engine · Appreciation slabs</div>
          <h1>Performance fees</h1>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi feature">
          <div className="eyebrow">Fee due now</div>
          <div className="val">{cr(totalDue)}</div>
          <div className="meta">{dueCount} milestone{dueCount === 1 ? '' : 's'} to bill</div>
        </div>
        <div className="kpi">
          <div className="eyebrow">Collected to date</div>
          <div className="val">{cr(totalCollected)}</div>
          <div className="meta">performance fees</div>
        </div>
        <div className="kpi">
          <div className="eyebrow">Portfolios tracked</div>
          <div className="val">{rows.length}</div>
          <div className="meta">with invested capital</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card"><div className="empty">
          <p style={{ fontFamily: 'var(--serif)', fontSize: 18, marginBottom: 6 }}>No portfolios yet.</p>
          <p style={{ color: 'var(--ink-3)', margin: 0 }}>Record some trades — each client’s capital is their invested amount.</p>
        </div></div>
      ) : (
        <FeeEngine rows={rows} />
      )}
    </>
  );
}
