'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { credentialsSchema } from '@traceai/shared';
import type { z } from 'zod';
import { Activity, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
export function AuthForm({
  register = false,
  returnTo = '/projects',
}: {
  register?: boolean;
  returnTo?: string;
}) {
  const router = useRouter();
  const cache = useQueryClient();
  const [error, setError] = useState('');
  const form = useForm<
    z.input<typeof credentialsSchema>,
    unknown,
    z.output<typeof credentialsSchema>
  >({ resolver: zodResolver(credentialsSchema), mode: 'onBlur' });
  async function submit(values: z.output<typeof credentialsSchema>) {
    setError('');
    try {
      await api(`auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      cache.clear();
      router.push(returnTo);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not sign in. Try again.');
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Link href="/demo" className="brand">
          <Activity size={25} />
          TraceAI<span className="brand-dot">.</span>
        </Link>
        <div>
          <p className="eyebrow">KNOW WHAT YOUR AI IS DOING</p>
          <h2>
            Every operation.
            <br />A clearer picture.
          </h2>
          <p>
            Latency, usage, failures. The signals you need, without collecting the content you
            don’t.
          </p>
          <Link href="/demo">
            Explore the read-only demo <ArrowRight size={16} />
          </Link>
        </div>
        <span className="mono small">TypeScript SDK / Bun / Cloudflare</span>
      </section>
      <section className="auth-form-section">
        <div className="auth-form">
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>{register ? 'Create an account' : 'Welcome back'}</h1>
          <p className="muted">
            {register
              ? 'Start observing your application. No provider key required.'
              : 'Sign in to manage projects and ingestion keys.'}
          </p>
          <form onSubmit={form.handleSubmit(submit)}>
            <label htmlFor="email">
              Email
              <input
                id="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                {...form.register('email')}
                aria-invalid={!!form.formState.errors.email}
                aria-describedby="email-error"
              />
            </label>
            <span id="email-error" className="field-error">
              {form.formState.errors.email?.message}
            </span>
            <label htmlFor="password">
              Password
              <input
                id="password"
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                maxLength={128}
                {...form.register('password')}
                aria-invalid={!!form.formState.errors.password}
                aria-describedby="password-error password-help"
              />
            </label>
            <span id="password-error" className="field-error">
              {form.formState.errors.password?.message}
            </span>
            <p id="password-help" className="muted small">
              At least 12 characters. Use a unique password.
            </p>
            {error && (
              <p role="alert" className="field-error">
                {error}
              </p>
            )}
            <button className="primary" disabled={form.formState.isSubmitting} type="submit">
              {form.formState.isSubmitting
                ? 'Please wait…'
                : register
                  ? 'Create account'
                  : 'Sign in'}
              <ArrowRight size={16} />
            </button>
          </form>
          <p className="muted small">
            {register ? 'Already have an account?' : 'New to TraceAI?'}{' '}
            <Link href={register ? '/login' : '/register'}>
              {register ? 'Sign in' : 'Create account'}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
