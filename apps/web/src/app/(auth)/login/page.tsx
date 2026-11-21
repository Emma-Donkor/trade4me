'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { loginSchema, type LoginInput } from '@ts/validation';
import { authApi } from '../../../lib/api/auth';
import { fromUnknownError } from '../../../lib/api/client';
import { useAuthStore } from '../../../lib/auth/store';

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (session) => {
      setSession(session);
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next?.startsWith('/') ? next : '/dashboard');
    },
  });

  const apiError = mutation.error ? fromUnknownError(mutation.error) : null;

  return (
    <section>
      <h1 className="mb-6 text-xl font-semibold">Sign in</h1>
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

        <div>
          <label htmlFor="password" className="mb-1 block text-sm text-slate-300">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            {...form.register('password')}
          />
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
          {mutation.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="mt-6 flex justify-between text-sm text-slate-400">
        <Link href="/register" className="hover:text-emerald-400">
          Create account
        </Link>
        <Link href="/forgot-password" className="hover:text-emerald-400">
          Forgot password?
        </Link>
      </div>
    </section>
  );
}
