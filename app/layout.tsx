import './globals.css';
import type { Metadata } from 'next';
import localFont from 'next/font/local';

// Self-hosted rather than next/font/google: the Google loader fetches font CSS at
// BUILD time, so every deploy depended on a live call to fonts.googleapis.com — and
// a failed fetch there breaks the build with an opaque next/font error. These are the
// same variable fonts (latin subset), both SIL OFL licensed, so hosting them is fine.
const display = localFont({
  src: [
    { path: './fonts/fraunces-latin.woff2', weight: '100 900', style: 'normal' },
    { path: './fonts/fraunces-italic-latin.woff2', weight: '100 900', style: 'italic' },
  ],
  variable: '--font-display',
  display: 'swap',
});
const sans = localFont({
  src: [{ path: './fonts/hanken-latin.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Wealth OS — Portfolio Management CRM',
  description: 'Wealth-management CRM for investment advisors.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
