'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { registerSchema, type RegisterInput } from '@ts/validation';
import { authApi } from '../../../lib/api/auth';
import { fromUnknownError } from '../../../lib/api/client';

export default function RegisterPage() {
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });
  const mutation = useMutation({ mutationFn: authApi.register });
  const apiError = mutation.error ? fromUnknownError(mutation.error) : null;

  if (mutation.isSuccess) {
    return (
      <section aria-live="polite">
        <h1 className="mb-3 text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-slate-300">{mutation.data.message}</p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950"
        >
          Go to sign in
        </Link>
      </section>
    );
  }

  return (
    <section>
      <h1 className="mb-6 text-xl font-semibold">Create account</h1>
      <form className="space-y-4" onSubmit={form.handleSubmit((input) => mutation.mutate(input))}>
        <div>
          <label htmlFor="name" className="mb-1 block text-sm text-slate-300">
            Name <span className="text-slate-500">(optional)</span>
          </label>
          <input
            id="name"
            autoComplete="name"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            {...form.register('name')}
          />
          {form.formState.errors.name && (
            <p className="mt-1 text-xs text-rose-400">{form.formState.errors.name.message}</p>
          )}
        </div>

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

        <div>
          <label htmlFor="password" className="mb-1 block text-sm text-slate-300">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            {...form.register('password')}
          />
          <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
          {form.formState.errors.password && (
            <p className="mt-1 text-xs text-rose-400">{form.formState.errors.password.message}</p>
          )}
        </div>

        {apiError && (
          <p role="alert" className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">
            {apiError.message} <span className="text-rose-500">({apiError.code})</span>
          </p>
        )}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full rounded-lg bg-emerald-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
        >
          {mutation.isPending ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        Already registered?{' '}
        <Link href="/login" className="text-emerald-400 hover:underline">
          Sign in
        </Link>
      </p>
    </section>
  );
}
