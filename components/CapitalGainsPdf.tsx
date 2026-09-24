import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { layout } from '@/lib/report-columns';

const num = (n: number) => Math.abs(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gl = (n: number) => (n < 0 ? `(${num(n)})` : num(n));

const BRAND = '#12294A', GOLD = '#B0863A', GAIN = '#137A52', LOSS = '#C4472F', INK = '#16211E', MUTE = '#5E6F68', LINE = '#D7DEDA', ZEBRA = '#F4F7F5', BAND = '#EAF1EE';

export type CGRow = { symbol: string; buyDate: string; sellDate: string; qty: number; cost: number; proceeds: number; gain: number; holdingDays: number; longTerm: boolean };
export type CGTotals = { stGain: number; ltGain: number; stProceeds: number; ltProceeds: number; stCost: number; ltCost: number };
export type CGProps = {
  client: { name: string; phone?: string | null; email?: string | null };
  fy: string; rows: CGRow[]; totals: CGTotals; generatedAt: string; logo: string | null;
  cols: string[];          // selected column keys, in canonical order
};

type Col = ReturnType<typeof layout>[number];

function cgCell(key: string, r: CGRow) {
  switch (key) {
    case 'security': return r.symbol;
    case 'bought': return r.buyDate;
    case 'sold': return r.sellDate;
    case 'days': return String(r.holdingDays);
    case 'qty': return r.qty.toLocaleString('en-IN');
    case 'buyval': return num(r.cost);
    case 'sellval': return num(r.proceeds);
    case 'gain': return gl(r.gain);
    default: return ' ';
  }
}

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 56, paddingHorizontal: 34, fontSize: 8.5, color: INK, fontFamily: 'Helvetica' },
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
  sectionTitle: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', marginBottom: 5, marginTop: 8 },
  thead: { flexDirection: 'row', backgroundColor: BRAND, paddingVertical: 5, paddingHorizontal: 5 },
  th: { fontSize: 7, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: LINE, paddingVertical: 5, paddingHorizontal: 5 },
  rowAlt: { backgroundColor: ZEBRA },
  subtotal: { flexDirection: 'row', backgroundColor: BAND, paddingVertical: 6, paddingHorizontal: 5, borderTopWidth: 1, borderTopColor: BRAND, marginBottom: 6 },
  cSym: { width: '20%' }, cDt: { width: '13%' }, cNum: { width: '11%', textAlign: 'right' }, cVal: { width: '15%', textAlign: 'right' }, cGain: { width: '15%', textAlign: 'right' },
  foot: { position: 'absolute', bottom: 30, left: 34, right: 34, borderTopWidth: 0.75, borderTopColor: LINE, paddingTop: 8, fontSize: 6.5, color: MUTE, lineHeight: 1.4 },
});

function Section({ title, rows, gain, table }: { title: string; rows: CGRow[]; gain: number; table: Col[] }) {
  return (
    <>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.thead}>
        {table.map((c) => (
          <Text key={c.key} style={[s.th, { width: c.pct, textAlign: c.num ? 'right' : 'left' }]}>{c.label}</Text>
        ))}
      </View>
      {rows.length === 0 ? (
        <View style={s.row}><Text style={{ fontSize: 8, color: MUTE }}>None in this period.</Text></View>
      ) : rows.map((r, i) => (
        <View style={[s.row, ...(i % 2 ? [s.rowAlt] : [])]} key={i} wrap={false}>
          {table.map((c) => (
            <Text key={c.key}
                  style={{ width: c.pct, textAlign: c.num ? 'right' : 'left',
                           ...(c.key === 'gain' ? { color: r.gain >= 0 ? GAIN : LOSS } : {}) }}>
              {cgCell(c.key, r)}
            </Text>
          ))}
        </View>
      ))}
      <View style={s.subtotal}>
        <Text style={[{ width: '70%', fontFamily: 'Helvetica-Bold' }]}>{title} — total gain / (loss)</Text>
        <Text style={[s.cGain, { fontFamily: 'Helvetica-Bold', width: '30%', color: gain >= 0 ? GAIN : LOSS }]}>{gl(gain)}</Text>
      </View>
    </>
  );
}

export default function CapitalGainsPdf({ client, fy, rows, totals, generatedAt, logo, cols }: CGProps) {
  const table = layout('gains', new Set(cols));
  const shortRows = rows.filter((r) => !r.longTerm);
  const longRows = rows.filter((r) => r.longTerm);
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          {logo ? <Image src={logo} style={s.logo} /> : <View><Text style={s.brand}>Ashesha Capital</Text><Text style={s.brandSub}>ADVISORY LLP</Text></View>}
          <View><Text style={s.stmt}>Capital Gains Statement</Text><Text style={s.asof}>FY {fy}  ·  as of {generatedAt}</Text></View>
        </View>
        <View style={s.rule} />

        <Text style={s.clientName}>{client.name}</Text>
        <Text style={s.clientMeta}>{[client.phone, client.email].filter(Boolean).join('  ·  ') || 'Client'}</Text>

        <View style={s.sumRow}>
          <View style={s.sumCard}><Text style={s.sumLabel}>Short-term gain / (loss)</Text><Text style={[s.sumVal, { color: totals.stGain >= 0 ? GAIN : LOSS }]}>{gl(totals.stGain)}</Text></View>
          <View style={s.sumCard}><Text style={s.sumLabel}>Long-term gain / (loss)</Text><Text style={[s.sumVal, { color: totals.ltGain >= 0 ? GAIN : LOSS }]}>{gl(totals.ltGain)}</Text></View>
          <View style={s.sumCard}><Text style={s.sumLabel}>Total realised</Text><Text style={s.sumVal}>{gl(totals.stGain + totals.ltGain)}</Text></View>
        </View>

        {shortRows.length > 0 || rows.length === 0 ? <Section title="Short-term (holding ≤ 365 days)" rows={shortRows} gain={totals.stGain} table={table} /> : null}
        {longRows.length > 0 || rows.length === 0 ? <Section title="Long-term (holding > 365 days)" rows={longRows} gain={totals.ltGain} table={table} /> : null}

        <View style={s.foot}>
          <Text>Realised capital gains from FIFO-matched lots for FY {fy} (1 Apr – 31 Mar). Short-term ≤ 365 days, long-term &gt; 365 days (listed equity). Grandfathering under Sec. 112A is not applied — this book has no holdings acquired on or before 31 Jan 2018. Figures are indicative and do not constitute tax advice.</Text>
        </View>
      </Page>
    </Document>
  );
}
