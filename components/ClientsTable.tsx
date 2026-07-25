'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteClients } from '@/app/actions/clients';

type Row = { id: string; name: string; phone: string; tier: string };
const tierClass = (t: string) => (t === 'Platinum' ? 'plat' : t === 'Gold' ? 'gold' : 'silv');

export default function ClientsTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const allChecked = rows.length > 0 && sel.size === rows.length;
  const toggle = (id: string) =>
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(rows.map((r) => r.id)));

  async function onDelete() {
    if (!sel.size) return;
    if (!confirm(`Delete ${sel.size} client${sel.size > 1 ? 's' : ''}? This also removes their holdings and transactions. This cannot be undone.`)) return;
    setBusy(true);
    const res = await deleteClients([...sel]);
    setBusy(false);
    if (res.ok) { setSel(new Set()); router.refresh(); }
    else alert(res.error ?? 'Could not delete.');
  }

  return (
    <>
      {sel.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 13.5, color: 'var(--ink-3)' }}>{sel.size} selected</span>
          <button className="btn" style={{ borderColor: 'var(--loss)', color: 'var(--loss)' }} onClick={onDelete} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete selected'}
          </button>
        </div>
      )}

      <div className="card">
        <div className="twrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}><input type="checkbox" aria-label="Select all" checked={allChecked} onChange={toggleAll} /></th>
                <th style={{ textAlign: 'left' }}>Client</th>
                <th style={{ textAlign: 'left' }}>Phone</th>
                <th style={{ textAlign: 'left' }}>Tier</th>
                <th style={{ textAlign: 'left' }}>Report</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><input type="checkbox" aria-label={`Select ${c.name}`} checked={sel.has(c.id)} onChange={() => toggle(c.id)} /></td>
                  <td>
                    <Link href={`/clients/${c.id}`} className="cell-name" style={{ color: 'inherit' }}>
                      <div className="avatar">{c.name.slice(0, 2).toUpperCase()}</div>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                    </Link>
                  </td>
                  <td style={{ textAlign: 'left' }}>{c.phone}</td>
                  <td style={{ textAlign: 'left' }}><span className={'pill ' + tierClass(c.tier)}>{c.tier}</span></td>
                  <td style={{ textAlign: 'left' }}>
                    <a className="btn" href={`/api/report/client/${c.id}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex' }}>
                      <svg viewBox="0 0 24 24" fill="none" width="15" height="15">
                        <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
