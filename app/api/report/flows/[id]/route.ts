import { type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@/lib/supabase/server';
import { computeCapitalFlows, fyStartOf, todayIST, type FlowTxnRow, type FeeRow } from '@/lib/capital-flows';
import CapitalFlowsPdf from '@/components/CapitalFlowsPdf';
import {
  newWorkbook, addHeader, addTableHead, styleDataRow, styleTotalRow, addNote,
  gainFont, xlsxResponse, fmtIST, latestPriceAt, FMT_MONEY, XLC,
} from '@/lib/excel';

let logoPromise: Promise<string | null> | null = null;
function getLogo() {
  if (!logoPromise) {
    logoPromise = readFile(path.join(process.cwd(), 'public', 'ashesha-pdf.png'))
      .then((b) => `data:image/png;base64,${b.toString('base64')}`).catch(() => null);
  }
  return logoPromise;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rel = (x: any) => (Array.isArray(x) ? x[0] : x);
const dtL = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = req.nextUrl.searchParams;
  const format = (q.get('format') ?? 'pdf').toLowerCase();
  const today = todayIST();
  const from = q.get('from') || fyStartOf(today);
  const to = q.get('to') || today;
  const supabase = await createClient();

  const { data: client } = await supabase.from('clients').select('name, phone, email').eq('id', id).maybeSingle();
  if (!client) return new Response('Client not found', { status: 404 });

  const { data: txns } = await supabase
    .from('transactions')
    .select('side, quantity, price, traded_at, security_id, securities(symbol, last_price, last_price_at)')
    .eq('client_id', id);
  const { data: fees } = await supabase
    .from('fees').select('amount, status, invoice_no, paid_at, due_date').eq('client_id', id);

  const report = computeCapitalFlows((txns ?? []) as FlowTxnRow[], (fees ?? []) as FeeRow[], from, to, today);
  const priceAsOf = report.closingAtCost
    ? null
    : fmtIST(latestPriceAt((txns ?? []).map((t) => rel((t as any).securities)?.last_price_at)));

  const generatedAt = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const safe = client.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'client';
  const fileBase = `capital-flows-${safe}-${from}-to-${to}`;

  if (format === 'xlsx') {
    const wb = newWorkbook();
    const ws = wb.addWorksheet('Capital Flows', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 14 }, { width: 11 }, { width: 44 }, { width: 16 }, { width: 16 }];

    addHeader(ws, 'Client PMS Capital Flow Report', [
      `${client.name}${client.phone ? `  ·  ${client.phone}` : ''}${client.email ? `  ·  ${client.email}` : ''}`,
      `Period ${dtL(from)} – ${dtL(to)}  ·  Generated ${generatedAt}`,
      ...(priceAsOf ? [`Market prices as of ${priceAsOf} (last available close)`] : []),
    ]);

    const rec = [
      [`Opening AUM · ${dtL(report.from)}${report.openingAtCost ? ' (at cost)' : ''}`, report.openingAum],
      ['Capital inflows (purchases + deposits)', report.inflows],
      ['Capital outflows (sale proceeds + withdrawals)', -report.outflows],
      ['Net flows', report.netFlows],
      ['Mark-to-market gains / (losses)', report.mtm],
      ['Fees & charges collected', -report.fees],
      [`Closing AUM · ${dtL(report.to)}${report.closingAtCost ? ' (at cost)' : ' (at market)'}`, report.closingAum],
    ] as const;
    rec.forEach(([label, val], i) => {
      const r = ws.addRow([label, '', '', '', val]);
      r.getCell(1).font = { size: 10, bold: i === 0 || i === 3 || i === rec.length - 1, color: { argb: XLC.ink } };
      r.getCell(5).numFmt = FMT_MONEY;
      r.getCell(5).alignment = { horizontal: 'right' };
      r.getCell(5).font = i === 0 || i === rec.length - 1 ? { bold: true, size: 10 } : gainFont(val, i === 3);
      if (i === rec.length - 1) styleTotalRow(r);
    });
    ws.addRow([]);

    const sect = ws.addRow(['Capital movements in the period']);
    sect.getCell(1).font = { bold: true, size: 11 };
    addTableHead(ws, ['Date', 'Type', 'Particulars', 'Inflow (Rs)', 'Outflow (Rs)'], 4);
    if (report.events.length === 0) {
      const r = ws.addRow(['No capital movements in this period.']);
      r.getCell(1).font = { size: 9.5, italic: true, color: { argb: XLC.mute } };
    }
    report.events.forEach((e, i) => {
      const row = ws.addRow([dtL(e.date), e.kind, e.label, e.inAmt ?? '-', e.outAmt ?? '-']);
      styleDataRow(row, i);
      row.getCell(2).font = { size: 10, color: { argb: e.kind === 'Inflow' ? XLC.gain : e.kind === 'Fee' ? XLC.gold : XLC.loss } };
      for (const c of [4, 5]) { row.getCell(c).numFmt = FMT_MONEY; row.getCell(c).alignment = { horizontal: 'right' }; }
    });
    if (report.events.length > 0) {
      const tr = ws.addRow(['Total', '', '', report.inflows, report.outflows + report.fees]);
      styleTotalRow(tr);
      for (const c of [4, 5]) { tr.getCell(c).numFmt = FMT_MONEY; tr.getCell(c).alignment = { horizontal: 'right' }; }
    }

    ws.addRow([]);
    addNote(ws, 'Closing AUM = Opening AUM + Net Flows + MTM Gains/(Losses) − Fees. MTM is derived as the balancing figure of this identity.');
    addNote(ws, 'Historical market prices are not stored, so past-dated AUM is stated at cost. Dividends, bonuses and splits are portfolio income / corporate actions, not client capital flows.');
    addNote(ws, 'Figures are indicative and do not constitute investment advice. Ashesha Capital Advisory LLP.');

    return xlsxResponse(wb, `${fileBase}.xlsx`);
  }

  const logo = await getLogo();
  const buffer = await renderToBuffer(
    createElement(CapitalFlowsPdf, { client, report, generatedAt, priceAsOf, logo }) as any,
  );
  return new Response(new Uint8Array(buffer), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fileBase}.pdf"` },
  });
}
