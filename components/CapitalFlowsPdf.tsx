import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { FlowReport } from '@/lib/capital-flows';

const num = (n: number) => Math.abs(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gl = (n: number) => (n < 0 ? `(${num(n)})` : num(n));
const dt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

const BRAND = '#12294A', GOLD = '#B0863A', GAIN = '#137A52', LOSS = '#C4472F', INK = '#16211E', MUTE = '#5E6F68', LINE = '#D7DEDA', ZEBRA = '#F4F7F5', BAND = '#EAF1EE';

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 62, paddingHorizontal: 34, fontSize: 8.5, color: INK, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { width: 150, height: 76, objectFit: 'contain' },
  brand: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: BRAND },
  brandSub: { fontSize: 7, color: GOLD, marginTop: 2, letterSpacing: 1.6, fontFamily: 'Helvetica-Bold' },
  stmt: { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  asof: { fontSize: 8, color: MUTE, marginTop: 2, textAlign: 'right' },
  rule: { borderBottomWidth: 1.5, borderBottomColor: BRAND, marginTop: 8, marginBottom: 14 },
  clientName: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  clientMeta: { fontSize: 8.5, color: MUTE, marginTop: 2, marginBottom: 16 },
  sumRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  sumCard: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 9, backgroundColor: '#FBFCFB' },
  sumLabel: { fontSize: 6.5, color: MUTE, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  sumVal: { fontSize: 11.5, fontFamily: 'Helvetica-Bold' },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 6, marginTop: 6 },
  // reconciliation table
  recRow: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: LINE, paddingVertical: 6, paddingHorizontal: 6 },
  recTotal: { flexDirection: 'row', backgroundColor: BAND, paddingVertical: 7, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: BRAND },
  recLabel: { width: '62%' }, recVal: { width: '38%', textAlign: 'right' },
  recSub: { fontSize: 6.5, color: MUTE, marginTop: 1 },
  // flows ledger
  thead: { flexDirection: 'row', backgroundColor: BRAND, paddingVertical: 5, paddingHorizontal: 5 },
  th: { fontSize: 7, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: LINE, paddingVertical: 5, paddingHorizontal: 5 },
  rowAlt: { backgroundColor: ZEBRA },
  totalRow: { flexDirection: 'row', backgroundColor: BAND, paddingVertical: 6, paddingHorizontal: 5, borderTopWidth: 1, borderTopColor: BRAND },
  cDate: { width: '14%' }, cKind: { width: '12%' }, cLabel: { width: '42%' }, cIn: { width: '16%', textAlign: 'right' }, cOut: { width: '16%', textAlign: 'right' },
  bold: { fontFamily: 'Helvetica-Bold' },
  foot: { position: 'absolute', bottom: 30, left: 34, right: 34, borderTopWidth: 0.75, borderTopColor: LINE, paddingTop: 8, fontSize: 6.5, color: MUTE, lineHeight: 1.4 },
});

export type FlowsPdfProps = {
  client: { name: string; phone?: string | null; email?: string | null };
  report: FlowReport;
  generatedAt: string;
  priceAsOf: string | null;
  logo: string | null;
};

export default function CapitalFlowsPdf({ client, report: r, generatedAt, priceAsOf, logo }: FlowsPdfProps) {
  const glColor = (n: number) => (Math.abs(n) < 0.005 ? INK : n < 0 ? LOSS : GAIN);
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          {logo ? <Image src={logo} style={s.logo} /> : <View><Text style={s.brand}>Ashesha Capital</Text><Text style={s.brandSub}>ADVISORY LLP</Text></View>}
          <View>
            <Text style={s.stmt}>Capital Flow Report</Text>
            <Text style={s.asof}>Period {dt(r.from)} – {dt(r.to)}</Text>
            <Text style={s.asof}>Generated {generatedAt}</Text>
            {priceAsOf ? <Text style={s.asof}>Prices as of {priceAsOf}</Text> : null}
          </View>
        </View>
        <View style={s.rule} />

        <Text style={s.clientName}>{client.name}</Text>
        <Text style={s.clientMeta}>{[client.phone, client.email].filter(Boolean).join('  ·  ') || 'Client'}</Text>

        <View style={s.sumRow}>
          <View style={s.sumCard}><Text style={s.sumLabel}>Opening AUM (Rs)</Text><Text style={s.sumVal}>{num(r.openingAum)}</Text></View>
          <View style={s.sumCard}><Text style={s.sumLabel}>Net Flows (Rs)</Text><Text style={[s.sumVal, { color: glColor(r.netFlows) }]}>{gl(r.netFlows)}</Text></View>
          <View style={s.sumCard}><Text style={s.sumLabel}>MTM Gain / (Loss)</Text><Text style={[s.sumVal, { color: glColor(r.mtm) }]}>{gl(r.mtm)}</Text></View>
          <View style={s.sumCard}><Text style={s.sumLabel}>Closing AUM (Rs)</Text><Text style={s.sumVal}>{num(r.closingAum)}</Text></View>
        </View>

        <Text style={s.sectionTitle}>Reconciliation (Rs.)</Text>
        <View style={s.recRow}>
          <View style={s.recLabel}><Text>Opening AUM · {dt(r.from)}</Text>{r.openingAtCost ? <Text style={s.recSub}>at cost — historical market prices are not stored</Text> : null}</View>
          <Text style={s.recVal}>{num(r.openingAum)}</Text>
        </View>
        <View style={s.recRow}><Text style={s.recLabel}>Capital inflows (purchases + deposits)</Text><Text style={[s.recVal, { color: GAIN }]}>{num(r.inflows)}</Text></View>
        <View style={s.recRow}><Text style={s.recLabel}>Capital outflows (sale proceeds + withdrawals)</Text><Text style={[s.recVal, { color: LOSS }]}>({num(r.outflows)})</Text></View>
        <View style={s.recRow}><Text style={[s.recLabel, s.bold]}>Net flows (inflows less outflows)</Text><Text style={[s.recVal, s.bold, { color: glColor(r.netFlows) }]}>{gl(r.netFlows)}</Text></View>
        <View style={s.recRow}><Text style={s.recLabel}>Mark-to-market gains / (losses)†</Text><Text style={[s.recVal, { color: glColor(r.mtm) }]}>{gl(r.mtm)}</Text></View>
        <View style={s.recRow}><Text style={s.recLabel}>Fees & charges collected</Text><Text style={[s.recVal, { color: LOSS }]}>{r.fees ? `(${num(r.fees)})` : '-'}</Text></View>
        <View style={s.recTotal}>
          <View style={s.recLabel}><Text style={s.bold}>Closing AUM · {dt(r.to)}</Text>{r.closingAtCost ? <Text style={s.recSub}>at cost — period ends before today</Text> : <Text style={s.recSub}>at last available market prices</Text>}</View>
          <Text style={[s.recVal, s.bold]}>{num(r.closingAum)}</Text>
        </View>

        <Text style={s.sectionTitle}>Capital movements in the period</Text>
        <View style={s.thead} fixed>
          <Text style={[s.th, s.cDate]}>Date</Text>
          <Text style={[s.th, s.cKind]}>Type</Text>
          <Text style={[s.th, s.cLabel]}>Particulars</Text>
          <Text style={[s.th, s.cIn]}>Inflow (Rs)</Text>
          <Text style={[s.th, s.cOut]}>Outflow (Rs)</Text>
        </View>
        {r.events.length === 0 ? (
          <View style={s.row}><Text style={{ fontSize: 8, color: MUTE }}>No capital movements in this period.</Text></View>
        ) : r.events.map((e, i) => (
          <View style={[s.row, ...(i % 2 ? [s.rowAlt] : [])]} key={i} wrap={false}>
            <Text style={s.cDate}>{dt(e.date)}</Text>
            <Text style={[s.cKind, { color: e.kind === 'Inflow' ? GAIN : e.kind === 'Fee' ? GOLD : LOSS }]}>{e.kind}</Text>
            <Text style={s.cLabel}>{e.label}</Text>
            <Text style={s.cIn}>{e.inAmt != null ? num(e.inAmt) : '-'}</Text>
            <Text style={s.cOut}>{e.outAmt != null ? num(e.outAmt) : '-'}</Text>
          </View>
        ))}
        {r.events.length > 0 && (
          <View style={s.totalRow}>
            <Text style={[s.bold, s.cDate]}>Total</Text>
            <Text style={s.cKind}> </Text><Text style={s.cLabel}> </Text>
            <Text style={[s.bold, s.cIn]}>{num(r.inflows)}</Text>
            <Text style={[s.bold, s.cOut]}>{num(r.outflows + r.fees)}</Text>
          </View>
        )}

        <View style={s.foot} fixed>
          <Text>
            Closing AUM = Opening AUM + Net Flows + MTM Gains/(Losses) less Fees. † MTM is derived as the balancing figure of
            this identity; historical market prices are not stored, so past-dated AUM is stated at cost. Dividends, bonuses
            and splits are portfolio income / corporate actions, not client capital flows. Figures are indicative and do not
            constitute investment advice. Ashesha Capital Advisory LLP.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
