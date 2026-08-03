import { type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@/lib/supabase/server';
import { computeLots } from '@/lib/portfolio-calc';
import { fyLabelOf, currentFY } from '@/lib/capital-gains';
import CapitalGainsPdf, { type CGRow, type CGTotals } from '@/components/CapitalGainsPdf';

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
  const logo = await getLogo();
  const buffer = await renderToBuffer(createElement(CapitalGainsPdf, { client, fy, rows, totals, generatedAt, logo }) as any);

  const safe = client.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'client';
  return new Response(new Uint8Array(buffer), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="capital-gains-${safe}-FY${fy}.pdf"` },
  });
}
