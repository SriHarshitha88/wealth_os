// Shared Excel (exceljs) helpers so every downloadable statement — portfolio,
// capital gains, fee, capital flows — carries the same Ashesha branding as the
// PDFs (navy header band, gold accents, INR number formats).
import ExcelJS from 'exceljs';

export const XLC = {
  brand: 'FF12294A', gold: 'FFB0863A', gain: 'FF137A52', loss: 'FFC4472F',
  ink: 'FF16211E', mute: 'FF5E6F68', line: 'FFD7DEDA', zebra: 'FFF4F7F5', band: 'FFEAF1EE',
};

// Negative numbers in red parentheses, Indian-style grouping left to Excel locale.
export const FMT_MONEY = '#,##0.00;[Red](#,##0.00)';
export const FMT_QTY = '#,##0.####';
export const FMT_PCT = '+0.00"%";[Red]-0.00"%"';

export function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wealth OS · Ashesha Capital Advisory LLP';
  wb.created = new Date();
  return wb;
}

// Statement header: brand line, statement title, client + meta lines.
export function addHeader(ws: ExcelJS.Worksheet, title: string, lines: string[]) {
  const brand = ws.addRow(['Ashesha Capital Advisory LLP']);
  brand.getCell(1).font = { bold: true, size: 14, color: { argb: XLC.brand } };
  const t = ws.addRow([title]);
  t.getCell(1).font = { bold: true, size: 11, color: { argb: XLC.gold } };
  for (const l of lines) {
    const r = ws.addRow([l]);
    r.getCell(1).font = { size: 10, color: { argb: XLC.mute } };
  }
  ws.addRow([]);
}

// Navy table header row.
export function addTableHead(ws: ExcelJS.Worksheet, headers: string[], rightFrom = 2) {
  const row = ws.addRow(headers);
  row.eachCell((cell, col) => {
    cell.font = { bold: true, size: 9.5, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLC.brand } };
    cell.border = { bottom: { style: 'thin', color: { argb: XLC.brand } } };
    if (col >= rightFrom) cell.alignment = { horizontal: 'right' };
  });
  return row;
}

// Zebra striping + thin bottom border for a data row.
export function styleDataRow(row: ExcelJS.Row, idx: number) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLC.zebra } };
    cell.border = { bottom: { style: 'hair', color: { argb: XLC.line } } };
  });
}

// Bold totals band (mirrors the PDF total row).
export function styleTotalRow(row: ExcelJS.Row) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLC.band } };
    cell.border = { top: { style: 'thin', color: { argb: XLC.brand } } };
  });
}

export function addNote(ws: ExcelJS.Worksheet, text: string) {
  const r = ws.addRow([text]);
  r.getCell(1).font = { size: 8.5, italic: true, color: { argb: XLC.mute } };
}

export function gainFont(n: number | null | undefined, bold = false) {
  if (n == null || Math.abs(n) < 0.005) return { bold, size: 10 };
  return { bold, size: 10, color: { argb: n < 0 ? XLC.loss : XLC.gain } };
}

export async function xlsxResponse(wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

// "12 Sep 2026, 3:45 pm IST" — the moment the shown market prices were fetched.
export function fmtIST(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    hour12: true, timeZone: 'Asia/Kolkata',
  }) + ' IST';
}

// Latest last_price_at across the securities in a report → the "prices as of" stamp.
export function latestPriceAt(dates: (string | null | undefined)[]) {
  let max: string | null = null;
  for (const d of dates) if (d && (!max || d > max)) max = d;
  return max;
}
