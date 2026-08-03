import { type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@/lib/supabase/server';
import { computeLots } from '@/lib/portfolio-calc';
import { xirr, positionCashflows } from '@/lib/xirr';
import ClientReportPdf, { type ReportRow } from '@/components/ClientReportPdf';

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS ensures the signed-in advisor can only fetch their own client.
  const { data: client } = await supabase.from('clients').select('name, phone, email, tier').eq('id', id).maybeSingle();
  if (!client) return new Response('Client not found', { status: 404 });

  // Build positions from the transaction ledger (FIFO) so realised P/L is included.
  const { data: txns } = await supabase
    .from('transactions')
    .select('side, quantity, price, traded_at, security_id, securities(symbol, name, sector, last_price)')
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
      qty: pos.qty, avg: pos.avgCost, cur,
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

  const generatedAt = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const logo = await getLogo();

  const buffer = await renderToBuffer(
    createElement(ClientReportPdf, { client, rows, totals, generatedAt, logo }) as any,
  );

  const safe = client.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'client';
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="portfolio-${safe}.pdf"`,
    },
  });
}
