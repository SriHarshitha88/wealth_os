import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';

const num = (n: number) => Math.abs(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gl = (n: number) => (n < 0 ? `(${num(n)})` : num(n));
const qtyf = (n: number) => (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const pctf = (n: number | null) => (n == null ? '-' : (n >= 0 ? '+' : '') + n.toFixed(2) + '%');
const dt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata' }) : '-');

const BRAND = '#12294A', GOLD = '#B0863A', GAIN = '#137A52', LOSS = '#C4472F', INK = '#16211E', MUTE = '#5E6F68', LINE = '#D7DEDA', ZEBRA = '#F4F7F5', BAND = '#EAF1EE';

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 60, paddingHorizontal: 28, fontSize: 8, color: INK, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  logo: { width: 150, height: 76, objectFit: 'contain' },
  brand: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: BRAND },
  brandSub: { fontSize: 7, color: GOLD, marginTop: 2, letterSpacing: 1.6, fontFamily: 'Helvetica-Bold' },
  stmt: { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  asof: { fontSize: 8, color: MUTE, marginTop: 2, textAlign: 'right' },
  rule: { borderBottomWidth: 1.5, borderBottomColor: BRAND, marginTop: 8, marginBottom: 14 },
  clientName: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  clientMeta: { fontSize: 8.5, color: MUTE, marginTop: 2, marginBottom: 16 },
  sumRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  sumCard: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 9, backgroundColor: '#FBFCFB' },
  sumLabel: { fontSize: 6.5, color: MUTE, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  sumVal: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 6, marginTop: 6 },
  thead: { flexDirection: 'row', backgroundColor: BRAND, paddingVertical: 6, paddingHorizontal: 4 },
  th: { fontSize: 6.8, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' },
  thSub: { fontSize: 5.8, fontFamily: 'Helvetica', marginTop: 1 },
  row: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: LINE, paddingVertical: 5, paddingHorizontal: 4 },
  rowAlt: { backgroundColor: ZEBRA },
  totalRow: { flexDirection: 'row', backgroundColor: BAND, paddingVertical: 7, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: BRAND },
  secName: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  secSym: { fontSize: 6.5, color: MUTE, marginTop: 1 },
  bold: { fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 28, left: 28, right: 28 },
  note: { fontSize: 6.5, color: MUTE, marginBottom: 2, lineHeight: 1.3 },
  pageNo: { fontSize: 7, color: MUTE, textAlign: 'right', marginTop: 4 },
  // columns (sum = 100%)
  cSec: { width: '16%' }, cQty: { width: '6%', textAlign: 'right' }, cSince: { width: '8%', textAlign: 'right' },
  cMkt: { width: '11%', textAlign: 'right' },
  cCur: { width: '12%', textAlign: 'right' }, cCost: { width: '12%', textAlign: 'right' }, cUnrl: { width: '12%', textAlign: 'right' },
  cReal: { width: '10%', textAlign: 'right' }, cPct: { width: '7%', textAlign: 'right', paddingRight: 4 }, cXirr: { width: '6%', textAlign: 'right' },
  mktDate: { fontSize: 5.8, color: MUTE, marginTop: 1, textAlign: 'right' },
  costAvg: { fontSize: 5.8, color: MUTE, marginTop: 1, textAlign: 'right' },
});

export type ReportRow = {
  symbol: string; name: string; sector: string | null; qty: number; avg: number; cur: number | null;
  curAt: string | null;   // when the market price was last fetched (Friday's close on a weekend)
  investedValue: number; currentValue: number | null; pl: number | null; ret: number | null; realised: number;
  firstBuyDate: string | null; xirr: number | null;
};
export type ReportData = {
  client: { name: string; phone: string; email: string | null; tier: string };
  rows: ReportRow[];
  totals: { invested: number; current: number; pl: number; plPct: number; realised: number };
  generatedAt: string;
  priceAsOf?: string | null;   // latest price timestamp across holdings, IST
  logo?: string | null;
};

const glColor = (n: number | null) => (n == null ? INK : n < 0 ? LOSS : GAIN);

function Head() {
  return (
    <View style={s.thead} fixed>
      <Text style={[s.th, s.cSec]}>Security</Text>
      <Text style={[s.th, s.cQty]}>Qty</Text>
      <Text style={[s.th, s.cSince]}>Since</Text>
      <Text style={[s.th, s.cMkt]}>Mkt Price*</Text>
      <Text style={[s.th, s.cCur]}>Current Value*</Text>
      <View style={s.cCost}><Text style={s.th}>Value at Cost</Text><Text style={[s.th, s.thSub]}>(purchase price)</Text></View>
      <Text style={[s.th, s.cUnrl]}>Unrealised G/(L)</Text>
      <Text style={[s.th, s.cReal]}>Realised G/(L)</Text>
      <Text style={[s.th, s.cPct]}>Gain %</Text>
      <Text style={[s.th, s.cXirr]}>XIRR</Text>
    </View>
  );
}

export default function ClientReportPdf({ client, rows, totals, generatedAt, priceAsOf, logo }: ReportData) {
  const open = rows.filter((r) => r.qty > 1e-9);
  const sold = rows.filter((r) => r.qty <= 1e-9 && Math.abs(r.realised) > 0.005);
  const soldRealised = sold.reduce((a, r) => a + r.realised, 0);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>{logo ? <Image src={logo} style={s.logo} /> : <><Text style={s.brand}>Ashesha Capital</Text><Text style={s.brandSub}>ADVISORY LLP</Text></>}</View>
          <View>
            <Text style={s.stmt}>Portfolio Statement</Text>
            <Text style={s.asof}>As of {generatedAt}</Text>
            {priceAsOf ? <Text style={s.asof}>Prices as of {priceAsOf}</Text> : null}
          </View>
        </View>
        <View style={s.rule} />

        <Text style={s.clientName}>{client.name}</Text>
        <Text style={s.clientMeta}>{client.tier} client{client.phone ? `   ·   ${client.phone}` : ''}{client.email ? `   ·   ${client.email}` : ''}</Text>

        <View style={s.sumRow}>
          <View style={s.sumCard}><Text style={s.sumLabel}>Value at Cost (Rs)</Text><Text style={s.sumVal}>{num(totals.invested)}</Text></View>
          <View style={s.sumCard}><Text style={s.sumLabel}>Current Value (Rs)</Text><Text style={s.sumVal}>{num(totals.current)}</Text></View>
          <View style={s.sumCard}><Text style={s.sumLabel}>Unrealised Gain / (Loss)</Text><Text style={[s.sumVal, { color: glColor(totals.pl) }]}>{gl(totals.pl)}</Text></View>
          <View style={s.sumCard}><Text style={s.sumLabel}>Realised Gain / (Loss)</Text><Text style={[s.sumVal, { color: glColor(Math.abs(totals.realised) < 0.005 ? null : totals.realised) }]}>{Math.abs(totals.realised) < 0.005 ? '-' : gl(totals.realised)}</Text></View>
        </View>

        {/* ---- Holdings (open) ---- */}
        <Text style={s.sectionTitle}>Holdings</Text>
        <Head />
        {open.map((r, i) => (
          <View style={[s.row, i % 2 === 1 ? s.rowAlt : {}]} key={i} wrap={false}>
            <View style={s.cSec}><Text style={s.secName}>{r.name || r.symbol}</Text><Text style={s.secSym}>{r.symbol}</Text></View>
            <Text style={s.cQty}>{qtyf(r.qty)}</Text>
            <Text style={s.cSince}>{dt(r.firstBuyDate)}</Text>
            <View style={s.cMkt}>
              <Text>{r.cur != null ? num(r.cur) : '-'}</Text>
              {r.cur != null && r.curAt ? <Text style={s.mktDate}>{dt(r.curAt)}</Text> : null}
            </View>
            <Text style={s.cCur}>{r.currentValue != null ? num(r.currentValue) : '-'}</Text>
            <View style={s.cCost}>
              <Text>{num(r.investedValue)}</Text>
              <Text style={s.costAvg}>@ {num(r.avg)}</Text>
            </View>
            <Text style={[s.cUnrl, { color: glColor(r.pl) }]}>{r.pl != null ? gl(r.pl) : '-'}</Text>
            <Text style={[s.cReal, { color: glColor(Math.abs(r.realised) < 0.005 ? null : r.realised) }]}>{Math.abs(r.realised) < 0.005 ? '-' : gl(r.realised)}</Text>
            <Text style={[s.cPct, { color: glColor(r.pl) }]}>{pctf(r.ret)}</Text>
            <Text style={[s.cXirr, { color: glColor(r.xirr) }]}>{pctf(r.xirr)}</Text>
          </View>
        ))}
        <View style={s.totalRow}>
          <Text style={[s.bold, s.cSec]}>Total Holdings</Text>
          <Text style={s.cQty}> </Text><Text style={s.cSince}> </Text><Text style={s.cMkt}> </Text>
          <Text style={[s.bold, s.cCur]}>{num(totals.current)}</Text>
          <Text style={[s.bold, s.cCost]}>{num(totals.invested)}</Text>
          <Text style={[s.bold, s.cUnrl, { color: glColor(totals.pl) }]}>{gl(totals.pl)}</Text>
          <Text style={s.cReal}> </Text>
          <Text style={[s.bold, s.cPct, { color: glColor(totals.pl) }]}>{pctf(totals.plPct)}</Text>
          <Text style={s.cXirr}> </Text>
        </View>

        {/* ---- Sold (realised) ---- */}
        {sold.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Sold / Realised</Text>
            <Head />
            {sold.map((r, i) => (
              <View style={[s.row, i % 2 === 1 ? s.rowAlt : {}]} key={i} wrap={false}>
                <View style={s.cSec}><Text style={s.secName}>{r.name || r.symbol}</Text><Text style={s.secSym}>{r.symbol}</Text></View>
                <Text style={s.cQty}>-</Text>
                <Text style={s.cSince}>{dt(r.firstBuyDate)}</Text>
                <Text style={s.cMkt}>-</Text>
                <Text style={s.cCur}>-</Text>
                <Text style={s.cCost}>-</Text>
                <Text style={s.cUnrl}>-</Text>
                <Text style={[s.cReal, { color: glColor(r.realised) }]}>{gl(r.realised)}</Text>
                <Text style={s.cPct}>-</Text>
                <Text style={[s.cXirr, { color: glColor(r.xirr) }]}>{pctf(r.xirr)}</Text>
              </View>
            ))}
            <View style={s.totalRow}>
              <Text style={[s.bold, s.cSec]}>Total Realised</Text>
              <Text style={s.cQty}> </Text><Text style={s.cSince}> </Text><Text style={s.cMkt}> </Text><Text style={s.cCur}> </Text><Text style={s.cCost}> </Text><Text style={s.cUnrl}> </Text>
              <Text style={[s.bold, s.cReal, { color: glColor(soldRealised) }]}>{gl(soldRealised)}</Text>
              <Text style={s.cPct}> </Text><Text style={s.cXirr}> </Text>
            </View>
            <Text style={{ fontSize: 6.5, color: MUTE, marginTop: 4 }}>Detailed short-term / long-term capital gains are in the separate Capital Gains Statement.</Text>
          </>
        )}

        <View style={s.footer} fixed>
          <Text style={s.note}>* Market Price is the last available stock price (previous trading day&apos;s close on weekends/holidays); the date under each price shows when it is from. Current value is basis that price and may differ from realisable value. XIRR is the annualised money-weighted return.</Text>
          <Text style={s.note}>Value at Cost is the purchase cost of the holding; the figure beneath it is the average purchase price per unit. Figures are indicative and do not constitute investment advice.</Text>
          <Text style={s.pageNo} render={({ pageNumber, totalPages }) => `Ashesha Capital Advisory LLP  ·  Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
