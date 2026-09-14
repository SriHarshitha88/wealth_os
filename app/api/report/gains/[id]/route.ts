import { type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@/lib/supabase/server';
import { computeLots } from '@/lib/portfolio-calc';
import { fyLabelOf, currentFY } from '@/lib/capital-gains';
import CapitalGainsPdf, { type CGRow, type CGTotals } from '@/components/CapitalGainsPdf';
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

  const rows: CGRow[] = [];
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

  const generatedAt = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const safe = client.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'client';

  if ((req.nextUrl.searchParams.get('format') ?? 'pdf').toLowerCase() === 'xlsx') {
    const wb = newWorkbook();
    const ws = wb.addWorksheet(`FY ${fy}`.slice(0, 31), { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 16 }, { width: 13 }, { width: 13 }, { width: 9 }, { width: 12 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 9 }];

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

    for (const [title, subset, gain] of [
      [`Short-term (held ≤ 365 days)`, rows.filter((r) => !r.longTerm), totals.stGain],
      [`Long-term (held > 365 days)`, rows.filter((r) => r.longTerm), totals.ltGain],
    ] as const) {
      const sect = ws.addRow([title]);
      sect.getCell(1).font = { bold: true, size: 11 };
      addTableHead(ws, ['Security', 'Bought', 'Sold', 'Days', 'Qty', 'Buy Value', 'Sell Value', 'Gain / (Loss)', 'Type'], 2);
      if (subset.length === 0) {
        const r = ws.addRow(['None in this period.']);
        r.getCell(1).font = { size: 9.5, italic: true, color: { argb: XLC.mute } };
      }
      subset.forEach((r, i) => {
        const row = ws.addRow([r.symbol, r.buyDate, r.sellDate, r.holdingDays, r.qty, r.cost, r.proceeds, r.gain, r.longTerm ? 'LTCG' : 'STCG']);
        styleDataRow(row, i);
        row.getCell(5).numFmt = FMT_QTY;
        for (const c of [6, 7, 8]) row.getCell(c).numFmt = FMT_MONEY;
        for (const c of [2, 3, 4, 5, 6, 7, 8, 9]) row.getCell(c).alignment = { horizontal: 'right' };
        row.getCell(8).font = gainFont(r.gain);
      });
      const tr = ws.addRow(['Subtotal', '', '', '', '', '', '', gain, '']);
      styleTotalRow(tr);
      tr.getCell(8).numFmt = FMT_MONEY;
      tr.getCell(8).alignment = { horizontal: 'right' };
      tr.getCell(8).font = gainFont(gain, true);
      ws.addRow([]);
    }

    addNote(ws, 'FIFO-matched buy→sell slices for listed equity. Holding > 365 days is classified long-term. Figures are indicative; please verify against contract notes before filing.');
    return xlsxResponse(wb, `capital-gains-${safe}-FY${fy}.xlsx`);
  }

  const logo = await getLogo();
  const buffer = await renderToBuffer(createElement(CapitalGainsPdf, { client, fy, rows, totals, generatedAt, logo }) as any);

  return new Response(new Uint8Array(buffer), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="capital-gains-${safe}-FY${fy}.pdf"` },
  });
}
