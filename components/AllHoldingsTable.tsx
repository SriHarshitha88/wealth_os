'use client';

import { cr, inr, pct } from '@/lib/format';
import { useSort, SortTh } from '@/lib/use-sort';

export type AllHoldingRow = {
  client: string; symbol: string; name: string; qty: number; avg: number; cur: number | null;
  investedValue: number; currentValue: number | null; pl: number | null; ret: number | null;
};

export default function AllHoldingsTable({ rows }: { rows: AllHoldingRow[] }) {
  const sort = useSort(rows, 'currentValue', 'desc');
  return (
    <div className="twrap">
      <table>
        <thead>
          <tr>
            <SortTh label="Stock" k="symbol" sort={sort} type="text" left />
            <SortTh label="Client" k="client" sort={sort} type="text" left />
            <SortTh label="Qty" k="qty" sort={sort} />
            <SortTh label="Invested price" k="avg" sort={sort} />
            <SortTh label="Current price" k="cur" sort={sort} />
            <SortTh label="Invested" k="investedValue" sort={sort} />
            <SortTh label="Current" k="currentValue" sort={sort} />
            <SortTh label="P/L" k="pl" sort={sort} />
            <SortTh label="Return" k="ret" sort={sort} />
          </tr>
        </thead>
        <tbody>
          {sort.sorted.map((r, i) => (
            <tr key={i}>
              <td>
                <div className="cell-name">
                  <div className="avatar" style={{ borderRadius: 8, fontSize: 11 }}>{r.symbol.slice(0, 4)}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{r.symbol}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.name}</div>
                  </div>
                </div>
              </td>
              <td style={{ textAlign: 'left' }}>{r.client}</td>
              <td>{r.qty.toLocaleString('en-IN')}</td>
              <td>{inr(r.avg)}</td>
              <td>{r.cur != null ? inr(r.cur) : '—'}</td>
              <td>{cr(r.investedValue)}</td>
              <td>{r.currentValue != null ? cr(r.currentValue) : '—'}</td>
              <td className={r.pl == null ? '' : r.pl >= 0 ? 'num-pos' : 'num-neg'}>{r.pl != null ? cr(r.pl) : '—'}</td>
              <td className={r.ret == null ? '' : r.ret >= 0 ? 'num-pos' : 'num-neg'}>{r.ret != null ? pct(r.ret) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
