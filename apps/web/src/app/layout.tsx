import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'BichoCoin',
  description: 'A football gaming and digital-economy experience.',
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default async function RootLayout({ children }: RootLayoutProps) {
  // A per-request CSP nonce cannot be attached to statically generated markup.
  await connection();

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
