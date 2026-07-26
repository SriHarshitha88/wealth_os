'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { importPortfolio } from '@/app/actions/import';

export default function ImportPortfolioModal() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tier, setTier] = useState('Silver');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  function reset() {
    setName(''); setPhone(''); setTier('Silver'); setPurchaseDate('');
    setFileName(''); setError(''); setDone('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setDone('');
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Please choose an Excel file.'); return; }
    if (phone.replace(/\D/g, '').length < 7) { setError('Enter a valid phone number.'); return; }

    const fd = new FormData();
    fd.set('file', file);
    fd.set('clientName', name.trim());
    fd.set('phone', phone.trim());
    fd.set('tier', tier);
    if (purchaseDate) fd.set('purchaseDate', purchaseDate);

    setBusy(true);
    const res = await importPortfolio(fd);
    setBusy(false);
    if (!res.ok) { setError(res.error ?? 'Import failed.'); return; }
    setDone(`Imported ${res.count} holding${res.count === 1 ? '' : 's'} for ${name.trim()}.`);
    router.refresh();
  }

  return (
    <>
      <button className="btn" onClick={() => { reset(); setOpen(true); }}>
        <svg viewBox="0 0 24 24" fill="none" width="15" height="15">
          <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Import from Excel
      </button>

      {mounted && createPortal(
        <div className={'overlay' + (open ? ' show' : '')} onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="modal">
            <div className="modal-head">
              <h3>Import portfolio from Excel</h3>
              <p>Upload a broker holdings sheet (.xlsx). Each row becomes a stock in this client&rsquo;s portfolio.</p>
            </div>
            <form onSubmit={submit}>
              <div className="modal-body">
                <div className="field">
                  <label htmlFor="i-name">Client name</label>
                  <input id="i-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chandrashekar Rama Rao" />
                </div>

                <div className="field-row">
                  <div className="field">
                    <label htmlFor="i-phone">Phone number</label>
                    <input id="i-phone" type="tel" inputMode="numeric" required value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[^0-9+]/g, ''))} placeholder="8503603527" />
                  </div>
                  <div className="field">
                    <label htmlFor="i-tier">Tier</label>
                    <select id="i-tier" value={tier} onChange={(e) => setTier(e.target.value)}>
                      <option>Silver</option><option>Gold</option><option>Platinum</option>
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="i-date">Purchase date <span style={{ color: 'var(--ink-4)', fontWeight: 500 }}>(applies to all rows)</span></label>
                  <input id="i-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
                </div>

                <div className="field">
                  <label htmlFor="i-file">Excel file (.xlsx)</label>
                  <input id="i-file" ref={fileRef} type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')} />
                  {fileName && <p className="help">Selected: {fileName}</p>}
                  <p className="help">Needs columns for company/name, quantity, and average/buy price. A symbol and current-price column are used if present.</p>
                </div>

                {error && <p className="error-text">{error}</p>}
                {done && <p style={{ color: 'var(--gain)', fontSize: 13, fontWeight: 600 }}>{done}</p>}
              </div>

              <div className="modal-foot">
                <button type="button" className="btn" onClick={() => setOpen(false)}>{done ? 'Close' : 'Cancel'}</button>
                <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Importing…' : 'Import portfolio'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
