import './globals.css';
import type { Metadata } from 'next';
import { Fraunces, Hanken_Grotesk } from 'next/font/google';

// Display serif (headings, hero figures) + a clean grotesque for the UI/data.
// Self-hosted at build by next/font — no runtime CDN, works offline & CSP-safe.
// Only the weights the stylesheet actually asks for: the serif is used at 400
// and 600 and nowhere else, so shipping 500/700 was four unused font files.
const display = Fraunces({
  subsets: ['latin'],
  weight: ['400', '600'],
  style: ['normal', 'italic'],   // italic is used for the sign-in tagline
  variable: '--font-display',
  display: 'swap',
});
const sans = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
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
