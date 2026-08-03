'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { addTransaction, updateTransaction } from '@/app/actions/transactions';
import { resolveStocksLive } from '@/lib/stock-search';
import { cr, inr, pct } from '@/lib/format';
import { useSort, SortTh } from '@/lib/use-sort';

export type HoldingRow = {
  securityId: number;
  singleBuyId: string | null; // set when exactly one Buy backs this holding (edit inline)
  symbol: string; name: string;
  qty: number; avg: number; cur: number | null;
  invested: number; current: number | null; pl: number | null; ret: number | null; realised: number;
  firstBuyDate: string | null; xirr: number | null; daysToLTCG: number | null;
  closed: boolean;
};

const fmtD = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata' }) : '—';
type Security = { id: number; symbol: string; name: string; exchange?: string; last_price: number | null };

export default function ClientHoldings({ clientId, rows }: { clientId: string; rows: HoldingRow[] }) {
  const router = useRouter();
  const supabase = createClient();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sort = useSort(rows, 'current', 'desc');

  // inline edit of a holding (its single backing Buy: quantity + average cost)
  const [editId, setEditId] = useState<string | null>(null);
  const [eQty, setEQty] = useState('');
  const [ePrice, setEPrice] = useState('');

  // add-stock form
  const [adding, setAdding] = useState(false);
  const [aQty, setAQty] = useState('');
  const [aPrice, setAPrice] = useState('');
  const [aDate, setADate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
  const [stockQuery, setStockQuery] = useState('');
  const [security, setSecurity] = useState<Security | null>(null);
  const [results, setResults] = useState<Security[]>([]);
  const [resolving, setResolving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);

  // Live search of the securities table; self-heal from Yahoo when nothing matches.
  useEffect(() => {
    if (!menuOpen) return;
    const q = stockQuery.trim();
    if (q.length < 1) { setResults([]); setResolving(false); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase.from('securities').select('id, symbol, name, exchange, last_price')
        .or(`name.ilike.%${q}%,symbol.ilike.%${q}%`).limit(15);
      if (cancelled) return;
      if (data && data.length) { setResults(data); setResolving(false); return; }
      if (q.length < 2) { setResults([]); return; }
      setResolving(true);
      const live = await resolveStocksLive(q);
      if (cancelled) return;
      setResults(live);
      setResolving(false);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [stockQuery, menuOpen, supabase]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (comboRef.current && !comboRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function startEdit(r: HoldingRow) {
    if (!r.singleBuyId) return;
    setEditId(r.singleBuyId); setError('');
    setEQty(String(r.qty)); setEPrice(String(r.avg));
  }

  async function saveEdit(id: string) {
    if (!(parseFloat(eQty) > 0)) { setError('Quantity must be greater than zero.'); return; }
    setBusy(true); setError('');
    const res = await updateTransaction({ id, quantity: parseFloat(eQty) || 0, price: parseFloat(ePrice) || 0 });
    setBusy(false);
    if (!res.ok) { setError(res.error ?? 'Could not save.'); return; }
    setEditId(null); router.refresh();
  }

  function scrollToTransactions() {
    document.getElementById('client-transactions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function pick(s: Security) {
    setSecurity(s); setStockQuery(s.name); setMenuOpen(false);
    // prefill the live current price (editable)
    setPriceLoading(true);
    try {
      const res = await fetch(`/api/quote?symbol=${encodeURIComponent(s.symbol)}&exchange=${s.exchange ?? 'NSE'}`);
      const j = await res.json();
      if (j.price != null) setAPrice(String(j.price));
      else if (s.last_price != null) setAPrice(String(s.last_price));
    } catch {
      if (s.last_price != null) setAPrice(String(s.last_price));
    } finally {
      setPriceLoading(false);
    }
  }

  function resetAdd() {
    setSecurity(null); setStockQuery(''); setAQty(''); setAPrice('');
    setADate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (!security) { setError('Pick a stock first.'); return; }
    if (!(parseFloat(aQty) > 0)) { setError('Enter a quantity.'); return; }
    setBusy(true);
    const res = await addTransaction({
      clientId, securityId: security.id, side: 'Buy',
      quantity: parseFloat(aQty) || 0, price: parseFloat(aPrice) || 0, tradedAt: aDate || undefined,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error ?? 'Could not add.'); return; }
    setAdding(false); resetAdd(); router.refresh();
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <h3>Holdings</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="eyebrow" style={{ fontSize: 11 }}>{rows.length} stock{rows.length === 1 ? '' : 's'}</span>
          <button className="btn primary" style={{ padding: '7px 13px' }} onClick={() => { setAdding((v) => !v); setError(''); }}>
            <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            Add stock
          </button>
        </div>
      </div>

      {adding && (
        <form onSubmit={onAdd} style={{ padding: '14px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0, flex: '2 1 220px' }}>
            <label>Stock</label>
            <div className="combo" ref={comboRef}>
              <input autoComplete="off" placeholder="Search a company — try “Reliance” or “TCS”" value={stockQuery}
                onFocus={() => setMenuOpen(true)}
                onChange={(e) => { setStockQuery(e.target.value); setSecurity(null); setMenuOpen(true); }} />
              <div className={'combo-menu' + (menuOpen ? ' show' : '')}>
                {results.length === 0 ? (
                  <div className="combo-empty">{resolving ? 'Searching live market…' : (stockQuery.trim() ? 'No matches' : 'Type a company name')}</div>
                ) : results.map((s) => (
                  <div key={s.id} className="combo-item" onMouseDown={() => pick(s)}>
                    <div><div className="nm">{s.name}</div><div className="sub">{s.symbol} · {s.exchange ?? 'NSE'}</div></div>
                    {s.last_price != null && <div className="ltp">₹{Number(s.last_price).toLocaleString('en-IN')}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="field" style={{ margin: 0, flex: '0 0 96px' }}>
            <label>Qty</label>
            <input inputMode="numeric" value={aQty} onChange={(e) => setAQty(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />
          </div>
          <div className="field" style={{ margin: 0, flex: '0 0 120px' }}>
            <label>Avg price {priceLoading && <span style={{ color: 'var(--ink-4)', fontWeight: 500 }}>· …</span>}</label>
            <input inputMode="decimal" value={aPrice} onChange={(e) => setAPrice(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={priceLoading ? 'fetching…' : '0'} />
          </div>
          <div className="field" style={{ margin: 0, flex: '0 0 150px' }}>
            <label>Date</label>
            <input type="date" value={aDate} onChange={(e) => setADate(e.target.value)} />
          </div>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Add to portfolio'}</button>
          <button type="button" className="btn" onClick={() => { setAdding(false); resetAdd(); }}>Cancel</button>
        </form>
      )}

      {error && <p className="error-text" style={{ padding: '8px 20px 0' }}>{error}</p>}

      {rows.length === 0 ? (
        <div className="empty">
          <p style={{ fontFamily: 'var(--serif)', fontSize: 18, marginBottom: 6 }}>No holdings yet.</p>
          <p style={{ color: 'var(--ink-3)', margin: 0 }}>Use “Add stock” above, or import a portfolio from Excel.</p>
        </div>
      ) : (
        <div className="twrap">
          <table>
            <thead>
              <tr>
                <SortTh label="Stock" k="symbol" sort={sort} type="text" left />
                <SortTh label="Qty" k="qty" sort={sort} />
                <SortTh label="Avg cost" k="avg" sort={sort} />
                <SortTh label="Since" k="firstBuyDate" sort={sort} type="date" />
                <SortTh label="Current price" k="cur" sort={sort} />
                <SortTh label="Invested" k="invested" sort={sort} />
                <SortTh label="Current" k="current" sort={sort} />
                <SortTh label="Unrealized P/L" k="pl" sort={sort} />
                <SortTh label="Return" k="ret" sort={sort} />
                <SortTh label="XIRR" k="xirr" sort={sort} />
                <SortTh label="Realized" k="realised" sort={sort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sort.sorted.map((r) => editId && r.singleBuyId === editId ? (
                <tr key={r.securityId}>
                  <td>
                    <div className="cell-name">
                      <div className="avatar" style={{ borderRadius: 8, fontSize: 11 }}>{r.symbol.slice(0, 4)}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{r.symbol}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.name}</div>
                      </div>
                    </div>
                  </td>
                  <td><input inputMode="numeric" value={eQty} onChange={(e) => setEQty(e.target.value.replace(/[^0-9.]/g, ''))} style={{ width: 80, padding: '7px 9px', textAlign: 'right' }} /></td>
                  <td><input inputMode="decimal" value={ePrice} onChange={(e) => setEPrice(e.target.value.replace(/[^0-9.]/g, ''))} style={{ width: 90, padding: '7px 9px', textAlign: 'right' }} /></td>
                  <td style={{ color: 'var(--ink-3)' }}>—</td>
                  <td>{r.cur != null ? inr(r.cur) : '—'}</td>
                  <td>{cr((parseFloat(eQty) || 0) * (parseFloat(ePrice) || 0))}</td>
                  <td colSpan={5} style={{ color: 'var(--ink-3)', fontSize: 12 }}>Recalculates on save</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn primary" style={{ padding: '6px 10px' }} onClick={() => saveEdit(editId)} disabled={busy}>Save</button>{' '}
                    <button className="btn" style={{ padding: '6px 10px' }} onClick={() => setEditId(null)}>Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={r.securityId}>
                  <td>
                    <div className="cell-name">
                      <div className="avatar" style={{ borderRadius: 8, fontSize: 11 }}>{r.symbol.slice(0, 4)}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{r.symbol}{r.closed && <span className="pill silv" style={{ marginLeft: 8 }}>Closed</span>}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.name}</div>
                      </div>
                    </div>
                  </td>
                  <td>{!r.closed ? r.qty.toLocaleString('en-IN') : '—'}</td>
                  <td>{!r.closed ? inr(r.avg) : '—'}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                    {!r.closed ? fmtD(r.firstBuyDate) : '—'}
                    {!r.closed && r.daysToLTCG != null && r.daysToLTCG > 0 && <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>LT in {r.daysToLTCG}d</div>}
                  </td>
                  <td>{r.cur != null ? inr(r.cur) : '—'}</td>
                  <td>{!r.closed ? cr(r.invested) : '—'}</td>
                  <td>{r.current != null ? cr(r.current) : '—'}</td>
                  <td className={r.pl == null ? '' : r.pl >= 0 ? 'num-pos' : 'num-neg'}>{r.pl != null ? cr(r.pl) : '—'}</td>
                  <td className={r.ret == null ? '' : r.ret >= 0 ? 'num-pos' : 'num-neg'}>{r.ret != null ? pct(r.ret) : '—'}</td>
                  <td className={r.xirr == null ? '' : r.xirr >= 0 ? 'num-pos' : 'num-neg'}>{r.xirr != null ? pct(r.xirr) : '—'}</td>
                  <td className={Math.abs(r.realised) < 0.005 ? '' : r.realised >= 0 ? 'num-pos' : 'num-neg'}>{Math.abs(r.realised) < 0.005 ? '—' : cr(r.realised)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.closed ? null : r.singleBuyId ? (
                      <button className="btn" style={{ padding: '6px 10px' }} onClick={() => startEdit(r)}>Edit</button>
                    ) : (
                      <button className="btn" style={{ padding: '6px 10px' }} title="This holding has multiple trades — edit them individually below" onClick={scrollToTransactions}>Edit trades ↓</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
