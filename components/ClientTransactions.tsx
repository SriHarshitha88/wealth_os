'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { addTransaction, updateTransaction, deleteTransaction } from '@/app/actions/transactions';
import { inr } from '@/lib/format';

type Trade = { id: string; side: string; symbol: string; name: string; qty: number; price: number; tradedAt: string };
type Security = { id: number; symbol: string; name: string; last_price: number | null };

const IST = 'Asia/Kolkata';
const toInputDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: IST }); // yyyy-mm-dd
const toNiceDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: IST });

export default function ClientTransactions({ clientId, rows }: { clientId: string; rows: Trade[] }) {
  const router = useRouter();
  const supabase = createClient();

  const [editId, setEditId] = useState<string | null>(null);
  const [eQty, setEQty] = useState(''); const [ePrice, setEPrice] = useState('');
  const [eDate, setEDate] = useState(''); const [eSide, setESide] = useState<'Buy' | 'Sell'>('Buy');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // add-trade form
  const [adding, setAdding] = useState(false);
  const [aSide, setASide] = useState<'Buy' | 'Sell'>('Buy');
  const [aQty, setAQty] = useState(''); const [aPrice, setAPrice] = useState('');
  const [aDate, setADate] = useState(toInputDate(new Date().toISOString()));
  const [stockQuery, setStockQuery] = useState(''); const [security, setSecurity] = useState<Security | null>(null);
  const [results, setResults] = useState<Security[]>([]); const [menuOpen, setMenuOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const q = stockQuery.trim();
    if (q.length < 1) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('securities').select('id, symbol, name, last_price')
        .or(`name.ilike.%${q}%,symbol.ilike.%${q}%`).limit(15);
      setResults(data ?? []);
    }, 180);
    return () => clearTimeout(t);
  }, [stockQuery, menuOpen, supabase]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (comboRef.current && !comboRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function startEdit(t: Trade) {
    setEditId(t.id); setError('');
    setEQty(String(t.qty)); setEPrice(String(t.price));
    setEDate(toInputDate(t.tradedAt)); setESide(t.side === 'Sell' ? 'Sell' : 'Buy');
  }

  async function saveEdit(id: string) {
    setBusy(true); setError('');
    const res = await updateTransaction({ id, side: eSide, quantity: parseFloat(eQty) || 0, price: parseFloat(ePrice) || 0, tradedAt: eDate || undefined });
    setBusy(false);
    if (!res.ok) { setError(res.error ?? 'Could not save.'); return; }
    setEditId(null); router.refresh();
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this transaction? Holdings and realised P/L will recompute.')) return;
    setBusy(true); setError('');
    const res = await deleteTransaction(id);
    setBusy(false);
    if (!res.ok) { setError(res.error ?? 'Could not delete.'); return; }
    router.refresh();
  }

  function pick(s: Security) {
    setSecurity(s); setStockQuery(s.name); setMenuOpen(false);
    if (s.last_price != null && !aPrice) setAPrice(String(s.last_price));
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (!security) { setError('Pick a stock first.'); return; }
    if (!(parseFloat(aQty) > 0)) { setError('Enter a quantity.'); return; }
    setBusy(true);
    const res = await addTransaction({ clientId, securityId: security.id, side: aSide, quantity: parseFloat(aQty) || 0, price: parseFloat(aPrice) || 0, tradedAt: aDate || undefined });
    setBusy(false);
    if (!res.ok) { setError(res.error ?? 'Could not add.'); return; }
    setAdding(false); setSecurity(null); setStockQuery(''); setAQty(''); setAPrice('');
    router.refresh();
  }

  return (
    <div className="card" id="client-transactions">
      <div className="card-head">
        <h3>Transactions</h3>
        <button className="btn primary" style={{ padding: '7px 13px' }} onClick={() => { setAdding((v) => !v); setError(''); }}>
          <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          Add trade
        </button>
      </div>

      {adding && (
        <form onSubmit={onAdd} style={{ padding: '14px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0, flex: '2 1 220px' }}>
            <label>Stock</label>
            <div className="combo" ref={comboRef}>
              <input autoComplete="off" placeholder="Search a company…" value={stockQuery}
                onFocus={() => setMenuOpen(true)}
                onChange={(e) => { setStockQuery(e.target.value); setSecurity(null); setMenuOpen(true); }} />
              <div className={'combo-menu' + (menuOpen ? ' show' : '')}>
                {results.length === 0 ? (
                  <div className="combo-empty">{stockQuery.trim() ? 'No matches' : 'Type a company name'}</div>
                ) : results.map((s) => (
                  <div key={s.id} className="combo-item" onMouseDown={() => pick(s)}>
                    <div><div className="nm">{s.name}</div><div className="sub">{s.symbol}</div></div>
                    {s.last_price != null && <div className="ltp">₹{Number(s.last_price).toLocaleString('en-IN')}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="field" style={{ margin: 0, flex: '0 0 96px' }}>
            <label>Side</label>
            <select value={aSide} onChange={(e) => setASide(e.target.value as 'Buy' | 'Sell')}><option>Buy</option><option>Sell</option></select>
          </div>
          <div className="field" style={{ margin: 0, flex: '0 0 90px' }}>
            <label>Qty</label>
            <input inputMode="numeric" value={aQty} onChange={(e) => setAQty(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />
          </div>
          <div className="field" style={{ margin: 0, flex: '0 0 110px' }}>
            <label>Price</label>
            <input inputMode="decimal" value={aPrice} onChange={(e) => setAPrice(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />
          </div>
          <div className="field" style={{ margin: 0, flex: '0 0 150px' }}>
            <label>Date</label>
            <input type="date" value={aDate} onChange={(e) => setADate(e.target.value)} />
          </div>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      )}

      {error && <p className="error-text" style={{ padding: '8px 20px 0' }}>{error}</p>}

      <div className="twrap">
        <table>
          <thead>
            <tr><th>Date</th><th style={{ textAlign: 'left' }}>Trade</th><th>Qty</th><th>Price</th><th>Value</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 24 }}>No transactions yet.</td></tr>}
            {rows.map((t) => editId === t.id ? (
              <tr key={t.id}>
                <td><input type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} style={{ padding: '7px 9px' }} /></td>
                <td style={{ textAlign: 'left' }}>
                  <select value={eSide} onChange={(e) => setESide(e.target.value as 'Buy' | 'Sell')} style={{ padding: '7px 9px' }}><option>Buy</option><option>Sell</option></select>
                  <span style={{ marginLeft: 8, fontWeight: 600 }}>{t.symbol}</span>
                </td>
                <td><input inputMode="numeric" value={eQty} onChange={(e) => setEQty(e.target.value.replace(/[^0-9.]/g, ''))} style={{ width: 80, padding: '7px 9px', textAlign: 'right' }} /></td>
                <td><input inputMode="decimal" value={ePrice} onChange={(e) => setEPrice(e.target.value.replace(/[^0-9.]/g, ''))} style={{ width: 90, padding: '7px 9px', textAlign: 'right' }} /></td>
                <td>{inr((parseFloat(eQty) || 0) * (parseFloat(ePrice) || 0))}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn primary" style={{ padding: '6px 10px' }} onClick={() => saveEdit(t.id)} disabled={busy}>Save</button>{' '}
                  <button className="btn" style={{ padding: '6px 10px' }} onClick={() => setEditId(null)}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={t.id}>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{toNiceDate(t.tradedAt)}</td>
                <td style={{ textAlign: 'left' }}>
                  <span style={{ fontWeight: 700, color: t.side === 'Sell' ? 'var(--loss)' : 'var(--gain)' }}>{t.side}</span>{' '}
                  <span style={{ fontWeight: 600 }}>{t.symbol}</span>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t.name}</div>
                </td>
                <td>{t.qty.toLocaleString('en-IN')}</td>
                <td>{inr(t.price)}</td>
                <td>{inr(t.qty * t.price)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn" style={{ padding: '6px 10px' }} onClick={() => startEdit(t)}>Edit</button>{' '}
                  <button className="btn" style={{ padding: '6px 10px', borderColor: 'var(--loss)', color: 'var(--loss)' }} onClick={() => onDelete(t.id)} disabled={busy}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
