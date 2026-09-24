import { type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@/lib/supabase/server';
import { computeLots } from '@/lib/portfolio-calc';
import { fyLabelOf, currentFY } from '@/lib/capital-gains';
import CapitalGainsPdf, { type CGRow, type CGTotals } from '@/components/CapitalGainsPdf';
import { REPORT_COLUMNS, parseCols } from '@/lib/report-columns';
import {
  newWorkbook, addHeader, addTableHead, styleDataRow, styleTotalRow, addNote,
  gainFont, xlsxResponse, FMT_MONEY, FMT_QTY, XLC,
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
const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata' });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fy = req.nextUrl.searchParams.get('fy') || currentFY();
  const supabase = await createClient();

  const { data: client } = await supabase.from('clients').select('name, phone, email').eq('id', id).maybeSingle();
  if (!client) return new Response('Client not found', { status: 404 });

  const { data: txns } = await supabase
    .from('transactions').select('side, quantity, price, traded_at, security_id, securities(symbol)').eq('client_id', id);

  const bySec = new Map<number, { sym: string; txns: any[] }>();
  for (const t of txns ?? []) {
    const sym = rel((t as any).securities)?.symbol ?? '—';
    const e = bySec.get(t.security_id) ?? { sym, txns: [] as any[] };
    e.txns.push(t); bySec.set(t.security_id, e);
  }

  let rows: CGRow[] = [];   // reassigned below if the console asked for ST-only / LT-only
  for (const { sym, txns: ts } of bySec.values()) {
    for (const s of computeLots(ts).realisedSlices) {
      if (fyLabelOf(s.sellDate) !== fy) continue;
      rows.push({ symbol: sym, buyDate: fmt(s.buyDate), sellDate: fmt(s.sellDate), qty: s.qty, cost: s.cost, proceeds: s.proceeds, gain: s.gain, holdingDays: s.holdingDays, longTerm: s.longTerm });
    }
  }
  rows.sort((a, b) => a.symbol.localeCompare(b.symbol));

  const totals: CGTotals = { stGain: 0, ltGain: 0, stProceeds: 0, ltProceeds: 0, stCost: 0, ltCost: 0 };
  for (const r of rows) {
    if (r.longTerm) { totals.ltGain += r.gain; totals.ltProceeds += r.proceeds; totals.ltCost += r.cost; }
    else { totals.stGain += r.gain; totals.stProceeds += r.proceeds; totals.stCost += r.cost; }
  }

  const on = parseCols('gains', req.nextUrl.searchParams.get('cols'));
  const rowMode = req.nextUrl.searchParams.get('rows') ?? 'all';
  // The row filter narrows the listed slices. The summary cards deliberately keep
  // the whole-FY short/long totals, since that is the figure that goes on a return.
  if (rowMode === 'short') rows = rows.filter((r) => !r.longTerm);
  else if (rowMode === 'long') rows = rows.filter((r) => r.longTerm);

  const generatedAt = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const safe = client.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'client';

  if ((req.nextUrl.searchParams.get('format') ?? 'pdf').toLowerCase() === 'xlsx') {
    const wb = newWorkbook();
    const ws = wb.addWorksheet(`FY ${fy}`.slice(0, 31), { views: [{ showGridLines: false }] });
    const cols = REPORT_COLUMNS.gains.filter((c) => on.has(c.key));
    ws.columns = cols.map((c) => ({ width: c.key === 'security' ? 16 : Math.max(10, c.label.length + 4) }));

    addHeader(ws, `Capital Gains Statement · FY ${fy}`, [
      `${client.name}${client.phone ? `  ·  ${client.phone}` : ''}${client.email ? `  ·  ${client.email}` : ''}`,
      `As of ${generatedAt}`,
    ]);

    const sum = [
      ['Short-term gain (Rs)', totals.stGain], ['Long-term gain (Rs)', totals.ltGain],
      ['Total realised (Rs)', totals.stGain + totals.ltGain],
    ] as const;
    for (const [label, val] of sum) {
      const r = ws.addRow([label, val]);
      r.getCell(1).font = { size: 10, color: { argb: XLC.mute } };
      r.getCell(2).numFmt = FMT_MONEY;
      r.getCell(2).font = gainFont(val, true);
      r.getCell(2).alignment = { horizontal: 'right' };
    }
    ws.addRow([]);

    const sections: [string, typeof rows, number][] = [];
    if (rowMode !== 'long') sections.push([`Short-term (held ≤ 365 days)`, rows.filter((r) => !r.longTerm), totals.stGain]);
    if (rowMode !== 'short') sections.push([`Long-term (held > 365 days)`, rows.filter((r) => r.longTerm), totals.ltGain]);
    for (const [title, subset, gain] of sections) {
      const sect = ws.addRow([title]);
      sect.getCell(1).font = { bold: true, size: 11 };
      addTableHead(ws, cols.map((c) => c.label), 2);
      if (subset.length === 0) {
        const r = ws.addRow(['None in this period.']);
        r.getCell(1).font = { size: 9.5, italic: true, color: { argb: XLC.mute } };
      }
      const valueOf = (key: string, r: (typeof subset)[number]) =>
        key === 'security' ? r.symbol : key === 'bought' ? r.buyDate : key === 'sold' ? r.sellDate
          : key === 'days' ? r.holdingDays : key === 'qty' ? r.qty : key === 'buyval' ? r.cost
          : key === 'sellval' ? r.proceeds : key === 'gain' ? r.gain
          : key === 'type' ? (r.longTerm ? 'LTCG' : 'STCG') : '';
      subset.forEach((r, i) => {
        const row = ws.addRow(cols.map((c) => valueOf(c.key, r)));
        styleDataRow(row, i);
        cols.forEach((c, ci) => {
          const cell = row.getCell(ci + 1);
          if (c.key === 'qty') cell.numFmt = FMT_QTY;
          else if (c.key === 'buyval' || c.key === 'sellval' || c.key === 'gain') cell.numFmt = FMT_MONEY;
          if (c.num) cell.alignment = { horizontal: 'right' };
          if (c.key === 'gain') cell.font = gainFont(r.gain);
        });
      });
      const tr = ws.addRow(cols.map((c) => (c.key === 'security' ? 'Subtotal' : c.key === 'gain' ? gain : '')));
      styleTotalRow(tr);
      cols.forEach((c, ci) => {
        if (c.key === 'gain') { tr.getCell(ci + 1).numFmt = FMT_MONEY; tr.getCell(ci + 1).font = gainFont(gain, true); }
        if (c.num) tr.getCell(ci + 1).alignment = { horizontal: 'right' };
      });
      ws.addRow([]);
    }

    addNote(ws, 'FIFO-matched buy→sell slices for listed equity. Holding > 365 days is classified long-term. Figures are indicative; please verify against contract notes before filing.');
    return xlsxResponse(wb, `capital-gains-${safe}-FY${fy}.xlsx`);
  }

  const logo = await getLogo();
  const buffer = await renderToBuffer(createElement(CapitalGainsPdf, { client, fy, rows, totals, generatedAt, logo, cols: [...on] }) as any);

  return new Response(new Uint8Array(buffer), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="capital-gains-${safe}-FY${fy}.pdf"` },
  });
}
