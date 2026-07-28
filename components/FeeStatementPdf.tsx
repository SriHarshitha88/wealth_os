import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';

const num = (n: number) =>
  Math.abs(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctf = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';

const BRAND = '#12294A', GOLD = '#B0863A', GAIN = '#137A52', INK = '#16211E', MUTE = '#5E6F68', LINE = '#D7DEDA', ZEBRA = '#F4F7F5', BAND = '#EAF1EE';

export type FeeLadderRow = {
  milestonePct: number; rate: number; targetValue: number; fee: number;
  status: 'Billed' | 'Due' | 'Upcoming'; date: string | null;
};
export type FeeStatementProps = {
  client: { name: string; phone?: string | null; email?: string | null };
  capital: number; current: number; gainPct: number;
  ladder: FeeLadderRow[];
  totals: { collected: number; dueNow: number };
  generatedAt: string; logo: string | null;
};

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 60, paddingHorizontal: 34, fontSize: 9, color: INK, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
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
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  thead: { flexDirection: 'row', backgroundColor: BRAND, paddingVertical: 6, paddingHorizontal: 6 },
  th: { fontSize: 7.5, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: LINE, paddingVertical: 6, paddingHorizontal: 6 },
  rowAlt: { backgroundColor: ZEBRA },
  totalRow: { flexDirection: 'row', backgroundColor: BAND, paddingVertical: 7, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: BRAND },
  cMile: { width: '24%' }, cRate: { width: '14%', textAlign: 'right' }, cTarget: { width: '24%', textAlign: 'right' },
  cFee: { width: '20%', textAlign: 'right' }, cStat: { width: '18%', textAlign: 'right' },
  foot: { position: 'absolute', bottom: 30, left: 34, right: 34, borderTopWidth: 0.75, borderTopColor: LINE, paddingTop: 8, fontSize: 7, color: MUTE, lineHeight: 1.4 },
});

export default function FeeStatementPdf({ client, capital, current, gainPct, ladder, totals, generatedAt, logo }: FeeStatementProps) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          {logo ? <Image src={logo} style={s.logo} /> : <View><Text style={s.brand}>Ashesha</Text><Text style={s.brandSub}>WEALTH ADVISORY</Text></View>}
          <View><Text style={s.stmt}>Performance Fee Statement</Text><Text style={s.asof}>As of {generatedAt}</Text></View>
        </View>
        <View style={s.rule} />

        <Text style={s.clientName}>{client.name}</Text>
        <Text style={s.clientMeta}>
          {[client.phone, client.email].filter(Boolean).join('  ·  ') || 'Client'}
        </Text>

        <View style={s.sumRow}>
          <View style={s.sumCard}><Text style={s.sumLabel}>Capital</Text><Text style={s.sumVal}>{num(capital)}</Text></View>
          <View style={s.sumCard}><Text style={s.sumLabel}>Current value</Text><Text style={[s.sumVal, { color: GAIN }]}>{num(current)}</Text></View>
          <View style={s.sumCard}><Text style={s.sumLabel}>Appreciation</Text><Text style={[s.sumVal, { color: GAIN }]}>{pctf(gainPct)}</Text></View>
          <View style={s.sumCard}><Text style={s.sumLabel}>Fees collected</Text><Text style={s.sumVal}>{num(totals.collected)}</Text></View>
        </View>

        <Text style={s.sectionTitle}>Fee schedule &amp; milestones (Rs.)</Text>
        <View style={s.thead}>
          <Text style={[s.th, s.cMile]}>Milestone</Text>
          <Text style={[s.th, s.cRate]}>Rate</Text>
          <Text style={[s.th, s.cTarget]}>Target value</Text>
          <Text style={[s.th, s.cFee]}>Fee</Text>
          <Text style={[s.th, s.cStat]}>Status</Text>
        </View>
        {ladder.map((r, i) => (
          <View key={i} style={[s.row, ...(i % 2 ? [s.rowAlt] : [])]}>
            <Text style={s.cMile}>+{r.milestonePct}% appreciation</Text>
            <Text style={s.cRate}>{r.rate}%</Text>
            <Text style={s.cTarget}>{num(r.targetValue)}</Text>
            <Text style={s.cFee}>{num(r.fee)}</Text>
            <Text style={[s.cStat, { color: r.status === 'Billed' ? GAIN : r.status === 'Due' ? GOLD : MUTE }]}>
              {r.status === 'Billed' && r.date ? `Billed ${r.date}` : r.status}
            </Text>
          </View>
        ))}
        <View style={s.totalRow}>
          <Text style={[{ width: '58%', fontFamily: 'Helvetica-Bold' }]}>Total collected to date</Text>
          <Text style={[s.cFee, { fontFamily: 'Helvetica-Bold', width: '24%' }]}>{num(totals.collected)}</Text>
          <Text style={[s.cStat]}> </Text>
        </View>

        <Text style={s.foot}>
          Performance fee is charged once on each 20% band of appreciation over invested capital, at rising slab rates
          (5% / 10% / 12.5% / 15% / 25%), then 25% flat above +100%. Amounts in Indian Rupees. This statement is
          generated from recorded transactions and collected fees; please verify against your records.
        </Text>
      </Page>
    </Document>
  );
}
