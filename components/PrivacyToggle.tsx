'use client';

import { useRouter } from 'next/navigation';
import { PRIVACY_COOKIE } from '@/lib/mask';

export default function PrivacyToggle({ on }: { on: boolean }) {
  const router = useRouter();
  function toggle() {
    const next = on ? '' : '1';
    document.cookie = `${PRIVACY_COOKIE}=${next}; path=/; max-age=${next ? 60 * 60 * 24 * 365 : 0}`;
    router.refresh();
  }
  return (
    <button className={'btn' + (on ? ' primary' : '')} onClick={toggle} aria-pressed={on}
      aria-label={on ? 'Privacy on — client names masked. Click to show names.' : 'Privacy mode — mask client names for screen-sharing'}
      title={on ? 'Privacy on — client names masked' : 'Privacy mode — mask client names for screen-sharing'}
      style={{ padding: '9px 11px' }}>
      {on ? (
        <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M3 3l18 18M10.6 10.7a2 2 0 002.8 2.8M9.4 5.2A9.5 9.5 0 0112 5c5 0 9 4.5 9.6 6.2.1.3.1.6 0 .9a13 13 0 01-2.4 3.3M6.2 6.7A13 13 0 002.4 11a1 1 0 000 .9C3 13.5 7 18 12 18c1 0 2-.2 2.9-.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M2.4 11.6C3 9.9 7 5.4 12 5.4s9 4.5 9.6 6.2c.1.3.1.6 0 .9C21 14.1 17 18.6 12 18.6S3 14.1 2.4 12.5a1 1 0 010-.9z" stroke="currentColor" strokeWidth="1.7" /><circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" /></svg>
      )}
    </button>
  );
}
