import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Wealth OS — Portfolio Management CRM',
  description: 'Wealth-management CRM for investment advisors.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
