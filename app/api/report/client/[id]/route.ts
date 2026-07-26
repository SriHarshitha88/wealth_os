import { type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@/lib/supabase/server';
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

  const { data: holdings } = await supabase
    .from('holdings')
    .select('quantity, avg_price, securities(symbol, name, sector, last_price)')
    .eq('client_id', id);

  const rows: ReportRow[] = (holdings ?? []).map((h) => {
    const sec = rel((h as any).securities);
    const qty = Number(h.quantity);
    const avg = Number(h.avg_price);
    const cur = sec?.last_price != null ? Number(sec.last_price) : null;
    const investedValue = qty * avg;
    const currentValue = cur != null ? qty * cur : null;
    const pl = currentValue != null ? currentValue - investedValue : null;
    const ret = pl != null && investedValue ? (pl / investedValue) * 100 : null;
    return { symbol: sec?.symbol ?? '-', name: sec?.name ?? '', sector: sec?.sector ?? null, qty, avg, cur, investedValue, currentValue, pl, ret };
  });

  const invested = rows.reduce((a, r) => a + r.investedValue, 0);
  const current = rows.reduce((a, r) => a + (r.currentValue ?? r.investedValue), 0);
  const pl = current - invested;
  const totals = { invested, current, pl, plPct: invested ? (pl / invested) * 100 : 0 };

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
