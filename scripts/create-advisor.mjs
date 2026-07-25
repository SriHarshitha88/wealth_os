// Creates (or resets the password of) your advisor login, bypassing the dashboard.
// Usage (PowerShell):
//   $env:ADVISOR_EMAIL="you@email.com"; $env:ADVISOR_PASSWORD="YourPass123"; npm run create:advisor

import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
if (!globalThis.WebSocket) globalThis.WebSocket = ws;

const email = process.env.ADVISOR_EMAIL;
const password = process.env.ADVISOR_PASSWORD;
if (!email || !password) {
  console.error('Set ADVISOR_EMAIL and ADVISOR_PASSWORD first, e.g. (PowerShell):');
  console.error('  $env:ADVISOR_EMAIL="you@email.com"; $env:ADVISOR_PASSWORD="YourPass123"; npm run create:advisor');
  process.exit(1);
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Try to create a confirmed user.
const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (!error) {
  console.log(`✓ Created advisor ${email}. Sign in with that email + password.`);
  process.exit(0);
}

// Already exists → find them and reset the password.
console.log('User already exists — resetting the password…');
let page = 1, found = null;
while (!found) {
  const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (!data || data.users.length === 0) break;
  found = data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
  if (data.users.length < 200) break;
  page++;
}
if (!found) { console.error('Could not create or find the user:', error.message); process.exit(1); }

const { error: upErr } = await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
if (upErr) { console.error('Password reset failed:', upErr.message); process.exit(1); }
console.log(`✓ Password reset for ${email}. Sign in with that email + password.`);
