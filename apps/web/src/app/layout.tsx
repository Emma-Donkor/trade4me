import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { QueryProvider } from '../lib/api/query-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'TradeSense AI',
  description: 'Explainable forex market intelligence and paper trading',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
