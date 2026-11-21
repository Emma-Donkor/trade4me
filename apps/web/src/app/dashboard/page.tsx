'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '../../components/auth/protected-route';
import { authApi } from '../../lib/api/auth';
import { useAuthStore } from '../../lib/auth/store';
import { useSession } from '../../lib/auth/use-session';

function DashboardContent() {
  const router = useRouter();
  const { user } = useSession();
  const clear = useAuthStore((state) => state.clear);
  const mutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      clear();
      router.replace('/login');
    },
  });

  return (
    <main className="min-h-screen bg-slate-950 p-10 text-slate-100">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-60"
          >
            {mutation.isPending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
        <p data-testid="signed-in-as">Signed in as {user?.email}</p>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
          Your authenticated workspace is ready. Trading modules arrive in later phases.
        </div>
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
