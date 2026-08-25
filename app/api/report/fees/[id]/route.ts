import { type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@/lib/supabase/server';
import { computeFee, deriveState, BAND_RATES, BAND_STEP } from '@/lib/fee-schedule';
import FeeStatementPdf, { type FeeLadderRow } from '@/components/FeeStatementPdf';

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase.from('clients').select('name, phone, email').eq('id', id).maybeSingle();
  if (!client) return new Response('Client not found', { status: 404 });

  const { data: holdings } = await supabase
    .from('holdings').select('quantity, avg_price, securities(last_price)').eq('client_id', id);
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
  const logo = await getLogo();

  const buffer = await renderToBuffer(
    createElement(FeeStatementPdf, {
      client, capital, current, gainPct: calc.gainPct, ladder,
      totals: { collected, dueNow: calc.feeDue }, generatedAt, logo,
    }) as any,
  );

  const safe = client.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'client';
  return new Response(new Uint8Array(buffer), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="fee-statement-${safe}.pdf"` },
  });
}
