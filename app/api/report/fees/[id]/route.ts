import { type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@/lib/supabase/server';
import { computeFee, deriveState, BAND_RATES, BAND_STEP } from '@/lib/fee-schedule';
import FeeStatementPdf, { type FeeLadderRow } from '@/components/FeeStatementPdf';
import { REPORT_COLUMNS, parseCols } from '@/lib/report-columns';
import {
  newWorkbook, addHeader, addTableHead, styleDataRow, styleTotalRow, addNote,
  xlsxResponse, fmtIST, latestPriceAt, FMT_MONEY, XLC,
} from '@/lib/excel';

let logoPromise: Promise<string | null> | null = null;
function getLogo() {
  if (!logoPromise) {
    logoPromise = readFile(path.join(process.cwd(), 'public', 'ashesha-pdf.png'))
      .then((b) => `data:image/png;base64,${b.toString('base64')}`)
      .catch(() => null);
  }
  return logoPromise;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rel = (x: any) => (Array.isArray(x) ? x[0] : x);
const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : null;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = (req.nextUrl.searchParams.get('format') ?? 'pdf').toLowerCase();
  const on = parseCols('fees', req.nextUrl.searchParams.get('cols'));
  const rowMode = req.nextUrl.searchParams.get('rows') ?? 'all';
  const keepRow = (status: string) =>
    rowMode === 'billed' ? status === 'Billed' : rowMode === 'due' ? status !== 'Billed' : true;
  const supabase = await createClient();

  const { data: client } = await supabase.from('clients').select('name, phone, email').eq('id', id).maybeSingle();
  if (!client) return new Response('Client not found', { status: 404 });

  const { data: holdings } = await supabase
    .from('holdings').select('quantity, avg_price, securities(last_price, last_price_at)').eq('client_id', id);
  const { data: fees } = await supabase.from('fees').select('amount, status, invoice_no, paid_at, due_date').eq('client_id', id);

  let invested = 0, current = 0;
  for (const h of holdings ?? []) {
    const sec = rel((h as any).securities);
    invested += Number(h.quantity) * Number(h.avg_price);
    if (sec?.last_price != null) current += Number(h.quantity) * Number(sec.last_price);
  }
  const capital = invested; // net invested (tracks deposits) — not a frozen snapshot
  const { chargedBands, aboveSettled } = deriveState(fees ?? [], capital);
  const calc = computeFee({ capital, current, chargedBands, aboveSettled });

  // date each band was billed (paid_at of its PF-L{level} ledger row)
  const dateByLevel = new Map<number, string | null>();
  for (const f of fees ?? []) {
    const m = /^PF-L(\d)/.exec(f.invoice_no ?? '');
    if (m && f.status === 'Collected') dateByLevel.set(Number(m[1]), fmt(f.paid_at ?? f.due_date));
  }

  const bandValue = 0.2 * capital;
  const ladder: FeeLadderRow[] = BAND_RATES.map((rate, i) => {
    const level = i + 1;
    const status: FeeLadderRow['status'] = level <= chargedBands ? 'Billed' : level <= calc.reachedBands ? 'Due' : 'Upcoming';
    return {
      milestonePct: level * BAND_STEP, rate, targetValue: capital * (1 + 0.2 * level),
      fee: Math.round((rate / 100) * bandValue * 100) / 100, status, date: dateByLevel.get(level) ?? null,
    };
  });

  const collected = (fees ?? []).filter((f) => f.status === 'Collected' && /^PF-(L\d|ABOVE)/.test(f.invoice_no ?? ''))
    .reduce((a, f) => a + Number(f.amount), 0);

  const generatedAt = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const priceAsOf = fmtIST(latestPriceAt((holdings ?? []).map((h) => rel((h as any).securities)?.last_price_at)));
  const safe = client.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'client';

  if (format === 'xlsx') {
    const wb = newWorkbook();
    const ws = wb.addWorksheet('Fee Statement', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 28 }, { width: 12 }, { width: 18 }, { width: 16 }, { width: 20 }];

    addHeader(ws, 'Performance Fee Statement', [
      `${client.name}${client.phone ? `  ·  ${client.phone}` : ''}${client.email ? `  ·  ${client.email}` : ''}`,
      `As of ${generatedAt}`,
      ...(priceAsOf ? [`Market prices as of ${priceAsOf} (last available close)`] : []),
    ]);

    const sum = [
      ['Capital (Rs)', capital], ['Current value (Rs)', current],
      ['Appreciation %', calc.gainPct], ['Fees collected (Rs)', collected], ['Fee due now (Rs)', calc.feeDue],
    ] as const;
    for (const [label, val] of sum) {
      const r = ws.addRow([label, val]);
      r.getCell(1).font = { size: 10, color: { argb: XLC.mute } };
      r.getCell(2).numFmt = label.includes('%') ? '+0.00"%";-0.00"%"' : FMT_MONEY;
      r.getCell(2).font = { bold: true, size: 10 };
      r.getCell(2).alignment = { horizontal: 'right' };
    }
    ws.addRow([]);

    const cols = REPORT_COLUMNS.fees.filter((c) => on.has(c.key));
    addTableHead(ws, cols.map((c) => c.label), 2);
    const shown = ladder.filter((r) => keepRow(r.status));
    if (shown.length === 0) {
      const r = ws.addRow(['No milestones match the selected filter.']);
      r.getCell(1).font = { size: 9.5, italic: true, color: { argb: XLC.mute } };
    }
    const valueOf = (key: string, r: (typeof shown)[number]) =>
      key === 'milestone' ? `+${r.milestonePct}% appreciation`
        : key === 'rate' ? r.rate / 100
        : key === 'target' ? r.targetValue
        : key === 'fee' ? r.fee
        : key === 'status' ? (r.status === 'Billed' && r.date ? `Billed ${r.date}` : r.status)
        : '';
    shown.forEach((r, i) => {
      const row = ws.addRow(cols.map((c) => valueOf(c.key, r)));
      styleDataRow(row, i);
      cols.forEach((c, ci) => {
        const cell = row.getCell(ci + 1);
        if (c.key === 'rate') cell.numFmt = '0.0%';
        else if (c.key === 'target' || c.key === 'fee') cell.numFmt = FMT_MONEY;
        if (c.num || c.key === 'status') cell.alignment = { horizontal: 'right' };
        if (c.key === 'status') cell.font = { size: 10, color: { argb: r.status === 'Billed' ? XLC.gain : r.status === 'Due' ? XLC.gold : XLC.mute } };
      });
    });
    const tot = ws.addRow(cols.map((c) => (c.key === 'milestone' ? 'Total collected to date' : c.key === 'fee' ? collected : '')));
    styleTotalRow(tot);
    cols.forEach((c, ci) => {
      if (c.key === 'fee') { tot.getCell(ci + 1).numFmt = FMT_MONEY; tot.getCell(ci + 1).alignment = { horizontal: 'right' }; }
    });

    ws.addRow([]);
    addNote(ws, 'Performance fee is charged once on each 20% band of appreciation over invested capital, at rising slab rates (5% / 10% / 12.5% / 15% / 25%), then 25% flat above +100%.');
    addNote(ws, 'Current value is basis the last available market prices (see the prices-as-of stamp above). Generated from recorded transactions and collected fees; please verify against your records.');

    return xlsxResponse(wb, `fee-statement-${safe}.xlsx`);
  }

  const logo = await getLogo();
  const buffer = await renderToBuffer(
    createElement(FeeStatementPdf, {
      client, capital, current, gainPct: calc.gainPct, ladder: ladder.filter((r) => keepRow(r.status)),
      totals: { collected, dueNow: calc.feeDue }, generatedAt, priceAsOf, logo, cols: [...on],
    }) as any,
  );

  return new Response(new Uint8Array(buffer), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="fee-statement-${safe}.pdf"` },
  });
}
