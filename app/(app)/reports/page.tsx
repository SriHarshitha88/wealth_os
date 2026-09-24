import { createClient } from '@/lib/supabase/server';
import { todayIST } from '@/lib/capital-flows';
import ReportsConsole from '@/components/ReportsConsole';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase.from('clients').select('id, name').order('name');

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Document centre</div>
          <h1>Reports</h1>
          <p>Build and export client-ready statements across Wealth&nbsp;OS &mdash; as PDF or Excel.</p>
        </div>
      </div>

      <ReportsConsole clients={clients ?? []} today={todayIST()} />
    </>
  );
}
