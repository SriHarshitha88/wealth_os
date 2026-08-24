import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate } from '@/lib/gemini';
import { getQuotes } from '@/lib/marketdata';
import { computeFee, deriveState } from '@/lib/fee-schedule';
import { fetchResultsOn } from '@/lib/nse-results';
import { privacyOn, maskIf } from '@/lib/privacy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rel = (x: any) => (Array.isArray(x) ? x[0] : x);
const r2 = (n: number) => Math.round(n * 100) / 100;

const SYSTEM = {
  parts: [{
    text: [
      'You are the Wealth OS Copilot, an assistant for an investment advisor who manages client stock portfolios on the NSE.',
      'Always use the provided tools to fetch real data — never invent names, holdings, prices or numbers.',
      'All monetary amounts are Indian rupees; format them with a ₹ sign and Indian-style commas.',
      'Be concise and professional. Use short paragraphs or compact lists. If a tool returns nothing, say so plainly.',
      'You can check NSE-filed quarterly results for a date (default today) with corporate_results — by default limited to stocks the book holds, so you can tell the advisor which of their holdings reported. It covers NSE quarterly-results filings only, not the full earnings calendar or guidance.',
      'If asked for something the tools cannot answer (e.g. a risk score we do not compute), say what you can and cannot see.',
    ].join(' '),
  }],
};

const TOOLS = [{
  functionDeclarations: [
    { name: 'book_summary', description: 'Total AUM, invested cost, unrealized P/L and client count across the whole book.', parameters: { type: 'object', properties: {} } },
    { name: 'list_clients', description: 'Every client with their current portfolio value and profit/loss.', parameters: { type: 'object', properties: {} } },
    { name: 'who_holds', description: 'Clients who hold a given stock, matched by ticker symbol or company name.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'stock symbol or company name, e.g. "Infosys" or "INFY"' } }, required: ['query'] } },
    { name: 'client_portfolio', description: 'Holdings with invested price, current price and P/L for one client, matched by name.', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
    { name: 'fee_status', description: 'High-water-mark performance-fee status per client, including any fee currently due.', parameters: { type: 'object', properties: {} } },
    { name: 'market_price', description: 'Live price for an NSE stock symbol, or an index (NIFTY, SENSEX, BANKNIFTY).', parameters: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] } },
    { name: 'corporate_results', description: "NSE-filed quarterly results announced on a date. Defaults to today and to only the stocks the book holds (with which clients hold each); pass scope 'all' for every NSE filing that day.", parameters: { type: 'object', properties: { scope: { type: 'string', description: "'held' (default) or 'all'" }, date: { type: 'string', description: 'optional DD-Mon-YYYY, e.g. 28-Jul-2026; default today' } } } },
  ],
}];

async function valueRows(supabase: any, clientId?: string) {
  let q = supabase.from('holdings').select('client_id, quantity, avg_price, securities(symbol, name, last_price)');
  if (clientId) q = q.eq('client_id', clientId);
  const { data } = await q;
  return data ?? [];
}

async function yahoo(sym: string) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const j = await res.json();
  const m = j?.chart?.result?.[0]?.meta;
  return m?.regularMarketPrice != null ? { price: Number(m.regularMarketPrice), prevClose: Number(m.chartPreviousClose ?? m.previousClose ?? m.regularMarketPrice) } : null;
}

async function dispatch(supabase: any, name: string, args: any, privacy: boolean) {
  switch (name) {
    case 'book_summary': {
      const rows = await valueRows(supabase);
      let cur = 0, inv = 0;
      for (const h of rows) { const s = rel(h.securities); inv += h.quantity * h.avg_price; if (s?.last_price != null) cur += h.quantity * s.last_price; }
      const { count } = await supabase.from('clients').select('id', { count: 'exact', head: true });
      return { aum: r2(cur), invested: r2(inv), unrealized_pl: r2(cur - inv), return_pct: inv ? r2((cur - inv) / inv * 100) : 0, clients: count ?? 0 };
    }
    case 'list_clients': {
      const { data: cl } = await supabase.from('clients').select('id, name');
      const rows = await valueRows(supabase);
      return (cl ?? []).map((c: any) => {
        let cur = 0, inv = 0;
        for (const h of rows) { if (h.client_id !== c.id) continue; const s = rel(h.securities); inv += h.quantity * h.avg_price; if (s?.last_price != null) cur += h.quantity * s.last_price; }
        return { client: maskIf(c.name, privacy), current_value: r2(cur), invested: r2(inv), pl: r2(cur - inv), return_pct: inv ? r2((cur - inv) / inv * 100) : 0 };
      });
    }
    case 'who_holds': {
      const term = String(args.query ?? '').trim();
      const { data: secs } = await supabase.from('securities').select('id, symbol, name, last_price').or(`symbol.ilike.%${term}%,name.ilike.%${term}%`).limit(5);
      if (!secs?.length) return { holders: [], note: `No stock matching "${term}".` };
      const ids = secs.map((s: any) => s.id);
      const { data: hold } = await supabase.from('holdings').select('quantity, avg_price, security_id, clients(name)').in('security_id', ids);
      const byId = new Map(secs.map((s: any) => [s.id, s]));
      return {
        matched_stocks: secs.map((s: any) => ({ symbol: s.symbol, name: s.name })),
        holders: (hold ?? []).map((h: any) => {
          const s: any = byId.get(h.security_id);
          const cur = s?.last_price != null ? h.quantity * s.last_price : null;
          return { stock: s?.symbol, client: maskIf(rel(h.clients)?.name ?? '', privacy), quantity: h.quantity, avg_price: r2(h.avg_price), current_price: s?.last_price ?? null, pl: cur != null ? r2(cur - h.quantity * h.avg_price) : null };
        }),
      };
    }
    case 'client_portfolio': {
      const { data: c } = await supabase.from('clients').select('id, name').ilike('name', `%${String(args.name ?? '').trim()}%`).limit(1).maybeSingle();
      if (!c) return { note: `No client matching "${args.name}".` };
      const rows = await valueRows(supabase, c.id);
      let cur = 0, inv = 0;
      const holdings = rows.map((h: any) => {
        const s = rel(h.securities); const c1 = s?.last_price != null ? h.quantity * s.last_price : null; const i1 = h.quantity * h.avg_price;
        inv += i1; if (c1 != null) cur += c1;
        return { stock: s?.symbol, quantity: h.quantity, invested_price: r2(h.avg_price), current_price: s?.last_price ?? null, pl: c1 != null ? r2(c1 - i1) : null };
      });
      return { client: maskIf(c.name, privacy), current_value: r2(cur), invested: r2(inv), pl: r2(cur - inv), holdings };
    }
    case 'fee_status': {
      const { data: cl } = await supabase.from('clients').select('id, name');
      const rows = await valueRows(supabase);
      const { data: feeRows } = await supabase.from('fees').select('client_id, amount, status, invoice_no');
      const feesBy = new Map<string, any[]>();
      for (const f of feeRows ?? []) { const a = feesBy.get(f.client_id) ?? []; a.push(f); feesBy.set(f.client_id, a); }
      return (cl ?? []).map((c: any) => {
        let cur = 0, inv = 0;
        for (const h of rows) { if (h.client_id !== c.id) continue; const s = rel(h.securities); inv += h.quantity * h.avg_price; if (s?.last_price != null) cur += h.quantity * s.last_price; }
        const capital = inv; // net invested (tracks deposits), not a frozen snapshot
        const { chargedBands, aboveSettled } = deriveState(feesBy.get(c.id) ?? [], capital);
        const calc = computeFee({ capital, current: cur, chargedBands, aboveSettled });
        return {
          client: maskIf(c.name, privacy), capital: r2(capital), current_value: r2(cur),
          appreciation_pct: r2(calc.gainPct), milestone_reached_pct: calc.reachedPct, milestone_billed_pct: chargedBands * 20,
          next_milestone_pct: calc.nextMilestonePct, next_milestone_value: calc.nextMilestoneValue ? r2(calc.nextMilestoneValue) : null,
          status: calc.feeDue > 0 ? 'Fee due' : cur < capital ? 'Below capital' : 'On track', fee_due: r2(calc.feeDue),
        };
      }).filter((x: any) => x.current_value > 0 || x.capital > 0);
    }
    case 'market_price': {
      const s = String(args.symbol ?? '').toUpperCase().replace(/\s/g, '');
      const idx: Record<string, string> = { NIFTY: '^NSEI', NIFTY50: '^NSEI', SENSEX: '^BSESN', BANKNIFTY: '^NSEBANK', NIFTYBANK: '^NSEBANK' };
      if (idx[s]) { const q = await yahoo(idx[s]); return q ? { symbol: s, price: r2(q.price), prev_close: r2(q.prevClose) } : { error: 'no data' }; }
      const [q] = await getQuotes([s]);
      return q ? { symbol: s, price: r2(q.price), prev_close: r2(q.prevClose) } : { error: `No price for ${s}.` };
    }
    case 'corporate_results': {
      let filings;
      try { filings = await fetchResultsOn(args.date); }
      catch (e: any) { return { error: `Couldn't reach the NSE results feed right now (${e.message}). Try again shortly.` }; }
      const when = args.date ?? 'today';
      if (String(args.scope) === 'all') {
        return { date: when, scope: 'all', count: filings.length, results: filings.slice(0, 60) };
      }
      // held-only (default): intersect with the book and attach which clients hold each
      const { data: hold } = await supabase.from('holdings').select('securities(symbol), clients(name)');
      const holdersBySym = new Map<string, string[]>();
      for (const h of hold ?? []) {
        const sym = rel((h as any).securities)?.symbol?.toUpperCase();
        const cn = rel((h as any).clients)?.name;
        if (!sym) continue;
        const arr = holdersBySym.get(sym) ?? [];
        if (cn) arr.push(cn);
        holdersBySym.set(sym, arr);
      }
      const held = filings.filter((f) => holdersBySym.has(f.symbol)).map((f) => ({ ...f, held_by: holdersBySym.get(f.symbol) }));
      return { date: when, scope: 'held', held_count: held.length, results: held, note: held.length ? undefined : 'None of the stocks your clients hold filed results on that date.' };
    }
    default: return { error: 'unknown tool' };
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Not signed in.' }, { status: 401 });

  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ reply: 'The AI Copilot is not configured yet — add GEMINI_API_KEY to your environment.' });
  }

  const privacy = await privacyOn();
  const { messages } = await req.json();
  const contents: any[] = (messages ?? []).map((m: any) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));

  try {
    for (let i = 0; i < 6; i++) {
      const resp = await geminiGenerate({ systemInstruction: SYSTEM, tools: TOOLS, contents });
      if (resp?.error) return Response.json({ reply: `AI error: ${resp.error.message ?? 'unknown'}` });

      const content = resp?.candidates?.[0]?.content;
      const parts = content?.parts ?? [];
      const calls = parts.filter((p: any) => p.functionCall);

      if (calls.length === 0) {
        const text = parts.map((p: any) => p.text).filter(Boolean).join('').trim();
        return Response.json({ reply: text || 'Sorry, I could not find an answer.' });
      }

      // Echo the model's content verbatim — it carries the thoughtSignature the API requires.
      contents.push(content);
      const responses = [];
      for (const c of calls) {
        const result = await dispatch(supabase, c.functionCall.name, c.functionCall.args ?? {}, privacy);
        responses.push({ functionResponse: { name: c.functionCall.name, response: { result } } });
      }
      contents.push({ role: 'user', parts: responses });
    }
    return Response.json({ reply: 'That needed too many steps — please try rephrasing.' });
  } catch (e: any) {
    return Response.json({ reply: `Something went wrong: ${e.message}` });
  }
}
