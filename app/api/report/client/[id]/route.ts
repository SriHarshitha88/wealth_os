import { type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@/lib/supabase/server';
import { computeLots } from '@/lib/portfolio-calc';
import { xirr, positionCashflows } from '@/lib/xirr';
import ClientReportPdf, { type ReportRow } from '@/components/ClientReportPdf';
import { REPORT_COLUMNS, parseCols } from '@/lib/report-columns';
import {
  newWorkbook, addHeader, addTableHead, styleDataRow, styleTotalRow, addNote,
  gainFont, xlsxResponse, fmtIST, latestPriceAt, FMT_MONEY, FMT_QTY, FMT_PCT, XLC,
} from '@/lib/excel';

// Load the Ashesha lockup once and cache it as a data URI for the PDF header.
let logoPromise: Promise<string | null> | null = null;
function getLogo(): Promise<string | null> {
  if (!logoPromise) {
    logoPromise = readFile(path.join(process.cwd(), 'public', 'ashesha-pdf.png'))
      .then((b) => `data:image/png;base64,${b.toString('base64')}`)
      .catch(() => null);
  }
  return logoPromise;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function rel(x: any) {
  return Array.isArray(x) ? x[0] : x;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = req.nextUrl.searchParams;
  const format = (q.get('format') ?? 'pdf').toLowerCase();
  const on = parseCols('client', q.get('cols'));
  const rowMode = q.get('rows') ?? 'all';
  const supabase = await createClient();

  // RLS ensures the signed-in advisor can only fetch their own client.
  const { data: client } = await supabase.from('clients').select('name, phone, email, tier').eq('id', id).maybeSingle();
  if (!client) return new Response('Client not found', { status: 404 });

  // Build positions from the transaction ledger (FIFO) so realised P/L is included.
  const { data: txns } = await supabase
    .from('transactions')
    .select('side, quantity, price, traded_at, security_id, securities(symbol, name, sector, last_price, last_price_at)')
    .eq('client_id', id);

  const bySec = new Map<number, { sec: any; txns: any[] }>();
  for (const t of txns ?? []) {
    const sec = rel((t as any).securities);
    const e = bySec.get(t.security_id) ?? { sec, txns: [] };
    e.txns.push(t);
    bySec.set(t.security_id, e);
  }

  const nowIso = new Date().toISOString();
  const positions: ReportRow[] = [...bySec.values()].map(({ sec, txns }) => {
    const pos = computeLots(txns);
    const cur = sec?.last_price != null ? Number(sec.last_price) : null;
    const currentValue = cur != null && pos.qty > 1e-9 ? pos.qty * cur : null;
    const pl = currentValue != null ? currentValue - pos.invested : null;
    const ret = pl != null && pos.invested ? (pl / pos.invested) * 100 : null;
    return {
      symbol: sec?.symbol ?? '-', name: sec?.name ?? '', sector: sec?.sector ?? null,
      qty: pos.qty, avg: pos.avgCost, cur, curAt: sec?.last_price_at ?? null,
      investedValue: pos.invested, currentValue, pl, ret, realised: pos.realised,
      firstBuyDate: pos.firstBuyDate, xirr: xirr(positionCashflows(txns, pos.qty, cur, nowIso)),
    };
  });

  let open = positions.filter((r) => r.qty > 1e-9).sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0));
  let closed = positions.filter((r) => r.qty <= 1e-9 && Math.abs(r.realised) > 0.005);

  // Row selection from the Reports console.
  if (rowMode === 'open') closed = [];
  else if (rowMode === 'sold') open = [];
  else if (rowMode === 'gainers') { open = open.filter((r) => (r.pl ?? 0) > 0); closed = []; }
  else if (rowMode === 'losers') { open = open.filter((r) => (r.pl ?? 0) < 0); closed = []; }

  const rows: ReportRow[] = [...open, ...closed];

  // Totals follow the row selection, so the total line always matches what is printed.
  const invested = open.reduce((a, r) => a + r.investedValue, 0);
  const current = open.reduce((a, r) => a + (r.currentValue ?? r.investedValue), 0);
  const pl = current - invested;
  const realised = rows.reduce((a, r) => a + r.realised, 0);
  const totals = { invested, current, pl, plPct: invested ? (pl / invested) * 100 : 0, realised };

  // Prices are the last fetched close — on a weekend that is Friday's price;
  // stamp the report with when they are actually from.
  const priceAsOf = fmtIST(latestPriceAt(open.map((r) => r.curAt)));

  const generatedAt = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const safe = client.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'client';

  if (format === 'xlsx') {
    return buildXlsx({ client, rows: { open, closed }, totals, generatedAt, priceAsOf, safe, on });
  }

  const logo = await getLogo();
  const buffer = await renderToBuffer(
    createElement(ClientReportPdf, { client, rows, totals, generatedAt, priceAsOf, logo, cols: [...on] }) as any,
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="portfolio-${safe}.pdf"`,
    },
  });
}

const dt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata' }) : '-');
const DASH = '-';

async function buildXlsx({ client, rows, totals, generatedAt, priceAsOf, safe, on }: {
  client: { name: string; phone: string; email: string | null; tier: string };
  rows: { open: ReportRow[]; closed: ReportRow[] };
  totals: { invested: number; current: number; pl: number; plPct: number; realised: number };
  generatedAt: string; priceAsOf: string | null; safe: string; on: Set<string>;
}) {
  // Excel shows every selected column, including the ones the PDF folds into
  // another cell (symbol, price date, purchase price).
  const cols = REPORT_COLUMNS.client.filter((c) => on.has(c.key));

  const wb = newWorkbook();
  const ws = wb.addWorksheet('Portfolio', { views: [{ showGridLines: false }] });
  ws.columns = cols.map((c) => ({ width: c.key === 'security' ? 32 : Math.max(11, c.label.length + 4) }));

  addHeader(ws, 'Portfolio Statement', [
    `${client.name}  ·  ${client.tier} client${client.phone ? `  ·  ${client.phone}` : ''}${client.email ? `  ·  ${client.email}` : ''}`,
    `As of ${generatedAt}`,
    ...(priceAsOf ? [`Market prices as of ${priceAsOf} (last available close)`] : []),
  ]);

  // summary block
  const sum = [
    ['Value at Cost (Rs)', totals.invested], ['Current Value (Rs)', totals.current],
    ['Unrealised Gain / (Loss)', totals.pl], ['Realised Gain / (Loss)', totals.realised],
  ] as const;
  for (const [label, val] of sum) {
    const r = ws.addRow([label, val]);
    r.getCell(1).font = { size: 10, color: { argb: XLC.mute } };
    r.getCell(2).numFmt = FMT_MONEY;
    r.getCell(2).font = label.includes('Gain') ? gainFont(val, true) : { bold: true, size: 10 };
    r.getCell(2).alignment = { horizontal: 'right' };
  }
  ws.addRow([]);

  // One cell value per selected column. `null` means the column has nothing for
  // this row (a sold position has no live price), and prints as a dash.
  const valueOf = (key: string, r: ReportRow, isSold: boolean): string | number | null => {
    switch (key) {
      case 'security': return r.name || r.symbol;
      case 'symbol': return r.symbol;
      case 'qty': return isSold ? null : r.qty;
      case 'since': return dt(r.firstBuyDate);
      case 'avg': return isSold ? null : r.avg;
      case 'mkt': return isSold ? null : r.cur;
      case 'mktdate': return isSold ? null : fmtIST(r.curAt);
      case 'cur': return isSold ? null : r.currentValue;
      case 'cost': return isSold ? null : r.investedValue;
      case 'unrl': return isSold ? null : r.pl;
      case 'real': return Math.abs(r.realised) < 0.005 ? null : r.realised;
      case 'pct': return isSold ? null : r.ret;
      case 'xirr': return r.xirr;
      default: return null;
    }
  };

  const MONEY = new Set(['avg', 'mkt', 'cur', 'cost', 'unrl', 'real']);
  const PCT = new Set(['pct', 'xirr']);

  function writeSection(title: string, list: ReportRow[], isSold: boolean) {
    const sect = ws.addRow([title]);
    sect.getCell(1).font = { bold: true, size: 11 };
    addTableHead(ws, cols.map((c) => c.label), 2);

    list.forEach((r, i) => {
      const row = ws.addRow(cols.map((c) => valueOf(c.key, r, isSold) ?? DASH));
      styleDataRow(row, i);
      cols.forEach((c, ci) => {
        const cell = row.getCell(ci + 1);
        if (c.key === 'qty') cell.numFmt = FMT_QTY;
        else if (MONEY.has(c.key)) cell.numFmt = FMT_MONEY;
        else if (PCT.has(c.key)) cell.numFmt = FMT_PCT;
        if (c.num) cell.alignment = { horizontal: 'right' };
        if (c.key === 'unrl' || c.key === 'pct') cell.font = gainFont(r.pl);
        if (c.key === 'real') cell.font = gainFont(Math.abs(r.realised) < 0.005 ? null : r.realised);
        if (c.key === 'xirr') cell.font = gainFont(r.xirr);
      });
    });
  }

  if (rows.open.length) {
    writeSection('Holdings', rows.open, false);
    const totalOf = (key: string): string | number =>
      key === 'security' ? 'Total Holdings'
        : key === 'cur' ? totals.current
        : key === 'cost' ? totals.invested
        : key === 'unrl' ? totals.pl
        : key === 'pct' ? totals.plPct
        : '';
    const tot = ws.addRow(cols.map((c) => totalOf(c.key)));
    styleTotalRow(tot);
    cols.forEach((c, ci) => {
      const cell = tot.getCell(ci + 1);
      if (MONEY.has(c.key)) cell.numFmt = FMT_MONEY;
      if (PCT.has(c.key)) cell.numFmt = FMT_PCT;
      if (c.num) cell.alignment = { horizontal: 'right' };
      if (c.key === 'unrl' || c.key === 'pct') cell.font = gainFont(totals.pl, true);
    });
    ws.addRow([]);
  }

  if (rows.closed.length) {
    writeSection('Sold / Realised', rows.closed, true);
    const soldTot = rows.closed.reduce((a, r) => a + r.realised, 0);
    const tr = ws.addRow(cols.map((c) => (c.key === 'security' ? 'Total Realised' : c.key === 'real' ? soldTot : '')));
    styleTotalRow(tr);
    cols.forEach((c, ci) => {
      const cell = tr.getCell(ci + 1);
      if (c.key === 'real') { cell.numFmt = FMT_MONEY; cell.font = gainFont(soldTot, true); }
      if (c.num) cell.alignment = { horizontal: 'right' };
    });
    ws.addRow([]);
  }

  if (!rows.open.length && !rows.closed.length) {
    const r = ws.addRow(['No positions match the selected filter.']);
    r.getCell(1).font = { size: 9.5, italic: true, color: { argb: XLC.mute } };
    ws.addRow([]);
  }

  if (on.has('mkt')) {
    addNote(ws, 'Market Price is the last available stock price (previous trading day\'s close on weekends/holidays); the "Price as of" column shows exactly when each price is from.');
  }
  addNote(ws, 'Current value is basis the last available price and may differ from realisable value. XIRR is the annualised money-weighted return.');
  addNote(ws, 'Value at Cost is the purchase cost of the holding. Figures are indicative and do not constitute investment advice.');

  return xlsxResponse(wb, `portfolio-${safe}.xlsx`);
}
