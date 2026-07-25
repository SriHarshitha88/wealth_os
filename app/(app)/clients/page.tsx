import { createClient } from '@/lib/supabase/server';
import ClientsTable from '@/components/ClientsTable';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, phone, tier')
    .order('created_at', { ascending: false });

  const rows = clients ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{rows.length} client{rows.length === 1 ? '' : 's'}</div>
          <h1>Clients</h1>
          <p>Click a client to open their portfolio, or download their report.</p>
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
