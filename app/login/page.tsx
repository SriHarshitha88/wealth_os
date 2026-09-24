import { cookies } from 'next/headers';
import LoginArtwork from '@/components/LoginArtwork';
import LoginForm from '@/components/LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  const rememberedEmail = (await cookies()).get('wos_email')?.value ?? '';

  return (
    <div className="signin">
      <aside className="signin-brand">
        <LoginArtwork />
        <div className="signin-brand-inner">
          <img className="signin-lockup" src="/ashesha-wordmark.png" alt="Ashesha Capital Advisory LLP" />

          <div>
            <h2 className="signin-tagline">
              Wealth
              <br />
              with <em>Purpose</em>
            </h2>
            <p className="signin-pillars">Insights <span>|</span> Strategy <span>|</span> Lasting value</p>
            <p className="signin-copy">
              A partner in your financial journey,
              <br />
              today and for what&rsquo;s next.
            </p>
          </div>

          <p className="signin-motto"><span /> Discipline drives a brighter tomorrow</p>
        </div>
      </aside>

      <main className="signin-panel">
        <div className="signin-box">
          <h1>Welcome back</h1>
          <p className="signin-sub">Sign in to your Wealth&nbsp;OS workspace.</p>

          {error && <p className="signin-alert error">{error}</p>}
          {sent && <p className="signin-alert ok">Check your inbox — we&rsquo;ve sent a password reset link.</p>}

          <LoginForm rememberedEmail={rememberedEmail} />
        </div>

        <p className="signin-foot">People <span>|</span> Plans <span>|</span> Prosperity</p>

        <svg className="signin-bars" viewBox="0 0 220 160" aria-hidden="true">
          <rect x="4" y="112" width="30" height="48" rx="3" />
          <rect x="44" y="88" width="30" height="72" rx="3" />
          <rect x="84" y="60" width="30" height="100" rx="3" />
          <rect x="124" y="30" width="30" height="130" rx="3" />
          <rect x="164" y="6" width="30" height="154" rx="3" />
        </svg>
      </main>
    </div>
  );
}
