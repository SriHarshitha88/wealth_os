import { signIn } from '@/app/actions/auth';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand-mark" style={{ padding: '0 0 18px' }}>
          <div className="brand-glyph">
            <svg viewBox="0 0 24 24" fill="none" width="19" height="19">
              <path d="M3 17l5-6 4 4 5-8 4 5" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="brand-name" style={{ color: 'var(--ink)' }}>Wealth&nbsp;OS</div>
        </div>

        <h1>Welcome back</h1>
        <p className="sub">Sign in to your workspace.</p>

        <form action={signIn}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required placeholder="you@gmail.com" autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required placeholder="••••••••" autoComplete="current-password" />
          </div>
          {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
          <button className="btn primary block" type="submit">Sign in</button>
        </form>
      </div>
    </div>
  );
}
