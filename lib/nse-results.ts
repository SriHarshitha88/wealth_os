// "Which stocks declared results" — from NSE's live corporate-announcements
// feed (the financial-results endpoint lags for the current day). Used by the
// Copilot. NOTE: NSE's public endpoint works from residential IPs but sometimes
// blocks datacenter/serverless IPs with 403 — callers must handle a thrown error.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type ResultFiling = { symbol: string; subject: string; at: string };

// NSE "DD-Mon-YYYY" (matches an_dt's leading 11 chars) in IST.
export function istDMY(d = new Date()): string {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('day')}-${g('month')}-${g('year')}`;
}

// A genuine results *declaration* (not a clarification/reply/intimation/etc.).
function isResultDeclaration(desc: string): boolean {
  const d = desc.toLowerCase();
  if (!/(financial result|integrated filing.*financ|results for the (quarter|period))/.test(d)) return false;
  return !/(clarification|reply|re-?submission|intimation|newspaper|advertisement|copy of|presentation|transcript|conference|investor|analyst|schedule|withdrawal|postpone|board meeting)/.test(d);
}

// Convert "DD-Mon-YYYY" → "DD-MM-YYYY" for the API's date params.
function toNumeric(dmy: string): string {
  const [d, mon, y] = dmy.split('-');
  const mm = String(MONTHS.indexOf(mon) + 1).padStart(2, '0');
  return `${d}-${mm}-${y}`;
}

// Accept a caller-supplied "DD-Mon-YYYY" (any month casing) or default to today IST.
function normDMY(s?: string): string {
  if (s && /^\d{2}-[A-Za-z]{3}-\d{4}$/.test(s)) {
    const [d, mon, y] = s.split('-');
    return `${d}-${mon[0].toUpperCase()}${mon.slice(1).toLowerCase()}-${y}`;
  }
  return istDMY();
}

// Result declarations broadcast on `dmy` ("DD-Mon-YYYY", default today IST),
// one row per company (deduped by symbol).
export async function fetchResultsOn(dmy?: string): Promise<ResultFiling[]> {
  const target = normDMY(dmy);
  const numeric = toNumeric(target);
  const res = await fetch(
    `https://www.nseindia.com/api/corporate-announcements?index=equities&from_date=${numeric}&to_date=${numeric}`,
    {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://www.nseindia.com/companies-listing/corporate-filings-announcements',
      },
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error(`NSE announcements feed returned ${res.status}`);
  const data = await res.json();

  const seen = new Set<string>();
  const out: ResultFiling[] = [];
  for (const x of Array.isArray(data) ? data : []) {
    const at = String(x?.an_dt ?? '');
    if (at.slice(0, 11) !== target) continue;
    const desc = String(x?.desc ?? '');
    if (!isResultDeclaration(desc)) continue;
    const symbol = String(x?.symbol ?? '').toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push({ symbol, subject: desc, at });
  }
  return out;
}
