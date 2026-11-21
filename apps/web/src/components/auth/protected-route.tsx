'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSession } from '../../lib/auth/use-session';

/** Client-side shell guard; the API remains the authoritative RBAC boundary. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  if (status !== 'authenticated') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        {status === 'loading' ? 'Restoring session…' : 'Redirecting to sign in…'}
      </main>
    );
  }

  return <>{children}</>;
}
