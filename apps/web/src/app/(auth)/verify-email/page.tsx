'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { authApi } from '../../../lib/api/auth';
import { fromUnknownError } from '../../../lib/api/client';

export default function VerifyEmailPage() {
  const [token, setToken] = useState<string | null>(null);
  const started = useRef(false);
  const mutation = useMutation({ mutationFn: authApi.verifyEmail });
  const { mutate } = mutation;

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('token');
    setToken(value);
    if (value && !started.current) {
      started.current = true;
      mutate(value);
    }
  }, [mutate]);

  const apiError = mutation.error ? fromUnknownError(mutation.error) : null;

  if (mutation.isSuccess) {
    return (
      <section aria-live="polite">
        <h1 className="mb-3 text-xl font-semibold">Email verified</h1>
        <p className="text-sm text-slate-300">{mutation.data.message}</p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950"
        >
          Continue to sign in
        </Link>
      </section>
    );
  }

  return (
    <section>
      <h1 className="mb-4 text-xl font-semibold">Verifying email…</h1>
      {!token && (
        <p role="alert" className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">
          This verification link is missing its token.
        </p>
      )}
      {apiError && (
        <p role="alert" className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">
          {apiError.message} <span className="text-rose-500">({apiError.code})</span>
        </p>
      )}
      {token && !apiError && <p className="text-sm text-slate-400">Please wait…</p>}
    </section>
  );
}
