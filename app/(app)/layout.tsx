import { createClient } from '@/lib/supabase/server';
import Sidebar from '@/components/Sidebar';
import NewTransactionModal from '@/components/NewTransactionModal';
import TopSearch from '@/components/TopSearch';
import PrivacyToggle from '@/components/PrivacyToggle';
import { privacyOn } from '@/lib/privacy';
import { signOut } from '@/app/actions/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let name = 'Advisor';
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();
    name = profile?.full_name || user.email?.split('@')[0] || 'Advisor';
  }
  const privacy = await privacyOn();

  return (
    <div className="app">
      <Sidebar name={name} />
      <div className="stage">
        <div className="topbar">
          <TopSearch privacy={privacy} />
          <div className="top-actions">
            <PrivacyToggle on={privacy} />
            <NewTransactionModal />
            <form action={signOut}>
              <button className="btn" type="submit">Sign out</button>
            </form>
          </div>
        </div>
        <main>{children}</main>
      </div>
    </div>
  );
}
