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
        <div className="auth-hero">
          <img src="/ashesha-wordmark.png" alt="Ashesha Capital Advisory LLP" />
        </div>

        <h1>Welcome back</h1>
        <p className="sub">Sign in to your Wealth&nbsp;OS workspace.</p>

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
