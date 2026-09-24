'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

// "Remember this device" keeps the email address on this browser so the next
// sign-in only needs the password. It never stores the password itself.
const REMEMBER = 'wos_email';
const REMEMBER_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const remember = formData.get('remember') != null;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message));
  }

  const jar = await cookies();
  if (remember) {
    jar.set(REMEMBER, email, { maxAge: REMEMBER_MAX_AGE, sameSite: 'lax', path: '/' });
  } else {
    jar.delete(REMEMBER);
  }

  redirect('/dashboard');
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) {
    redirect('/login?error=' + encodeURIComponent('Enter your email address first, then choose Forgot password.'));
  }

  const h = await headers();
  const origin = h.get('origin') ?? `https://${h.get('host')}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/login` });

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message));
  }
  redirect('/login?sent=1');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
