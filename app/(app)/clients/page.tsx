import { createClient } from '@/lib/supabase/server';
import ClientsTable from '@/components/ClientsTable';
import ImportPortfolioModal from '@/components/ImportPortfolioModal';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const supabase = await createClient();
  const [{ data: clients }, { data: vals }] = await Promise.all([
    supabase.from('clients').select('id, name, phone, tier').order('created_at', { ascending: false }),
    supabase.from('client_valuation').select('client_id, invested_value, current_value, unrealized_pl'),
  ]);

  const vmap = new Map((vals ?? []).map((v) => [v.client_id, v]));
  const rows = (clients ?? []).map((c) => {
    const v = vmap.get(c.id);
    const invested = Number(v?.invested_value ?? 0);
    const current = Number(v?.current_value ?? 0);
    const pl = Number(v?.unrealized_pl ?? 0);
    const plPct = invested ? (pl / invested) * 100 : 0;
    return { ...c, invested, current, pl, plPct };
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{rows.length} client{rows.length === 1 ? '' : 's'}</div>
          <h1>Clients</h1>
          <p>Click a client to open their portfolio, or download their report.</p>
        </div>
        <div className="head-tools">
          <ImportPortfolioModal />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <div className="empty">
            <p style={{ fontFamily: 'var(--serif)', fontSize: 18, marginBottom: 6 }}>No clients yet.</p>
            <p style={{ color: 'var(--ink-3)', margin: 0 }}>Use “New transaction” to add your first client and their first trade.</p>
          </div>
        </div>
      ) : (
        <ClientsTable rows={rows} />
      )}
    </>
  );
}
