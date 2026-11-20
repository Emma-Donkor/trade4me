import { MONOREPO_ROOT_PACKAGE } from '@ts/types';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-8 text-slate-100">
      <h1 className="text-3xl font-semibold tracking-tight">TradeSense AI</h1>
      <p className="text-sm text-slate-400">Workspace: {MONOREPO_ROOT_PACKAGE}</p>
    </main>
  );
}
