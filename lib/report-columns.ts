// Column + row selection shared by the Reports console and the report routes.
//
// `w` is a layout weight, not a width: the PDF keeps only the selected columns
// and normalises their weights to 100%, so a narrow selection still fills the
// page. Excel uses `w` as an approximate character width.

export type ColSpec = {
  key: string;
  label: string;
  w: number;            // 0 = no column of its own in the PDF (it rides inside another
                        //     cell there), but a real column in the Excel export
  on: boolean;          // in the default selection
  locked?: boolean;     // identity column — always present, cannot be removed
  num?: boolean;        // right-aligned / numeric
};

export type RowFilter = { key: string; label: string; options: { value: string; label: string }[] };

export type ReportKind = 'client' | 'flows' | 'fees' | 'gains';

export const REPORT_COLUMNS: Record<ReportKind, ColSpec[]> = {
  client: [
    { key: 'security', label: 'Security',         w: 16, on: true, locked: true },
    { key: 'symbol',   label: 'Symbol',           w: 0,  on: true },   // stacked under the name in the PDF
    { key: 'qty',      label: 'Qty',              w: 6,  on: true,  num: true },
    { key: 'since',    label: 'Since',            w: 8,  on: true,  num: true },
    { key: 'mkt',      label: 'Market price',     w: 11, on: true,  num: true },
    { key: 'mktdate',  label: 'Price as of',      w: 0,  on: true,  num: true }, // under the price in the PDF
    { key: 'cur',      label: 'Current value',    w: 12, on: true,  num: true },
    { key: 'cost',     label: 'Value at cost',    w: 12, on: true,  num: true },
    { key: 'avg',      label: 'Purchase price',   w: 0,  on: true,  num: true }, // under Value at cost in the PDF
    { key: 'unrl',     label: 'Unrealised G/(L)', w: 12, on: true,  num: true },
    { key: 'real',     label: 'Realised G/(L)',   w: 10, on: true,  num: true },
    { key: 'pct',      label: 'Gain %',           w: 7,  on: true,  num: true },
    { key: 'xirr',     label: 'XIRR %',           w: 6,  on: true,  num: true },
  ],
  flows: [
    { key: 'date',     label: 'Date',             w: 14, on: true, locked: true },
    { key: 'kind',     label: 'Type',             w: 12, on: true },
    { key: 'label',    label: 'Particulars',      w: 42, on: true },
    { key: 'in',       label: 'Inflow',           w: 16, on: true, num: true },
    { key: 'out',      label: 'Outflow',          w: 16, on: true, num: true },
  ],
  fees: [
    { key: 'milestone', label: 'Milestone',       w: 30, on: true, locked: true },
    { key: 'rate',      label: 'Rate',            w: 14, on: true, num: true },
    { key: 'target',    label: 'Target value',    w: 22, on: true, num: true },
    { key: 'fee',       label: 'Fee',             w: 20, on: true, num: true },
    { key: 'status',    label: 'Status',          w: 14, on: true },
  ],
  gains: [
    { key: 'security', label: 'Security',         w: 20, on: true, locked: true },
    { key: 'bought',   label: 'Bought',           w: 10, on: true, num: true },
    { key: 'sold',     label: 'Sold',             w: 10, on: true, num: true },
    { key: 'days',     label: 'Days held',        w: 8,  on: true, num: true },
    { key: 'qty',      label: 'Qty',              w: 8,  on: true, num: true },
    { key: 'buyval',   label: 'Buy value',        w: 13, on: true, num: true },
    { key: 'sellval',  label: 'Sell value',       w: 13, on: true, num: true },
    { key: 'gain',     label: 'Gain / (Loss)',    w: 13, on: true, num: true },
    { key: 'type',     label: 'Type',             w: 0,  on: true },   // the PDF splits into ST/LT sections
  ],
};

export const ROW_FILTERS: Record<ReportKind, RowFilter[]> = {
  client: [
    { key: 'rows', label: 'Positions', options: [
      { value: 'all',     label: 'All positions' },
      { value: 'open',    label: 'Open holdings only' },
      { value: 'sold',    label: 'Sold / realised only' },
      { value: 'gainers', label: 'Open holdings in profit' },
      { value: 'losers',  label: 'Open holdings at a loss' },
    ] },
  ],
  flows: [
    { key: 'rows', label: 'Movements', options: [
      { value: 'all', label: 'Inflows and outflows' },
      { value: 'in',  label: 'Inflows only' },
      { value: 'out', label: 'Outflows only' },
    ] },
  ],
  fees: [
    { key: 'rows', label: 'Milestones', options: [
      { value: 'all',    label: 'All milestones' },
      { value: 'billed', label: 'Billed only' },
      { value: 'due',    label: 'Unbilled / due only' },
    ] },
  ],
  gains: [
    { key: 'rows', label: 'Gains', options: [
      { value: 'all',   label: 'Short and long term' },
      { value: 'short', label: 'Short term only' },
      { value: 'long',  label: 'Long term only' },
    ] },
  ],
};

export const defaultCols = (kind: ReportKind) =>
  REPORT_COLUMNS[kind].filter((c) => c.on).map((c) => c.key);

// Parse a `cols=a,b,c` query value. Missing/blank falls back to the default set;
// locked columns are always included so a report can never lose its identity column.
export function parseCols(kind: ReportKind, param: string | null): Set<string> {
  const spec = REPORT_COLUMNS[kind];
  const valid = new Set(spec.map((c) => c.key));
  const picked = (param ?? '').split(',').map((s) => s.trim()).filter((s) => valid.has(s));
  const set = new Set(picked.length ? picked : defaultCols(kind));
  for (const c of spec) if (c.locked) set.add(c.key);
  return set;
}

// The selected columns in their canonical order, with widths normalised to 100%.
export function layout(kind: ReportKind, on: Set<string>) {
  const cols = REPORT_COLUMNS[kind].filter((c) => on.has(c.key) && c.w > 0);
  const total = cols.reduce((a, c) => a + c.w, 0) || 1;
  return cols.map((c) => ({ ...c, pct: `${((c.w / total) * 100).toFixed(4)}%` }));
}
