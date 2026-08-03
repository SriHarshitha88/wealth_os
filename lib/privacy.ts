import { cookies } from 'next/headers';

export { PRIVACY_COOKIE, maskName, maskIf } from './mask';

// Server-side: is Privacy Mode on? (cookie set by the top-bar toggle)
export async function privacyOn(): Promise<boolean> {
  const c = await cookies();
  return c.get('wos_privacy')?.value === '1';
}
