import { type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@/lib/supabase/server';
import { computeLots } from '@/lib/portfolio-calc';
import { xirr, positionCashflows } from '@/lib/xirr';
import ClientReportPdf, { type ReportRow } from '@/components/ClientReportPdf';
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
  const format = (req.nextUrl.searchParams.get('format') ?? 'pdf').toLowerCase();
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

  const open = positions.filter((r) => r.qty > 1e-9).sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0));
  const closed = positions.filter((r) => r.qty <= 1e-9 && Math.abs(r.realised) > 0.005);
  const rows: ReportRow[] = [...open, ...closed];

  const invested = open.reduce((a, r) => a + r.investedValue, 0);
  const current = open.reduce((a, r) => a + (r.currentValue ?? r.investedValue), 0);
  const pl = current - invested;
  const realised = positions.reduce((a, r) => a + r.realised, 0);
  const totals = { invested, current, pl, plPct: invested ? (pl / invested) * 100 : 0, realised };

  // Prices are the last fetched close — on a weekend that is Friday's price;
  // stamp the report with when they are actually from.
  const priceAsOf = fmtIST(latestPriceAt(open.map((r) => r.curAt)));

  const generatedAt = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const safe = client.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'client';

  if (format === 'xlsx') {
    return buildXlsx({ client, rows: { open, closed }, totals, generatedAt, priceAsOf, safe });
  }

  const logo = await getLogo();
  const buffer = await renderToBuffer(
    createElement(ClientReportPdf, { client, rows, totals, generatedAt, priceAsOf, logo }) as any,
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="portfolio-${safe}.pdf"`,
    },
  });
}

const dt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata' }) : '-');

async function buildXlsx({ client, rows, totals, generatedAt, priceAsOf, safe }: {
  client: { name: string; phone: string; email: string | null; tier: string };
  rows: { open: ReportRow[]; closed: ReportRow[] };
  totals: { invested: number; current: number; pl: number; plPct: number; realised: number };
  generatedAt: string; priceAsOf: string | null; safe: string;
}) {
  const wb = newWorkbook();
  const ws = wb.addWorksheet('Portfolio', { views: [{ showGridLines: false }] });
  ws.columns = [
    { width: 32 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 12 },
    { width: 13 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 15 }, { width: 10 }, { width: 10 },
  ];

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

  const HEADERS = ['Security', 'Symbol', 'Qty', 'Since', 'Avg Cost', 'Market Price', 'Price as of', 'Current Value', 'Value at Cost', 'Unrealised G/(L)', 'Realised G/(L)', 'Gain %', 'XIRR %'];
  const sect = ws.addRow(['Holdings']);
  sect.getCell(1).font = { bold: true, size: 11 };
  addTableHead(ws, HEADERS, 3);

  rows.open.forEach((r, i) => {
    const row = ws.addRow([
      r.name || r.symbol, r.symbol, r.qty, dt(r.firstBuyDate), r.avg,
      r.cur ?? '-', fmtIST(r.curAt) ?? '-', r.currentValue ?? '-', r.investedValue,
      r.pl ?? '-', Math.abs(r.realised) < 0.005 ? '-' : r.realised, r.ret == null ? '-' : r.ret, r.xirr == null ? '-' : r.xirr,
    ]);
    styleDataRow(row, i);
    row.getCell(3).numFmt = FMT_QTY;
    for (const c of [5, 6, 8, 9, 10, 11]) row.getCell(c).numFmt = FMT_MONEY;
    for (const c of [12, 13]) row.getCell(c).numFmt = FMT_PCT;
    for (const c of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) row.getCell(c).alignment = { horizontal: 'right' };
    row.getCell(10).font = gainFont(r.pl);
    row.getCell(11).font = gainFont(Math.abs(r.realised) < 0.005 ? null : r.realised);
    row.getCell(12).font = gainFont(r.pl);
    row.getCell(13).font = gainFont(r.xirr);
  });

  const tot = ws.addRow(['Total Holdings', '', '', '', '', '', '', totals.current, totals.invested, totals.pl, '', totals.plPct, '']);
  styleTotalRow(tot);
  for (const c of [8, 9, 10]) { tot.getCell(c).numFmt = FMT_MONEY; tot.getCell(c).alignment = { horizontal: 'right' }; }
  tot.getCell(10).font = gainFont(totals.pl, true);
  tot.getCell(12).numFmt = FMT_PCT;
  tot.getCell(12).alignment = { horizontal: 'right' };
  tot.getCell(12).font = gainFont(totals.pl, true);

  if (rows.closed.length) {
    ws.addRow([]);
    const s2 = ws.addRow(['Sold / Realised']);
    s2.getCell(1).font = { bold: true, size: 11 };
    addTableHead(ws, ['Security', 'Symbol', 'First bought', 'Realised G/(L)', 'XIRR %'], 3);
    rows.closed.forEach((r, i) => {
      const row = ws.addRow([r.name || r.symbol, r.symbol, dt(r.firstBuyDate), r.realised, r.xirr == null ? '-' : r.xirr]);
      styleDataRow(row, i);
      row.getCell(4).numFmt = FMT_MONEY; row.getCell(5).numFmt = FMT_PCT;
      for (const c of [3, 4, 5]) row.getCell(c).alignment = { horizontal: 'right' };
      row.getCell(4).font = gainFont(r.realised);
      row.getCell(5).font = gainFont(r.xirr);
    });
    const soldTot = rows.closed.reduce((a, r) => a + r.realised, 0);
    const tr = ws.addRow(['Total Realised', '', '', soldTot, '']);
    styleTotalRow(tr);
    tr.getCell(4).numFmt = FMT_MONEY;
    tr.getCell(4).alignment = { horizontal: 'right' };
    tr.getCell(4).font = gainFont(soldTot, true);
  }

  ws.addRow([]);
  addNote(ws, 'Market Price is the last available stock price (previous trading day\'s close on weekends/holidays); the "Price as of" column shows exactly when each price is from.');
  addNote(ws, 'Current value is basis the last available price and may differ from realisable value. XIRR is the annualised money-weighted return.');
  addNote(ws, 'Value at Cost is the purchase cost of the holding. Figures are indicative and do not constitute investment advice.');

  return xlsxResponse(wb, `portfolio-${safe}.xlsx`);
}
