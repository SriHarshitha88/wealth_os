'use client';

import { useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { signIn, requestPasswordReset } from '@/app/actions/auth';

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 7.5 8.5 5.6 8.5-5.6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="16" height="11" rx="2.5" />
      <path d="M8 10V7.2a4 4 0 0 1 8 0V10" />
    </svg>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.2 12S6 5.4 12 5.4 21.8 12 21.8 12 18 18.6 12 18.6 2.2 12 2.2 12Z" />
      <circle cx="12" cy="12" r="3.1" />
      {off && <path d="m3.4 3.4 17.2 17.2" />}
    </svg>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="signin-submit" type="submit" disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}

export default function LoginForm({ rememberedEmail }: { rememberedEmail: string }) {
  const [show, setShow] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [resetting, startReset] = useTransition();

  // Deliberately NOT a submit button: a second submit inside the form would be
  // what Enter triggers from the email/password fields, which would fire a
  // password reset instead of signing in.
  function forgotPassword() {
    const data = new FormData(formRef.current!);
    startReset(() => { void requestPasswordReset(data); });
  }

  return (
    <form action={signIn} ref={formRef} className="signin-form">
      <div className="signin-field">
        <label htmlFor="email">Email address</label>
        <div className="signin-input">
          <span className="signin-lead"><MailIcon /></span>
          <input
            id="email" name="email" type="email" required placeholder="you@gmail.com"
            autoComplete="email" defaultValue={rememberedEmail} autoFocus={!rememberedEmail}
          />
        </div>
      </div>

      <div className="signin-field">
        <label htmlFor="password">Password</label>
        <div className="signin-input">
          <span className="signin-lead"><LockIcon /></span>
          <input
            id="password" name="password" type={show ? 'text' : 'password'} required
            placeholder="••••••••" autoComplete="current-password" autoFocus={!!rememberedEmail}
          />
          <button
            type="button" className="signin-peek" onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
          >
            <EyeIcon off={!show} />
          </button>
        </div>
      </div>

      <div className="signin-row">
        <label className="signin-check">
          <input type="checkbox" name="remember" defaultChecked={!!rememberedEmail} />
          <span>Remember this device</span>
        </label>
        <button className="signin-link" type="button" onClick={forgotPassword} disabled={resetting}>
          {resetting ? 'Sending reset link…' : 'Forgot password?'}
        </button>
      </div>

      <SubmitButton />
    </form>
  );
}
