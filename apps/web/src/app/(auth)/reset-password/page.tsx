'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { resetPasswordSchema, type ResetPasswordInput } from '@ts/validation';
import { authApi } from '../../../lib/api/auth';
import { fromUnknownError } from '../../../lib/api/client';

export default function ResetPasswordPage() {
  const [hasToken, setHasToken] = useState(false);
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token: '', password: '' },
  });
  const mutation = useMutation({ mutationFn: authApi.resetPassword });
  const apiError = mutation.error ? fromUnknownError(mutation.error) : null;

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (token) form.setValue('token', token);
    setHasToken(Boolean(token));
  }, [form]);

  if (mutation.isSuccess) {
    return (
      <section aria-live="polite">
        <h1 className="mb-3 text-xl font-semibold">Password updated</h1>
        <p className="text-sm text-slate-300">{mutation.data.message}</p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950"
        >
          Sign in
        </Link>
      </section>
    );
  }

  return (
    <section>
      <h1 className="mb-6 text-xl font-semibold">Choose a new password</h1>
      <form className="space-y-4" onSubmit={form.handleSubmit((input) => mutation.mutate(input))}>
        <input type="hidden" {...form.register('token')} />
        <div>
          <label htmlFor="password" className="mb-1 block text-sm text-slate-300">
            New password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            {...form.register('password')}
          />
          {form.formState.errors.password && (
            <p className="mt-1 text-xs text-rose-400">{form.formState.errors.password.message}</p>
          )}
        </div>

        {!hasToken && (
          <p role="alert" className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">
            This reset link is missing its token. Request a new link.
          </p>
        )}
        {apiError && (
          <p role="alert" className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">
            {apiError.message} <span className="text-rose-500">({apiError.code})</span>
          </p>
        )}

        <button
          type="submit"
          disabled={mutation.isPending || !hasToken}
          className="w-full rounded-lg bg-emerald-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
        >
          {mutation.isPending ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </section>
  );
}
