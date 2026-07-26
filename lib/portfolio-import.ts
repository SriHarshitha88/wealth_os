import ExcelJS from 'exceljs';

// One holding parsed out of an uploaded broker/portfolio spreadsheet.
export type ImportRow = {
  symbol: string;
  name: string;
  qty: number;
  avg: number;        // average cost / buy price
  cmp: number | null; // current market price, if the sheet has it
  prev: number | null; // previous close, derived from a "% change" column if present
};

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

// Find a column index whose header contains any of the given alias substrings.
function findCol(headers: string[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i]);
    if (h && aliases.some((a) => h.includes(a))) return i;
  }
  return -1;
}

// Locate the header row (the first row that looks like it has qty + a price column).
function locateHeader(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map(norm);
    const hasQty = cells.some((c) => /(^|\b)(qty|quantity|units|shares)\b/.test(c));
    const hasCost = cells.some((c) => c.includes('cost') || c.includes('avg') || c.includes('buy price'));
    if (hasQty && hasCost) return i;
  }
  return 0;
}

/**
 * Parse an uploaded .xlsx into holdings rows. Column matching is by header name
 * (case-insensitive, substring) so it tolerates different broker layouts.
 */
export async function parsePortfolioWorkbook(buf: ArrayBuffer): Promise<ImportRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('The file has no worksheet.');

  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    // exceljs row.values is 1-indexed (index 0 is a placeholder) — drop it.
    rows.push((row.values as unknown[]).slice(1));
  });
  if (rows.length < 2) throw new Error('The sheet has no data rows.');

  const hi = locateHeader(rows);
  const headers = rows[hi].map((h) => String(h ?? ''));
  const iSym = findCol(headers, ['symbol', 'ticker', 'scrip', 'code']);
  const iName = findCol(headers, ['company', 'security name', 'stock name', 'name', 'security']);
  const iQty = findCol(headers, ['qty', 'quantity', 'units', 'shares']);
  const iAvg = findCol(headers, ['average cost', 'avg cost', 'avg price', 'buy price', 'cost price', 'average', 'purchase price']);
  const iCmp = findCol(headers, ['current market', 'market price', 'cmp', 'ltp', 'current price', 'last price', 'closing price']);
  const iPct = findCol(headers, ['% change', 'change over prev', 'day change', 'change %']);

  if (iName < 0 || iQty < 0 || iAvg < 0) {
    throw new Error('Could not find the required columns. The sheet needs at least a company/name, a quantity, and an average/buy price column.');
  }

  const out: ImportRow[] = [];
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.length) continue;
    const name = String(row[iName] ?? '').trim();
    const qty = Number(row[iQty]);
    const avg = Number(row[iAvg]);
    if (!name || !isFinite(qty) || qty <= 0 || !isFinite(avg) || avg <= 0) continue; // skip totals/blank rows

    const rawSym = iSym >= 0 ? String(row[iSym] ?? '').trim() : '';
    const symbol = (rawSym || name.replace(/[^a-z0-9]+/gi, '').slice(0, 12).toUpperCase()) || name.slice(0, 12);
    const cmpN = iCmp >= 0 ? Number(row[iCmp]) : NaN;
    const pctN = iPct >= 0 ? Number(row[iPct]) : NaN;
    const cmp = isFinite(cmpN) ? +cmpN.toFixed(2) : null;
    const prev = cmp != null && isFinite(pctN) ? +(cmp / (1 + pctN / 100)).toFixed(2) : null;

    out.push({ symbol, name, qty, avg: +avg.toFixed(2), cmp, prev });
  }

  if (!out.length) throw new Error('No valid holdings were found in the sheet.');
  return out;
}
