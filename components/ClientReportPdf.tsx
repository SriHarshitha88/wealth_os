import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';

// Amounts use plain Indian-grouped numbers under "Rs." column headers
// (PDF core fonts have no ₹ glyph — this matches how AMC statements print anyway).
const num = (n: number) =>
  Math.abs(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gl = (n: number) => (n < 0 ? `(${num(n)})` : num(n)); // accounting-style negatives
const qtyf = (n: number) => (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const pctf = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

const BRAND = '#12294A';   // Ashesha navy
const HEAD = '#12294A';    // table header band
const GOLD = '#B0863A';    // Ashesha gold accent
const GAIN = '#137A52';
const LOSS = '#C4472F';
const INK = '#16211E';
const MUTE = '#5E6F68';
const LINE = '#D7DEDA';
const ZEBRA = '#F4F7F5';
const BAND = '#EAF1EE';

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 60, paddingHorizontal: 34, fontSize: 8.5, color: INK, fontFamily: 'Helvetica' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  logo: { width: 156, height: 80, objectFit: 'contain' },
  brand: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: BRAND },
  brandSub: { fontSize: 7, color: GOLD, marginTop: 2, letterSpacing: 1.6, fontFamily: 'Helvetica-Bold' },
  stmt: { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  asof: { fontSize: 8, color: MUTE, marginTop: 2, textAlign: 'right' },
  rule: { borderBottomWidth: 1.5, borderBottomColor: BRAND, marginTop: 8, marginBottom: 14 },

  prepared: { fontSize: 7, color: MUTE, textTransform: 'uppercase', letterSpacing: 1 },
  clientName: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  clientMeta: { fontSize: 8.5, color: MUTE, marginTop: 2, marginBottom: 16 },

  sumRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  sumCard: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 9, backgroundColor: '#FBFCFB' },
  sumLabel: { fontSize: 6.5, color: MUTE, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  sumVal: { fontSize: 12, fontFamily: 'Helvetica-Bold' },

  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 6, color: INK },

  thead: { flexDirection: 'row', backgroundColor: HEAD, paddingVertical: 6, paddingHorizontal: 4 },
  th: { fontSize: 7, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: LINE, paddingVertical: 6, paddingHorizontal: 4 },
  rowAlt: { backgroundColor: ZEBRA },
  totalRow: { flexDirection: 'row', backgroundColor: BAND, paddingVertical: 7, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: BRAND },

  cSec: { width: '28%' },
  cCat: { width: '15%' },
  cQty: { width: '9%', textAlign: 'right' },
  cVal: { width: '12.5%', textAlign: 'right' },
  cPct: { width: '10.5%', textAlign: 'right' },

  secName: { fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  secSym: { fontSize: 7, color: MUTE, marginTop: 1 },
  cell: { fontSize: 8.5 },
  bold: { fontFamily: 'Helvetica-Bold' },

  footer: { position: 'absolute', bottom: 30, left: 34, right: 34 },
  note: { fontSize: 6.5, color: MUTE, marginBottom: 2, lineHeight: 1.3 },
  pageNo: { fontSize: 7, color: MUTE, textAlign: 'right', marginTop: 4 },
});

export type ReportRow = {
  symbol: string; name: string; sector: string | null; qty: number; avg: number; cur: number | null;
  investedValue: number; currentValue: number | null; pl: number | null; ret: number | null;
};
export type ReportData = {
  client: { name: string; phone: string; email: string | null; tier: string };
  rows: ReportRow[];
  totals: { invested: number; current: number; pl: number; plPct: number };
  generatedAt: string;
  logo?: string | null; // data URI of the Ashesha lockup
};

export default function ClientReportPdf({ client, rows, totals, generatedAt, logo }: ReportData) {
  const glColor = (n: number | null) => (n == null ? INK : n < 0 ? LOSS : GAIN);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            {logo ? (
              <Image src={logo} style={s.logo} />
            ) : (
              <>
                <Text style={s.brand}>Ashesha Capital</Text>
                <Text style={s.brandSub}>ADVISORY LLP</Text>
              </>
            )}
          </View>
          <View>
            <Text style={s.stmt}>Portfolio Statement</Text>
            <Text style={s.asof}>As of {generatedAt}</Text>
          </View>
        </View>
        <View style={s.rule} />

        <Text style={s.clientName}>{client.name}</Text>
        <Text style={s.clientMeta}>
          {client.tier} client{client.phone ? `   ·   ${client.phone}` : ''}{client.email ? `   ·   ${client.email}` : ''}
        </Text>

        <View style={s.sumRow}>
          <View style={s.sumCard}><Text style={s.sumLabel}>Value at Cost (Rs)</Text><Text style={s.sumVal}>{num(totals.invested)}</Text></View>
          <View style={s.sumCard}><Text style={s.sumLabel}>Current Value (Rs)</Text><Text style={s.sumVal}>{num(totals.current)}</Text></View>
          <View style={s.sumCard}><Text style={s.sumLabel}>Unrealised Gain / (Loss) (Rs)</Text><Text style={[s.sumVal, { color: glColor(totals.pl) }]}>{gl(totals.pl)}</Text></View>
          <View style={s.sumCard}><Text style={s.sumLabel}>Return</Text><Text style={[s.sumVal, { color: glColor(totals.pl) }]}>{pctf(totals.plPct)}</Text></View>
        </View>

        <Text style={s.sectionTitle}>Stocks</Text>
        <View style={s.thead} fixed>
          <Text style={[s.th, s.cSec]}>Security Name</Text>
          <Text style={[s.th, s.cCat]}>Sector / Category</Text>
          <Text style={[s.th, s.cQty]}>Quantity</Text>
          <Text style={[s.th, s.cVal]}>Current Value* Rs</Text>
          <Text style={[s.th, s.cVal]}>Value at Cost Rs</Text>
          <Text style={[s.th, s.cVal]}>Unrealised Gain / (Loss) Rs</Text>
          <Text style={[s.th, s.cPct]}>Gain / (Loss) %</Text>
        </View>

        {rows.map((r, i) => (
          <View style={[s.row, i % 2 === 1 ? s.rowAlt : {}]} key={i} wrap={false}>
            <View style={s.cSec}>
              <Text style={s.secName}>{r.name || r.symbol}</Text>
              <Text style={s.secSym}>{r.symbol}</Text>
            </View>
            <Text style={[s.cell, s.cCat]}>{r.sector || '-'}</Text>
            <Text style={[s.cell, s.cQty]}>{qtyf(r.qty)}</Text>
            <Text style={[s.cell, s.cVal]}>{r.currentValue != null ? num(r.currentValue) : '-'}</Text>
            <Text style={[s.cell, s.cVal]}>{num(r.investedValue)}</Text>
            <Text style={[s.cell, s.cVal, { color: glColor(r.pl) }]}>{r.pl != null ? gl(r.pl) : '-'}</Text>
            <Text style={[s.cell, s.cPct, { color: glColor(r.pl) }]}>{r.ret != null ? pctf(r.ret) : '-'}</Text>
          </View>
        ))}

        <View style={s.totalRow}>
          <Text style={[s.bold, s.cSec, { fontSize: 8.5 }]}>Total Stocks</Text>
          <Text style={s.cCat}> </Text>
          <Text style={s.cQty}> </Text>
          <Text style={[s.bold, s.cVal, { fontSize: 8.5 }]}>{num(totals.current)}</Text>
          <Text style={[s.bold, s.cVal, { fontSize: 8.5 }]}>{num(totals.invested)}</Text>
          <Text style={[s.bold, s.cVal, { fontSize: 8.5, color: glColor(totals.pl) }]}>{gl(totals.pl)}</Text>
          <Text style={[s.bold, s.cPct, { fontSize: 8.5, color: glColor(totals.pl) }]}>{pctf(totals.plPct)}</Text>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.note}>* Current value is basis the last available stock price and may differ from realisable value.</Text>
          <Text style={s.note}>Value at Cost is the purchase cost of the holding. Figures are indicative and do not constitute investment advice.</Text>
          <Text style={s.pageNo} render={({ pageNumber, totalPages }) => `Ashesha Capital Advisory LLP  ·  Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
