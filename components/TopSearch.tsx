'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type ClientHit = { id: string; name: string };
type StockHit = { symbol: string; name: string };

export default function TopSearch() {
  const supabase = createClient();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<ClientHit[]>([]);
  const [stocks, setStocks] = useState<StockHit[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setClients([]); setStocks([]); return; }
    const t = setTimeout(async () => {
      const [c, s] = await Promise.all([
        supabase.from('clients').select('id, name').ilike('name', `%${term}%`).limit(5),
        supabase.from('securities').select('symbol, name').or(`name.ilike.%${term}%,symbol.ilike.%${term}%`).limit(6),
      ]);
      setClients(c.data ?? []);
      setStocks(s.data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [q, supabase]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const go = (href: string) => { setOpen(false); setQ(''); router.push(href); };
  const hasResults = clients.length > 0 || stocks.length > 0;

  return (
    <div className="search-wrap" ref={ref}>
      <div className="search">
        <svg viewBox="0 0 24 24" fill="none" width="15" height="15">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
          <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          placeholder="Search clients or stocks — try “Aditya Birla”"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {open && q.trim().length >= 2 && (
        <div className="search-menu">
          {!hasResults && <div className="search-empty">No matches for “{q.trim()}”</div>}

          {clients.length > 0 && (
            <>
              <div className="search-label">Clients</div>
              {clients.map((c) => (
                <button key={c.id} className="search-item" onClick={() => go(`/clients/${c.id}`)}>
                  <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{c.name.slice(0, 2).toUpperCase()}</div>
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                </button>
              ))}
            </>
          )}

          {stocks.length > 0 && (
            <>
              <div className="search-label">Stocks</div>
              {stocks.map((s) => (
                <button key={s.symbol} className="search-item" onClick={() => go(`/stocks/${encodeURIComponent(s.symbol)}`)}>
                  <div className="avatar" style={{ width: 28, height: 28, fontSize: 10, borderRadius: 7 }}>{s.symbol.slice(0, 4)}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.symbol}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{s.name}</div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
