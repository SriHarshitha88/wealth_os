import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { layout } from '@/lib/report-columns';

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
  row: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: LINE, paddingVertical: 5, paddingHorizontal: 4 },
  rowAlt: { backgroundColor: ZEBRA },
  totalRow: { flexDirection: 'row', backgroundColor: BAND, paddingVertical: 7, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: BRAND },
  secName: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  secSym: { fontSize: 6.5, color: MUTE, marginTop: 1 },
  bold: { fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 28, left: 28, right: 28 },
  note: { fontSize: 6.5, color: MUTE, marginBottom: 2, lineHeight: 1.3 },
  pageNo: { fontSize: 7, color: MUTE, textAlign: 'right', marginTop: 4 },
  subNum: { fontSize: 5.8, color: MUTE, marginTop: 1, textAlign: 'right' },
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
  cols: string[];              // selected column keys, in canonical order
};

const glColor = (n: number | null) => (n == null ? INK : n < 0 ? LOSS : GAIN);

export default function ClientReportPdf({ client, rows, totals, generatedAt, priceAsOf, logo, cols }: ReportData) {
  const on = new Set(cols);
  const table = layout('client', on);
  const showAvg = on.has('avg');
  const showSym = on.has('symbol');
  const showMktDate = on.has('mktdate');

  const open = rows.filter((r) => r.qty > 1e-9);
  const sold = rows.filter((r) => r.qty <= 1e-9 && Math.abs(r.realised) > 0.005);
  const soldRealised = sold.reduce((a, r) => a + r.realised, 0);

  // One cell of a holdings row, keyed by column. Returns null where the column
  // has nothing to say for that row (sold positions have no live price).
  function cell(key: string, r: ReportRow, isSold: boolean) {
    if (isSold && key !== 'security' && key !== 'since' && key !== 'real' && key !== 'xirr') return <Text>-</Text>;
    switch (key) {
      case 'security':
        return (
          <View>
            <Text style={s.secName}>{r.name || r.symbol}</Text>
            {showSym ? <Text style={s.secSym}>{r.symbol}</Text> : null}
          </View>
        );
      case 'qty': return <Text>{qtyf(r.qty)}</Text>;
      case 'since': return <Text>{dt(r.firstBuyDate)}</Text>;
      case 'mkt':
        return (
          <View>
            <Text>{r.cur != null ? num(r.cur) : '-'}</Text>
            {r.cur != null && r.curAt && showMktDate ? <Text style={s.subNum}>{dt(r.curAt)}</Text> : null}
          </View>
        );
      case 'cur': return <Text>{r.currentValue != null ? num(r.currentValue) : '-'}</Text>;
      case 'cost':
        return (
          <View>
            <Text>{num(r.investedValue)}</Text>
            {showAvg ? <Text style={s.subNum}>@ {num(r.avg)}</Text> : null}
          </View>
        );
      case 'unrl': return <Text style={{ color: glColor(r.pl) }}>{r.pl != null ? gl(r.pl) : '-'}</Text>;
      case 'real':
        return (
          <Text style={{ color: glColor(Math.abs(r.realised) < 0.005 ? null : r.realised) }}>
            {Math.abs(r.realised) < 0.005 ? '-' : gl(r.realised)}
          </Text>
        );
      case 'pct': return <Text style={{ color: glColor(r.pl) }}>{pctf(r.ret)}</Text>;
      case 'xirr': return <Text style={{ color: glColor(r.xirr) }}>{pctf(r.xirr)}</Text>;
      default: return <Text> </Text>;
    }
  }

  function totalCell(key: string) {
    switch (key) {
      case 'security': return <Text style={s.bold}>Total Holdings</Text>;
      case 'cur': return <Text style={s.bold}>{num(totals.current)}</Text>;
      case 'cost': return <Text style={s.bold}>{num(totals.invested)}</Text>;
      case 'unrl': return <Text style={[s.bold, { color: glColor(totals.pl) }]}>{gl(totals.pl)}</Text>;
      case 'pct': return <Text style={[s.bold, { color: glColor(totals.pl) }]}>{pctf(totals.plPct)}</Text>;
      default: return <Text> </Text>;
    }
  }

  const Head = () => (
    <View style={s.thead} fixed>
      {table.map((c) => (
        <Text key={c.key} style={[s.th, { width: c.pct, textAlign: c.num ? 'right' : 'left' }]}>{c.label}</Text>
      ))}
    </View>
  );

  const Row = ({ r, i, isSold }: { r: ReportRow; i: number; isSold: boolean }) => (
    <View style={[s.row, i % 2 === 1 ? s.rowAlt : {}]} wrap={false}>
      {table.map((c) => (
        <View key={c.key} style={{ width: c.pct, textAlign: c.num ? 'right' : 'left' }}>
          {cell(c.key, r, isSold)}
        </View>
      ))}
    </View>
  );

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

        {open.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Holdings</Text>
            <Head />
            {open.map((r, i) => <Row key={r.symbol + i} r={r} i={i} isSold={false} />)}
            <View style={s.totalRow}>
              {table.map((c) => (
                <View key={c.key} style={{ width: c.pct, textAlign: c.num ? 'right' : 'left' }}>{totalCell(c.key)}</View>
              ))}
            </View>
          </>
        )}

        {sold.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Sold / Realised</Text>
            <Head />
            {sold.map((r, i) => <Row key={r.symbol + i} r={r} i={i} isSold />)}
            <View style={s.totalRow}>
              {table.map((c) => (
                <View key={c.key} style={{ width: c.pct, textAlign: c.num ? 'right' : 'left' }}>
                  {c.key === 'security' ? <Text style={s.bold}>Total Realised</Text>
                    : c.key === 'real' ? <Text style={[s.bold, { color: glColor(soldRealised) }]}>{gl(soldRealised)}</Text>
                    : <Text> </Text>}
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 6.5, color: MUTE, marginTop: 4 }}>Detailed short-term / long-term capital gains are in the separate Capital Gains Statement.</Text>
          </>
        )}

        {open.length === 0 && sold.length === 0 && (
          <Text style={{ fontSize: 9, color: MUTE, marginTop: 10 }}>No positions match the selected filter.</Text>
        )}

        <View style={s.footer} fixed>
          {on.has('mkt') && (
            <Text style={s.note}>Market Price is the last available stock price (previous trading day&apos;s close on weekends/holidays); the date under each price shows when it is from. Current value is basis that price and may differ from realisable value.</Text>
          )}
          <Text style={s.note}>
            Value at Cost is the purchase cost of the holding{showAvg ? '; the figure beneath it is the average purchase price per unit' : ''}. Figures are indicative and do not constitute investment advice.
          </Text>
          <Text style={s.pageNo} render={({ pageNumber, totalPages }) => `Ashesha Capital Advisory LLP  ·  Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
