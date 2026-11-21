'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@ts/validation';
import { authApi } from '../../../lib/api/auth';

export default function ForgotPasswordPage() {
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });
  const mutation = useMutation({ mutationFn: authApi.forgotPassword });

  if (mutation.isSuccess) {
    return (
      <section aria-live="polite">
        <h1 className="mb-3 text-xl font-semibold">Reset link sent</h1>
        <p className="text-sm text-slate-300">{mutation.data.message}</p>
        <Link href="/login" className="mt-6 inline-block text-sm text-emerald-400 hover:underline">
          Back to sign in
        </Link>
      </section>
    );
  }

  return (
    <section>
      <h1 className="mb-2 text-xl font-semibold">Reset your password</h1>
      <p className="mb-6 text-sm text-slate-400">
        We will email a single-use link if the account exists.
      </p>
      <form className="space-y-4" onSubmit={form.handleSubmit((input) => mutation.mutate(input))}>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm text-slate-300">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            {...form.register('email')}
          />
          {form.formState.errors.email && (
            <p className="mt-1 text-xs text-rose-400">{form.formState.errors.email.message}</p>
          )}
        </div>

        {mutation.error && (
          <p role="alert" className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">
            Unable to request a reset link. Please try again.
          </p>
        )}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full rounded-lg bg-emerald-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
        >
          {mutation.isPending ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-400">
        <Link href="/login" className="text-emerald-400 hover:underline">
          Back to sign in
        </Link>
      </p>
    </section>
  );
}
