'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/clients', label: 'Clients' },
  { href: '/portfolios', label: 'Portfolios' },
  { href: '/fees', label: 'Fee Engine' },
  { href: '/copilot', label: 'AI Copilot' },
];
const SOON: string[] = [];

export default function Sidebar({ name }: { name: string }) {
  const pathname = usePathname();
  return (
    <aside className="rail">
      <div className="brand-mark">
        <div className="brand-glyph">
          <svg viewBox="0 0 24 24" fill="none" width="19" height="19">
            <path d="M3 17l5-6 4 4 5-8 4 5" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="brand-name">Wealth&nbsp;OS</div>
      </div>

      <div className="nav-label">Cockpit</div>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={'nav-item' + (pathname === n.href ? ' active' : '')}>
          {n.label}
        </Link>
      ))}

      {SOON.length > 0 && <div className="nav-label">Coming soon</div>}
      {SOON.map((s) => (
        <button key={s} className="nav-item" style={{ opacity: 0.55, cursor: 'default' }} disabled>
          {s}
        </button>
      ))}

      <div className="rail-foot">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="avatar">{name.slice(0, 2).toUpperCase()}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#EAF4F1' }}>{name}</div>
            <div style={{ fontSize: 11, color: '#7FB3AB' }}>Advisor</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
