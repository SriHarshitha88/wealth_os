'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cr, inr, pct } from '@/lib/format';
import { sellForAllHolders } from '@/app/actions/transactions';

export type Lot = { date: string | null; side: string; qty: number; price: number };
export type HolderRow = {
  clientId: string | null; client: string;
  qty: number; avg: number; invested: number;
  current: number | null; pl: number | null; ret: number | null;
  firstBuyDate: string | null; lots: Lot[];
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';
const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export default function StockHolders({
  security, rows,
}: { security: { id: number; symbol: string; lastPrice: number | null }; rows: HolderRow[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sellOpen, setSellOpen] = useState(false);
  const [price, setPrice] = useState(security.lastPrice != null ? String(security.lastPrice) : '');
  const [date, setDate] = useState(todayIST());
  const [qtys, setQtys] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.clientId ?? '', String(r.qty)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cur = security.lastPrice;
  const p = parseFloat(price) || 0;

  const sells = rows
    .filter((r) => r.clientId)
    .map((r) => ({ clientId: r.clientId as string, name: r.client, avg: r.avg, held: r.qty, quantity: Math.min(r.qty, Math.max(0, parseFloat(qtys[r.clientId as string] ?? '0') || 0)) }))
    .filter((s) => s.quantity > 0);
  const totalQty = sells.reduce((a, s) => a + s.quantity, 0);
  const proceeds = totalQty * p;
  const estRealised = sells.reduce((a, s) => a + (p - s.avg) * s.quantity, 0); // FIFO ≈ avg for full/most exits

  async function submitSell() {
    if (!(p >= 0)) { setError('Enter a valid sale price.'); return; }
    if (!totalQty) { setError('Set a quantity for at least one client.'); return; }
    if (!confirm(`Record a Sell of ${security.symbol} at ${inr(p)} for ${sells.length} client${sells.length === 1 ? '' : 's'} (${totalQty.toLocaleString('en-IN')} shares) on ${fmtDate(date)}?`)) return;
    setBusy(true); setError('');
    const res = await sellForAllHolders({ securityId: security.id, price: p, date, sells: sells.map((s) => ({ clientId: s.clientId, quantity: s.quantity })) });
    setBusy(false);
    if (res.ok) { setSellOpen(false); router.refresh(); }
    else setError(res.error ?? 'Could not record the sale.');
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Holders</h3>
        {rows.length > 0 && (
          <button className="btn primary" style={{ padding: '7px 13px' }} onClick={() => setSellOpen(true)}>
            Record sale for all holders
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <p style={{ fontFamily: 'var(--serif)', fontSize: 18, marginBottom: 6 }}>No client holds this yet.</p>
          <p style={{ color: 'var(--ink-3)', margin: 0 }}>Record a Buy of {security.symbol} for a client to see them here.</p>
        </div>
      ) : (
        <div className="twrap">
          <table>
            <thead>
              <tr><th></th><th>Client</th><th>Qty</th><th>Buy price</th><th>Bought</th><th>Current</th><th>Invested</th><th>Value</th><th>P/L</th><th>Return</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const key = r.clientId ?? `row-${i}`;
                const open = !!expanded[key];
                const multi = r.lots.filter((l) => l.side !== 'Sell').length > 1 || r.lots.some((l) => l.side === 'Sell');
                return (
                  <>
                    <tr key={key}>
                      <td style={{ width: 24 }}>
                        {r.lots.length > 0 && (
                          <button aria-label={open ? 'Collapse lots' : 'Expand lots'} onClick={() => setExpanded((e) => ({ ...e, [key]: !open }))}
                            style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink-3)', fontSize: 12, padding: 4 }}>
                            {open ? '▾' : '▸'}
                          </button>
                        )}
                      </td>
                      <td>
                        {r.clientId
                          ? <Link href={`/clients/${r.clientId}`} style={{ fontWeight: 600, color: 'var(--brand)' }}>{r.client}</Link>
                          : <span style={{ fontWeight: 600 }}>{r.client}</span>}
                      </td>
                      <td>{r.qty.toLocaleString('en-IN')}</td>
                      <td>{inr(r.avg)}</td>
                      <td style={{ color: 'var(--ink-3)' }}>{fmtDate(r.firstBuyDate)}{multi ? ' +' : ''}</td>
                      <td>{cur != null ? inr(cur) : '—'}</td>
                      <td>{cr(r.invested)}</td>
                      <td>{r.current != null ? cr(r.current) : '—'}</td>
                      <td className={r.pl == null ? '' : r.pl >= 0 ? 'num-pos' : 'num-neg'}>{r.pl != null ? cr(r.pl) : '—'}</td>
                      <td className={r.ret == null ? '' : r.ret >= 0 ? 'num-pos' : 'num-neg'}>{r.ret != null ? pct(r.ret) : '—'}</td>
                    </tr>
                    {open && r.lots.map((l, j) => (
                      <tr key={`${key}-lot-${j}`} style={{ background: 'var(--surface-2)' }}>
                        <td></td>
                        <td style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>{l.side === 'Sell' ? '↑ Sold' : l.side === 'Bonus' ? '★ Bonus' : '↓ Bought'}</td>
                        <td style={{ fontSize: 12.5 }}>{l.qty.toLocaleString('en-IN')}</td>
                        <td style={{ fontSize: 12.5 }}>{inr(l.price)}</td>
                        <td colSpan={6} style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>{fmtDate(l.date)}</td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- sell-for-all modal ---- */}
      <div className={'overlay' + (sellOpen ? ' show' : '')} onMouseDown={(e) => { if (e.target === e.currentTarget) setSellOpen(false); }}>
        <div className="modal">
          <div className="modal-head">
            <h3>Sell {security.symbol} across holders</h3>
            <p>Records a Sell for each client below and books realised P/L. Positions fully sold drop off the book.</p>
          </div>
          <div className="modal-body">
            {error && <p className="error-text">{error}</p>}
            <div className="field-row">
              <div className="field">
                <label htmlFor="sell-price">Sale price</label>
                <div className="input-prefix"><span>₹</span>
                  <input id="sell-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
                </div>
              </div>
              <div className="field">
                <label htmlFor="sell-date">Trade date</label>
                <input id="sell-date" type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Quantity per client</span>
                <button type="button" onClick={() => setQtys(Object.fromEntries(rows.map((r) => [r.clientId ?? '', String(r.qty)])))}
                  style={{ background: 'none', border: 0, color: 'var(--brand)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Full exit all</button>
              </label>
              <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                {rows.filter((r) => r.clientId).map((r) => (
                  <div key={r.clientId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--line-soft)' }}>
                    <span style={{ flex: 1, fontSize: 13.5 }}>{r.client}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>holds {r.qty.toLocaleString('en-IN')}</span>
                    <input inputMode="numeric" value={qtys[r.clientId as string] ?? ''} onChange={(e) => setQtys((q) => ({ ...q, [r.clientId as string]: e.target.value.replace(/[^0-9]/g, '') }))}
                      style={{ width: 90, padding: '5px 8px', fontSize: 13 }} />
                  </div>
                ))}
              </div>
            </div>

            <div className="txn-total" style={{ flexDirection: 'column', gap: 4, alignItems: 'stretch' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="lbl">Selling</span><span>{totalQty.toLocaleString('en-IN')} shares · {sells.length} client{sells.length === 1 ? '' : 's'}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="lbl">Gross proceeds</span><span className="amt">{cr(proceeds)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="lbl">Est. realised P/L</span><span className={estRealised >= 0 ? 'num-pos' : 'num-neg'}>{cr(estRealised)}</span></div>
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn" onClick={() => setSellOpen(false)}>Cancel</button>
            <button type="button" className="btn primary" disabled={busy} onClick={submitSell}>{busy ? 'Recording…' : 'Record sale'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
