import type { ReactNode } from 'react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl">
        <Link href="/" className="mb-8 block text-center text-2xl font-semibold tracking-tight">
          TradeSense <span className="text-emerald-400">AI</span>
        </Link>
        {children}
      </div>
    </main>
  );
}
