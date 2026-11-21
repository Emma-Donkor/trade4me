import { MONOREPO_ROOT_PACKAGE } from '@ts/types';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-8 text-slate-100">
      <h1 className="text-3xl font-semibold tracking-tight">TradeSense AI</h1>
      <p className="text-sm text-slate-400">Workspace: {MONOREPO_ROOT_PACKAGE}</p>
      <div className="mt-4 flex gap-3 text-sm">
        <Link
          href="/login"
          className="rounded-lg bg-emerald-500 px-4 py-2 font-medium text-slate-950"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="rounded-lg border border-slate-700 px-4 py-2 font-medium text-slate-300"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}
