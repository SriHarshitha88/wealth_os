'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type SortDir = 'asc' | 'desc';
export type ColType = 'text' | 'number' | 'date';

export type Filter =
  | { t: 'number'; op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'between'; a: number; b?: number }
  | { t: 'text'; op: 'contains' | 'ncontains' | 'eq' | 'starts' | 'ends'; q: string }
  | { t: 'date'; op: 'after' | 'before' | 'between'; a: string; b?: string };

export type Sorter<T> = {
  key: string | null; dir: SortDir; set: (k: string, d: SortDir) => void; clear: () => void;
  filters: Record<string, Filter>; setFilter: (k: string, f: Filter | null) => void;
  sorted: T[];
};

function cmp(a: unknown, b: unknown): number {
  const an = a == null || a === '', bn = b == null || b === '';
  if (an && bn) return 0; if (an) return 1; if (bn) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function matchFilter(value: unknown, f: Filter): boolean {
  if (f.t === 'number') {
    const v = Number(value);
    if (value == null || value === '' || Number.isNaN(v)) return false;
    switch (f.op) {
      case 'gt': return v > f.a; case 'gte': return v >= f.a; case 'lt': return v < f.a;
      case 'lte': return v <= f.a; case 'eq': return v === f.a; case 'neq': return v !== f.a;
      case 'between': return v >= f.a && v <= (f.b ?? f.a);
    }
  }
  if (f.t === 'text') {
    const s = String(value ?? '').toLowerCase(); const q = f.q.toLowerCase();
    if (!q) return true;
    switch (f.op) {
      case 'contains': return s.includes(q); case 'ncontains': return !s.includes(q);
      case 'eq': return s === q; case 'starts': return s.startsWith(q); case 'ends': return s.endsWith(q);
    }
  }
  if (f.t === 'date') {
    const d = String(value ?? '').slice(0, 10);
    if (!d) return false;
    switch (f.op) {
      case 'after': return d > f.a; case 'before': return d < f.a;
      case 'between': return d >= f.a && d <= (f.b ?? f.a);
    }
  }
  return true;
}

export function useSort<T extends Record<string, any>>(
  rows: T[], initialKey: string | null = null, initialDir: SortDir = 'desc',
  accessors?: Record<string, (r: T) => unknown>,
): Sorter<T> {
  const [key, setKey] = useState<string | null>(initialKey);
  const [dir, setDir] = useState<SortDir>(initialDir);
  const [filters, setFilters] = useState<Record<string, Filter>>({});
  const get = (r: T, k: string) => (accessors && accessors[k] ? accessors[k](r) : r[k]);

  const sorted = useMemo(() => {
    const entries = Object.entries(filters);
    const filtered = entries.length ? rows.filter((r) => entries.every(([k, f]) => matchFilter(get(r, k), f))) : rows;
    if (!key) return filtered;
    const arr = [...filtered].sort((a, b) => cmp(get(a, key), get(b, key)));
    return dir === 'asc' ? arr : arr.reverse();
  }, [rows, key, dir, filters, accessors]);

  return {
    key, dir, set: (k, d) => { setKey(k); setDir(d); }, clear: () => setKey(null),
    filters, setFilter: (k, f) => setFilters((p) => { const n = { ...p }; if (f) n[k] = f; else delete n[k]; return n; }),
    sorted,
  };
}

const SORT_OPTS: Record<ColType, { dir: SortDir; label: string }[]> = {
  text: [{ dir: 'asc', label: 'Sort A → Z' }, { dir: 'desc', label: 'Sort Z → A' }],
  number: [{ dir: 'desc', label: 'Highest first' }, { dir: 'asc', label: 'Lowest first' }],
  date: [{ dir: 'desc', label: 'Newest first' }, { dir: 'asc', label: 'Oldest first' }],
};
const FILTER_OPS: Record<ColType, [string, string][]> = {
  number: [['gt', 'Greater than'], ['gte', 'Greater or equal'], ['lt', 'Less than'], ['lte', 'Less or equal'], ['eq', 'Equals'], ['neq', 'Does not equal'], ['between', 'Between']],
  text: [['contains', 'Contains'], ['ncontains', 'Does not contain'], ['eq', 'Equals'], ['starts', 'Begins with'], ['ends', 'Ends with']],
  date: [['after', 'After'], ['before', 'Before'], ['between', 'Between']],
};
const defaultOp = (t: ColType) => FILTER_OPS[t][0][0];

export function SortTh({ label, k, sort, type = 'number', left = false, style }:
  { label: ReactNode; k: string; sort: Sorter<any>; type?: ColType; left?: boolean; style?: React.CSSProperties }) {
  const active = sort.key === k;
  const filtered = !!sort.filters[k];
  const [menu, setMenu] = useState<{ y: number; x: number; right: boolean } | null>(null);
  const [f, setF] = useState<{ op: string; a: string; b: string }>({ op: defaultOp(type), a: '', b: '' });

  function open(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const cur = sort.filters[k] as any;
    setF(cur ? { op: cur.op, a: String(cur.a ?? cur.q ?? ''), b: String(cur.b ?? '') } : { op: defaultOp(type), a: '', b: '' });
    setMenu({ y: r.bottom + 4, x: left ? r.left : r.right, right: !left });
  }

  function apply() {
    let filter: Filter | null = null;
    if (type === 'number') { const a = parseFloat(f.a); if (!Number.isNaN(a)) filter = { t: 'number', op: f.op as any, a, b: f.op === 'between' ? parseFloat(f.b) : undefined }; }
    else if (type === 'text') { if (f.a.trim()) filter = { t: 'text', op: f.op as any, q: f.a.trim() }; }
    else if (type === 'date') { if (f.a) filter = { t: 'date', op: f.op as any, a: f.a, b: f.op === 'between' ? f.b : undefined }; }
    sort.setFilter(k, filter);
    setMenu(null);
  }

  const inputType = type === 'number' ? 'number' : type === 'date' ? 'date' : 'text';

  return (
    <th className="sort-th" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      style={{ textAlign: left ? 'left' : 'right', ...style }}>
      <button type="button" className={'sort-btn' + (active ? ' on' : '')} onClick={open}
        aria-haspopup="menu" aria-expanded={!!menu} style={{ justifyContent: left ? 'flex-start' : 'flex-end' }}>
        <span>{label}</span>
        {filtered && (
          <svg className="sort-funnel" viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4-2v-4L3 5z" fill="currentColor" /></svg>
        )}
        <span className="sort-ar" aria-hidden="true">{active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>

      {menu && createPortal(
        <div className="sort-scrim" onMouseDown={() => setMenu(null)}>
          <div className="sort-menu wide" role="menu" onMouseDown={(e) => e.stopPropagation()}
            style={{ position: 'fixed', top: menu.y, ...(menu.right ? { right: window.innerWidth - menu.x } : { left: menu.x }) }}>
            {SORT_OPTS[type].map((o) => {
              const on = active && sort.dir === o.dir;
              return (
                <button key={o.dir} role="menuitemradio" aria-checked={on} className={'sort-opt' + (on ? ' on' : '')}
                  onClick={() => { sort.set(k, o.dir); setMenu(null); }}>
                  <span>{o.label}</span>{on && <span className="ck" aria-hidden="true">✓</span>}
                </button>
              );
            })}

            <div className="sort-sep" />
            <div className="filt-label">Filter</div>
            <div className="filt-row">
              <select className="filt-sel" value={f.op} onChange={(e) => setF((s) => ({ ...s, op: e.target.value }))}>
                {FILTER_OPS[type].map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
              </select>
            </div>
            <div className="filt-row">
              <input className="filt-in" type={inputType} value={f.a} placeholder={type === 'text' ? 'value…' : ''}
                onChange={(e) => setF((s) => ({ ...s, a: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') apply(); }} autoFocus />
              {f.op === 'between' && (
                <input className="filt-in" type={inputType} value={f.b} placeholder="and…"
                  onChange={(e) => setF((s) => ({ ...s, b: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') apply(); }} />
              )}
            </div>
            <div className="filt-actions">
              <button className="btn primary" onClick={apply}>Apply</button>
              {filtered && <button className="btn" onClick={() => { sort.setFilter(k, null); setMenu(null); }}>Clear filter</button>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </th>
  );
}
