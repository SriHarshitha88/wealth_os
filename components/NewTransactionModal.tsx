'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { recordTransaction } from '@/app/actions/transactions';

type Security = { id: number; symbol: string; name: string; last_price: number | null };

export default function NewTransactionModal() {
  const router = useRouter();
  const supabase = createClient();

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<'Buy' | 'Sell'>('Buy');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [stockQuery, setStockQuery] = useState('');
  const [security, setSecurity] = useState<Security | null>(null);
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [results, setResults] = useState<Security[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const [error, setError] = useState('');
  const comboRef = useRef<HTMLDivElement>(null);

  // Live search of the securities table (loaded from Angel One's instrument master).
  useEffect(() => {
    if (!menuOpen) return;
    const q = stockQuery.trim();
    if (q.length < 1) { setResults([]); return; } // don't show a default list — type to search
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('securities')
        .select('id, symbol, name, last_price')
        .or(`name.ilike.%${q}%,symbol.ilike.%${q}%`)
        .limit(20);
      setResults(data ?? []);
    }, 180);
    return () => clearTimeout(t);
  }, [stockQuery, menuOpen, supabase]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const total = (parseFloat(qty || '0') || 0) * (parseFloat(price || '0') || 0);
  const stepQty = (d: number) => setQty((q) => String(Math.max(0, (parseInt(q || '0', 10) || 0) + d)));

  function reset() {
    setSide('Buy'); setName(''); setPhone(''); setEmail('');
    setStockQuery(''); setSecurity(null); setQty(''); setPrice(''); setError('');
  }

  async function pick(s: Security) {
    setSecurity(s);
    setStockQuery(s.name);
    setMenuOpen(false);
    // Pull the live current price so it prefills (user can still edit).
    setPriceLoading(true);
    try {
      const res = await fetch(`/api/quote?symbol=${encodeURIComponent(s.symbol)}`);
      const j = await res.json();
      if (j.price != null) setPrice(String(j.price));
      else if (s.last_price != null) setPrice(String(s.last_price));
    } catch {
      if (s.last_price != null) setPrice(String(s.last_price));
    } finally {
      setPriceLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!security) { setError('Please pick a stock from the list.'); return; }
    if (phone.length !== 10) { setError('Enter a 10-digit phone number.'); return; }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email.trim())) {
      setError('Please enter a valid email address.'); return;
    }
    setBusy(true);
    const res = await recordTransaction({
      clientName: name.trim(),
      phone: '+91' + phone,
      email: email.trim() || undefined,
      securityId: security.id,
      side,
      quantity: parseFloat(qty) || 0,
      price: parseFloat(price) || 0,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error ?? 'Something went wrong.'); return; }
    reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button className="btn primary" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" width="15" height="15">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        New transaction
      </button>

      {mounted && createPortal(
        <div className={'overlay' + (open ? ' show' : '')} onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
        <div className="modal">
          <div className="modal-head">
            <h3>New transaction</h3>
            <p>Record a buy or sell. Start typing a stock and the price fills in for you.</p>
          </div>
          <form onSubmit={submit}>
            <div className="modal-body">
              <div className="field">
                <div className="seg">
                  <button type="button" className={'buy' + (side === 'Buy' ? ' on' : '')} onClick={() => setSide('Buy')}>Buy</button>
                  <button type="button" className={'sell' + (side === 'Sell' ? ' on' : '')} onClick={() => setSide('Sell')}>Sell</button>
                </div>
              </div>

              <div className="field">
                <label htmlFor="t-name">Client name</label>
                <input id="t-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rohan Mehta" />
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="t-phone">Phone number</label>
                  <div className="input-prefix"><span>+91</span>
                    <input
                      id="t-phone" type="tel" inputMode="numeric" required value={phone} placeholder="98765 43210"
                      onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="t-email">Email <span style={{ color: 'var(--ink-4)', fontWeight: 500 }}>(optional)</span></label>
                  <input id="t-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rohan@email.com" />
                </div>
              </div>

              <div className="field">
                <label htmlFor="t-stock">Stock</label>
                <div className="combo" ref={comboRef}>
                  <input
                    id="t-stock" autoComplete="off" placeholder="Search a company — try “Reliance” or “TCS”"
                    value={stockQuery}
                    onFocus={() => setMenuOpen(true)}
                    onChange={(e) => { setStockQuery(e.target.value); setSecurity(null); setMenuOpen(true); }}
                  />
                  <div className={'combo-menu' + (menuOpen ? ' show' : '')}>
                    {results.length === 0 ? (
                      <div className="combo-empty">{stockQuery.trim() ? 'No matches — try another name' : 'Start typing a company name'}</div>
                    ) : results.map((s) => (
                      <div key={s.id} className="combo-item" onMouseDown={() => pick(s)}>
                        <div>
                          <div className="nm">{s.name}</div>
                          <div className="sub">{s.symbol} · NSE</div>
                        </div>
                        {s.last_price != null && <div className="ltp">₹{Number(s.last_price).toLocaleString('en-IN')}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="t-price">Price per share {priceLoading && <span style={{ color: 'var(--ink-4)', fontWeight: 500 }}>· fetching…</span>}</label>
                  <div className="input-prefix"><span>₹</span>
                    <input id="t-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={priceLoading ? 'fetching…' : '0'} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="t-qty">Quantity</label>
                  <div className="stepper">
                    <button type="button" aria-label="Decrease quantity" onClick={() => stepQty(-1)}>−</button>
                    <input
                      id="t-qty" inputMode="numeric" value={qty} placeholder="0"
                      onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))}
                    />
                    <button type="button" aria-label="Increase quantity" onClick={() => stepQty(1)}>+</button>
                  </div>
                </div>
              </div>

              <div className="txn-total"><span className="lbl">Total value</span>
                <span className="amt">₹{Math.round(total).toLocaleString('en-IN')}</span>
              </div>

              {error && <p className="error-text">{error}</p>}
            </div>

            <div className="modal-foot">
              <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Record transaction'}</button>
            </div>
          </form>
        </div>
        </div>,
        document.body,
      )}
    </>
  );
}
