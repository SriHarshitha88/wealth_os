'use client';

import { useMemo, useState } from 'react';
import { REPORT_COLUMNS, ROW_FILTERS, defaultCols, type ReportKind } from '@/lib/report-columns';

type Client = { id: string; name: string };

// Each tab maps to a report route that already exists; `period` says which
// controls that route actually honours, so nothing on screen is decorative.
const TYPES: { key: ReportKind; tab: string; title: string; blurb: string; period: 'none' | 'range' | 'fy' }[] = [
  {
    key: 'client', tab: 'Portfolio', title: 'Portfolio Statement', period: 'none',
    blurb: 'Holdings with market price, value at cost, unrealised and realised gain, and XIRR.',
  },
  {
    key: 'flows', tab: 'Capital Flows', title: 'Capital Flow Report', period: 'range',
    blurb: 'Opening AUM to closing AUM: inflows, outflows, net flows and derived MTM.',
  },
  {
    key: 'fees', tab: 'Fee Engine', title: 'Fee Statement', period: 'none',
    blurb: 'Appreciation-slab milestones, what has been billed, and what is due.',
  },
  {
    key: 'gains', tab: 'Tax / P&L', title: 'Capital Gains Statement', period: 'fy',
    blurb: 'FIFO sell-slices split into short-term and long-term for the financial year.',
  },
];

function fyList(count = 5) {
  const part = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', ...o }).format(new Date());
  const month = Number(part({ month: '2-digit' }));
  const year = Number(part({ year: 'numeric' }));
  const start = month >= 4 ? year : year - 1;
  return Array.from({ length: count }, (_, i) => {
    const s = start - i;
    return `${s}-${String((s + 1) % 100).padStart(2, '0')}`;
  });
}

function fyStart(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return `${m >= 4 ? y : y - 1}-04-01`;
}

const initialCols = () =>
  Object.fromEntries(TYPES.map((t) => [t.key, new Set(defaultCols(t.key))])) as Record<ReportKind, Set<string>>;
const initialRows = () =>
  Object.fromEntries(TYPES.map((t) => [t.key, 'all'])) as Record<ReportKind, string>;

export default function ReportsConsole({ clients, today }: { clients: Client[]; today: string }) {
  const [typeKey, setTypeKey] = useState<ReportKind>('client');
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [from, setFrom] = useState(fyStart(today));
  const [to, setTo] = useState(today);
  const years = useMemo(() => fyList(), []);
  const [fy, setFy] = useState(years[0]);
  const [cols, setCols] = useState(initialCols);
  const [rows, setRows] = useState(initialRows);

  const type = TYPES.find((t) => t.key === typeKey)!;
  const client = clients.find((c) => c.id === clientId);
  const spec = REPORT_COLUMNS[typeKey];
  const picked = cols[typeKey];
  const rowFilter = ROW_FILTERS[typeKey][0];

  function toggle(key: string) {
    setCols((prev) => {
      const next = new Set(prev[typeKey]);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...prev, [typeKey]: next };
    });
  }

  function setAll(all: boolean) {
    const keys = all ? spec.map((c) => c.key) : spec.filter((c) => c.locked).map((c) => c.key);
    setCols((prev) => ({ ...prev, [typeKey]: new Set(keys) }));
  }

  function reset() {
    setCols((prev) => ({ ...prev, [typeKey]: new Set(defaultCols(typeKey)) }));
  }

  function href(format: 'pdf' | 'xlsx') {
    const q = new URLSearchParams({ format });
    if (type.period === 'range') {
      q.set('from', from);
      q.set('to', to);
    }
    if (type.period === 'fy') q.set('fy', fy);
    q.set('cols', spec.filter((c) => picked.has(c.key)).map((c) => c.key).join(','));
    if (rows[typeKey] !== 'all') q.set('rows', rows[typeKey]);
    return `/api/report/${typeKey}/${clientId}?${q}`;
  }

  const periodLabel =
    type.period === 'range' ? `${from} to ${to}` : type.period === 'fy' ? `FY ${fy}` : 'As of today';
  const rowLabel = rowFilter.options.find((o) => o.value === rows[typeKey])?.label ?? 'All';
  const ready = Boolean(clientId);

  return (
    <div className="rep-grid">
      <div className="card">
        <div className="tabs" style={{ margin: 0, padding: '0 20px' }}>
          {TYPES.map((t) => (
            <button key={t.key} className={t.key === typeKey ? 'on' : ''} onClick={() => setTypeKey(t.key)}>
              {t.tab}
            </button>
          ))}
        </div>

        <div style={{ padding: 20 }}>
          <h3 style={{ fontSize: 19, marginBottom: 6 }}>{type.title}</h3>
          <p style={{ margin: '0 0 20px', color: 'var(--ink-3)', fontSize: 14 }}>{type.blurb}</p>

          <div className="rep-fields">
            <div className="field">
              <label htmlFor="rep-client">Client</label>
              <select id="rep-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                {clients.length === 0 && <option value="">No clients yet</option>}
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {type.period === 'range' && (
              <>
                <div className="field">
                  <label htmlFor="rep-from">From</label>
                  <input id="rep-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="rep-to">To</label>
                  <input id="rep-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
                </div>
              </>
            )}

            {type.period === 'fy' && (
              <div className="field">
                <label htmlFor="rep-fy">Financial year</label>
                <select id="rep-fy" value={fy} onChange={(e) => setFy(e.target.value)}>
                  {years.map((y) => (
                    <option key={y} value={y}>FY {y}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="field">
              <label htmlFor="rep-rows">{rowFilter.label}</label>
              <select
                id="rep-rows"
                value={rows[typeKey]}
                onChange={(e) => setRows((p) => ({ ...p, [typeKey]: e.target.value }))}
              >
                {rowFilter.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="rep-cols">
            <div className="rep-cols-head">
              <span className="eyebrow">
                Columns included &middot; {picked.size} of {spec.length}
              </span>
              <div className="rep-cols-tools">
                <button type="button" onClick={() => setAll(true)}>Select all</button>
                <button type="button" onClick={() => setAll(false)}>Clear</button>
                <button type="button" onClick={reset}>Reset</button>
              </div>
            </div>
            <div className="rep-cols-grid">
              {spec.map((c) => (
                <label key={c.key} className={'rep-col' + (c.locked ? ' is-locked' : '')}>
                  <input
                    type="checkbox"
                    checked={picked.has(c.key)}
                    disabled={c.locked}
                    onChange={() => toggle(c.key)}
                  />
                  <span>{c.label}</span>
                  {c.locked && <em>always</em>}
                </label>
              ))}
            </div>
          </div>

          {type.period === 'none' && (
            <p className="rep-note">
              This statement is always produced as of today, at the last available market prices.
            </p>
          )}

          <div className="rep-actions">
            <a
              className={'btn primary' + (ready ? '' : ' is-off')}
              href={ready ? href('pdf') : undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!ready}
            >
              <span className="dl-ext pdf">PDF</span> Download PDF
            </a>
            <a
              className={'btn' + (ready ? '' : ' is-off')}
              href={ready ? href('xlsx') : undefined}
              aria-disabled={!ready}
            >
              <span className="dl-ext xls">XLS</span> Download Excel
            </a>
          </div>
        </div>
      </div>

      <aside className="card rep-side">
        <div className="card-head"><h3>Selected settings</h3></div>
        <div style={{ padding: '4px 20px 18px' }}>
          <dl className="rep-dl">
            <dt>Report</dt><dd>{type.title}</dd>
            <dt>Client</dt><dd>{client?.name ?? '—'}</dd>
            <dt>Period</dt><dd>{periodLabel}</dd>
            <dt>Rows</dt><dd>{rowLabel}</dd>
            <dt>Columns</dt><dd>{picked.size} of {spec.length} selected</dd>
            <dt>Formats</dt><dd>PDF and Excel (.xlsx)</dd>
          </dl>
          <p className="rep-note" style={{ marginTop: 16 }}>
            Your column and row choices apply to both the PDF and the Excel download. Reports are generated on
            demand from live data — nothing is cached, so each download reflects the book right now.
          </p>
        </div>
      </aside>
    </div>
  );
}
