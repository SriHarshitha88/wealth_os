'use client';

import { useState } from 'react';
import { cr, inr } from '@/lib/format';
import { fyLabelOf, currentFY, type CGBucket } from '@/lib/capital-gains';

export type GainSlice = {
  symbol: string; name: string; buyDate: string; sellDate: string; qty: number;
  buyPrice: number; sellPrice: number; cost: number; proceeds: number; gain: number;
  holdingDays: number; longTerm: boolean;
};

const fmtD = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata' });
const empty = (): CGBucket => ({ count: 0, qty: 0, proceeds: 0, cost: 0, gain: 0 });
const glCls = (n: number) => (Math.abs(n) < 0.005 ? '' : n >= 0 ? 'num-pos' : 'num-neg');

export default function CapitalGains({
  clientId, slices, fyList, unreal,
}: { clientId: string; slices: GainSlice[]; fyList: string[]; unreal: { short: CGBucket; long: CGBucket; daysToLTCG: number | null } }) {
  const options = fyList.length ? fyList : [currentFY()];
  const [fy, setFy] = useState(options[0]);

  const inFy = slices.filter((s) => fyLabelOf(s.sellDate) === fy).sort((a, b) => new Date(b.sellDate).getTime() - new Date(a.sellDate).getTime());
  const st = empty(), lt = empty();
  for (const s of inFy) { const b = s.longTerm ? lt : st; b.count++; b.qty += s.qty; b.proceeds += s.proceeds; b.cost += s.cost; b.gain += s.gain; }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Capital gains</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>FY</label>
          <select value={fy} onChange={(e) => setFy(e.target.value)} style={{ padding: '6px 8px', fontSize: 13 }}>
            {options.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <a className="btn" style={{ padding: '7px 12px' }} href={`/api/report/gains/${clientId}?fy=${fy}`} target="_blank" rel="noopener">Download statement</a>
        </div>
      </div>

      <div style={{ padding: '14px 20px' }}>
        {/* realised summary */}
        <div className="fee-figs" style={{ marginBottom: 14 }}>
          <div className="fee-fig"><div className="eyebrow">Short-term (≤365d)</div><div className="v" style={{ color: st.gain >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{cr(st.gain)}</div></div>
          <div className="fee-fig"><div className="eyebrow">Long-term (&gt;365d)</div><div className="v" style={{ color: lt.gain >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{cr(lt.gain)}</div></div>
          <div className="fee-fig"><div className="eyebrow">Total realised · FY {fy}</div><div className="v">{cr(st.gain + lt.gain)}</div></div>
        </div>

        {inFy.length === 0 ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 13, margin: '4px 0 8px' }}>No stocks sold in FY {fy}.</p>
        ) : (
          <div className="twrap" style={{ marginBottom: 8 }}>
            <table>
              <thead>
                <tr><th>Stock</th><th>Bought</th><th>Sold</th><th>Days</th><th>Qty</th><th>Buy value</th><th>Sell value</th><th>Gain / (Loss)</th><th>Type</th></tr>
              </thead>
              <tbody>
                {inFy.map((s, i) => (
                  <tr key={i}>
                    <td><span style={{ fontWeight: 600 }}>{s.symbol}</span></td>
                    <td style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>{fmtD(s.buyDate)}</td>
                    <td style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>{fmtD(s.sellDate)}</td>
                    <td>{s.holdingDays}</td>
                    <td>{s.qty.toLocaleString('en-IN')}</td>
                    <td>{cr(s.cost)}</td>
                    <td>{cr(s.proceeds)}</td>
                    <td className={glCls(s.gain)}>{cr(s.gain)}</td>
                    <td><span className={'pill ' + (s.longTerm ? 'gain' : 'silv')} style={{ fontSize: 11 }}>{s.longTerm ? 'LTCG' : 'STCG'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* unrealised (as of today) */}
        <div style={{ marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--line-soft)' }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Unrealised — if sold today</div>
          <div className="fee-figs">
            <div className="fee-fig"><div className="eyebrow">Would be short-term</div><div className="v" style={{ fontSize: 16, color: unreal.short.gain >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{cr(unreal.short.gain)}</div></div>
            <div className="fee-fig"><div className="eyebrow">Would be long-term</div><div className="v" style={{ fontSize: 16, color: unreal.long.gain >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{cr(unreal.long.gain)}</div></div>
            {unreal.daysToLTCG != null && (
              <div className="fee-fig"><div className="eyebrow">Nearest lot to long-term</div><div className="v" style={{ fontSize: 16, color: 'var(--brass)' }}>{unreal.daysToLTCG === 0 ? 'now' : `${unreal.daysToLTCG} days`}</div></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
