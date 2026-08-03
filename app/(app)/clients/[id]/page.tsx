import { createClient } from '@/lib/supabase/server';
import { cr, pct } from '@/lib/format';
import { computeLots } from '@/lib/portfolio-calc';
import { xirr, positionCashflows, type CashFlow } from '@/lib/xirr';
import { unrealisedSplit, financialYearsWithSells, currentFY } from '@/lib/capital-gains';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ClientWorkspace from '@/components/ClientWorkspace';
import type { HoldingRow } from '@/components/ClientHoldings';
import type { GainSlice } from '@/components/CapitalGains';

export const dynamic = 'force-dynamic';

function rel(sec: any) {
  return Array.isArray(sec) ? sec[0] : sec;
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
  if (!client) notFound();

  const { data: txns } = await supabase
    .from('transactions')
    .select('id, side, quantity, price, traded_at, security_id, securities(symbol, name, last_price)')
    .eq('client_id', id)
    .order('traded_at', { ascending: false });

  const bySec = new Map<number, { sec: any; txns: any[] }>();
  for (const t of txns ?? []) {
    const sec = rel((t as any).securities);
    const e = bySec.get(t.security_id) ?? { sec, txns: [] };
    e.txns.push(t);
    bySec.set(t.security_id, e);
  }

  const nowIso = new Date().toISOString();
  const portfolioFlows: CashFlow[] = [];
  const gainSlices: GainSlice[] = [];
  const unrealShort = { count: 0, qty: 0, proceeds: 0, cost: 0, gain: 0 };
  const unrealLong = { count: 0, qty: 0, proceeds: 0, cost: 0, gain: 0 };
  let nearestToLTCG: number | null = null;

  const positions = [...bySec.entries()].map(([securityId, { sec, txns: ts }]) => {
    const lot = computeLots(ts);
    const cur = sec?.last_price != null ? Number(sec.last_price) : null;
    const current = cur != null ? lot.qty * cur : null;
    const pl = current != null ? current - lot.invested : null;
    const ret = pl != null && lot.invested ? (pl / lot.invested) * 100 : null;

    // XIRR for this holding + roll its flows into the portfolio
    const flows = positionCashflows(ts, lot.qty, cur, nowIso);
    portfolioFlows.push(...flows);
    const holdingXirr = xirr(flows);

    // unrealised ST/LT for open lots
    const u = unrealisedSplit(lot.openLots, cur, nowIso);
    for (const [dst, src] of [[unrealShort, u.short], [unrealLong, u.long]] as const) {
      dst.count += src.count; dst.qty += src.qty; dst.proceeds += src.proceeds; dst.cost += src.cost; dst.gain += src.gain;
    }
    if (u.daysToLTCG != null) nearestToLTCG = nearestToLTCG == null ? u.daysToLTCG : Math.min(nearestToLTCG, u.daysToLTCG);

    // realised slices → capital gains
    for (const s of lot.realisedSlices) gainSlices.push({ symbol: sec?.symbol ?? '—', name: sec?.name ?? '', ...s });

    const singleBuyId = ts.length === 1 && ts[0].side === 'Buy' ? String(ts[0].id) : null;
    return {
      securityId, singleBuyId, symbol: sec?.symbol ?? '—', name: sec?.name ?? '',
      qty: lot.qty, avg: lot.avgCost, cur, invested: lot.invested, current, pl, ret, realised: lot.realised,
      firstBuyDate: lot.firstBuyDate, xirr: holdingXirr, daysToLTCG: u.daysToLTCG,
    };
  });

  const open = positions.filter((r) => r.qty > 1e-9).sort((a, b) => (b.current ?? 0) - (a.current ?? 0));
  const closed = positions.filter((r) => r.qty <= 1e-9 && Math.abs(r.realised) > 0.005);
  const holdingRows: HoldingRow[] = [
    ...open.map((r) => ({ ...r, closed: false })),
    ...closed.map((r) => ({ ...r, closed: true })),
  ];

  const invested = open.reduce((a, r) => a + r.invested, 0);
  const current = open.reduce((a, r) => a + (r.current ?? r.invested), 0);
  const pl = current - invested;
  const plPct = invested ? (pl / invested) * 100 : 0;
  const realisedTotal = positions.reduce((a, r) => a + r.realised, 0);
  const portfolioXirr = xirr(portfolioFlows);

  const ledger = (txns ?? []).map((t) => {
    const sec = rel((t as any).securities);
    return { id: t.id, side: t.side, symbol: sec?.symbol ?? '—', name: sec?.name ?? '', qty: Number(t.quantity), price: Number(t.price), tradedAt: t.traded_at };
  });

  const fyList = financialYearsWithSells(gainSlices);
  if (!fyList.includes(currentFY(nowIso))) fyList.unshift(currentFY(nowIso));
  const gains = {
    slices: gainSlices,
    fyList,
    unreal: {
      short: { ...unrealShort, gain: +unrealShort.gain.toFixed(2) },
      long: { ...unrealLong, gain: +unrealLong.gain.toFixed(2) },
      daysToLTCG: nearestToLTCG,
    },
  };

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
          <div className="eyebrow">Unrealized P/L</div>
          <div className="val" style={{ color: pl >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{cr(pl)}</div>
          <div className="meta"><span className="delta" style={{ color: pl >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{pct(plPct)}</span> absolute</div>
        </div>
        <div className="kpi">
          <div className="eyebrow">XIRR</div>
          <div className="val" style={{ color: portfolioXirr == null ? 'var(--ink-3)' : portfolioXirr >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
            {portfolioXirr != null ? pct(portfolioXirr) : '—'}
          </div>
          <div className="meta">annualised</div>
        </div>
        <div className="kpi">
          <div className="eyebrow">Realized P/L</div>
          <div className="val" style={{ color: realisedTotal >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{cr(realisedTotal)}</div>
          <div className="meta">booked on sells</div>
        </div>
      </div>

      <ClientWorkspace clientId={id} holdings={holdingRows} ledger={ledger} gains={gains} />
    </>
  );
}
