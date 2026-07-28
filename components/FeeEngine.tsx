'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cr } from '@/lib/format';
import { BAND_RATES, BAND_STEP } from '@/lib/fee-schedule';
import { raiseFee, recordMilestone } from '@/app/actions/fees';

export type FeeCollected = { level: number | null; isAbove: boolean; amount: number; date: string | null };
export type FeeRow = {
  id: string; name: string; capital: number; current: number; invested: number;
  gainPct: number; reachedBands: number; chargedBands: number; reachedPct: number;
  nextMilestonePct: number | null; nextMilestoneValue: number | null; progressPct: number; feeDue: number;
  collected: FeeCollected[];
};

const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';

function ladderFor(row: FeeRow) {
  const bandValue = 0.2 * row.capital;
  return BAND_RATES.map((rate, i) => {
    const level = i + 1;
    const status = level <= row.chargedBands ? 'billed' : level <= row.reachedBands ? 'due' : 'upcoming';
    return {
      level, milestonePct: level * BAND_STEP, rate, target: row.capital * (1 + 0.2 * level),
      fee: (rate / 100) * bandValue, status,
      date: row.collected.find((c) => c.level === level)?.date ?? null,
    } as const;
  });
}

export default function FeeEngine({ rows }: { rows: FeeRow[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dates, setDates] = useState<Record<number, string>>({});

  const row = rows.find((r) => r.id === openId) ?? null;

  function close() { setOpenId(null); setError(''); setDates({}); }

  async function billAll(r: FeeRow) {
    if (!confirm(`Bill the crossed milestone(s) for ${r.name} — ${cr(r.feeDue)} — dated today?`)) return;
    setBusy(true); setError('');
    const res = await raiseFee(r.id);
    setBusy(false);
    if (res.ok) router.refresh(); else setError(res.error ?? 'Could not bill the fee.');
  }

  async function record(r: FeeRow, level: number) {
    const date = dates[level] || todayIST();
    setBusy(true); setError('');
    const res = await recordMilestone(r.id, level, date);
    setBusy(false);
    if (res.ok) router.refresh(); else setError(res.error ?? 'Could not record the milestone.');
  }

  return (
    <>
      <div className="fee-grid">
        {rows.map((r) => {
          const billedPct = r.chargedBands * BAND_STEP;
          const status = r.feeDue > 0 ? 'Fee due' : r.current < r.capital ? 'Below capital' : r.chargedBands >= 5 ? 'Fully billed' : 'On track';
          return (
            <div className="fee-card" key={r.id}>
              <button type="button" className="fee-top" onClick={() => setOpenId(r.id)}
                style={{ width: '100%', background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', color: 'var(--ink)', font: 'inherit' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="avatar">{r.name.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{r.name}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
                      {r.gainPct >= 0 ? '+' : ''}{r.gainPct.toFixed(1)}% appreciation · billed to +{billedPct}% · view detail →
                    </div>
                  </div>
                </div>
                <span className={'pill ' + (r.feeDue > 0 ? 'warn dot' : r.current < r.capital ? 'silv' : 'gain dot')}>{status}</span>
              </button>

              <div className="fee-figs" style={{ marginTop: 16 }}>
                <div className="fee-fig"><div className="eyebrow">Capital</div><div className="v">{cr(r.capital)}</div></div>
                <div className="fee-fig"><div className="eyebrow">Current value</div><div className="v" style={{ color: r.current < r.capital ? 'var(--loss)' : 'var(--gain)' }}>{cr(r.current)}</div></div>
                <div className="fee-fig">
                  <div className="eyebrow">{r.nextMilestonePct ? `Next (+${r.nextMilestonePct}%)` : 'Above +100%'}</div>
                  <div className="v" style={{ color: 'var(--brass)' }}>{r.nextMilestoneValue ? cr(r.nextMilestoneValue) : '25% flat'}</div>
                </div>
                <div className="fee-fig"><div className="eyebrow">Fee payable now</div><div className="v">{cr(r.feeDue)}</div></div>
              </div>

              <div className="feebar"><div className={'feebar-fill' + (r.feeDue > 0 ? ' over' : '')} style={{ width: `${r.feeDue > 0 ? 100 : r.progressPct}%` }} /></div>
              <div className="feebar-labels">
                <span>Reached +{r.reachedPct}%</span>
                <span>{r.feeDue > 0 ? 'Milestone crossed' : r.nextMilestonePct ? `${r.progressPct.toFixed(0)}% to +${r.nextMilestonePct}%` : 'Max slab'}</span>
                <span>{r.nextMilestonePct ? `Next +${r.nextMilestonePct}%` : '—'}</span>
              </div>

              {r.feeDue > 0 && (
                <div className="callout brass" style={{ marginTop: 16 }}>
                  <svg viewBox="0 0 24 24" fill="none" width="20" height="20" style={{ color: 'var(--brass)', flex: 'none' }}>
                    <path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div>Crossed the +{r.reachedPct}% milestone.</div>
                  <button className="btn primary" disabled={busy} onClick={() => billAll(r)}>{busy ? 'Billing…' : `Bill ${cr(r.feeDue)}`}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ---- client fee detail drawer ---- */}
      <div className={'drawer-scrim' + (row ? ' show' : '')} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} />
      <aside className={'drawer' + (row ? ' show' : '')} aria-hidden={!row}>
        {row && (
          <>
            <div className="drawer-head">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="eyebrow">Performance fee</div>
                  <h3 style={{ fontSize: 19, margin: '2px 0 0' }}>{row.name}</h3>
                  <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 3 }}>
                    Capital {cr(row.capital)} · now {cr(row.current)} · <b style={{ color: row.gainPct >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{row.gainPct >= 0 ? '+' : ''}{row.gainPct.toFixed(1)}%</b>
                  </div>
                </div>
                <button className="btn" onClick={close} aria-label="Close" style={{ padding: '6px 10px' }}>✕</button>
              </div>
            </div>

            <div className="drawer-body">
              {error && <p className="error-text">{error}</p>}

              <div className="eyebrow" style={{ marginBottom: 8 }}>Milestone ladder</div>
              {ladderFor(row).map((m) => (
                <div className="mile-row" key={m.level}>
                  <div className="mile-dot" style={{
                    background: m.status === 'billed' ? 'var(--gain-tint,#e6f4ee)' : m.status === 'due' ? 'var(--brass-tint)' : 'var(--surface-2)',
                    color: m.status === 'billed' ? 'var(--gain)' : m.status === 'due' ? 'var(--brass)' : 'var(--ink-4)',
                  }}>{m.status === 'billed' ? '✓' : m.level}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>+{m.milestonePct}% appreciation · {m.rate}%</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                      target {cr(m.target)} · fee {cr(m.fee)}
                      {m.status === 'billed' && ` · billed ${fmtDate(m.date)}`}
                    </div>
                  </div>
                  {m.status === 'due' && m.level === row.chargedBands + 1 && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="date" value={dates[m.level] ?? todayIST()} max={todayIST()}
                        onChange={(e) => setDates((d) => ({ ...d, [m.level]: e.target.value }))}
                        style={{ padding: '5px 7px', fontSize: 12 }} />
                      <button className="btn primary" disabled={busy} style={{ padding: '6px 10px' }} onClick={() => record(row, m.level)}>
                        {busy ? '…' : 'Record'}
                      </button>
                    </div>
                  )}
                  {m.status === 'due' && m.level !== row.chargedBands + 1 && (
                    <span className="pill warn" style={{ fontSize: 11 }}>crossed</span>
                  )}
                  {m.status === 'upcoming' && <span className="pill silv" style={{ fontSize: 11 }}>upcoming</span>}
                </div>
              ))}

              <div className="eyebrow" style={{ margin: '18px 0 8px' }}>Billed history</div>
              {row.collected.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>No fees billed yet.</p>
              ) : row.collected.map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--line-soft)' }}>
                  <span style={{ color: 'var(--ink-2)' }}>{c.isAbove ? 'Above +100%' : `+${(c.level ?? 0) * BAND_STEP}% milestone`} · {fmtDate(c.date)}</span>
                  <b>{cr(c.amount)}</b>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0 0', fontWeight: 700 }}>
                <span>Total collected</span><span>{cr(row.collected.reduce((a, c) => a + c.amount, 0))}</span>
              </div>
            </div>

            <div className="drawer-foot">
              {row.feeDue > 0 && <button className="btn primary" disabled={busy} onClick={() => billAll(row)}>{busy ? 'Billing…' : `Bill ${cr(row.feeDue)} now`}</button>}
              <a className="btn" href={`/api/report/fees/${row.id}`} target="_blank" rel="noopener" style={{ marginLeft: 'auto' }}>Download statement</a>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
