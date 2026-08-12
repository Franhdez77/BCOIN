'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';

import { authApi } from '../auth-api';
import { getSafeRedirect, navigateTo } from '../navigation';
import { useSubmission } from '../use-submission';
import { AuthCard, FormMessage, SubmitButton } from './auth-ui';

interface LoginFormProps {
  initialNext?: string;
  navigate?: (path: string) => void;
  resetCompleted?: boolean;
}

export function LoginForm({
  initialNext,
  navigate = navigateTo,
  resetCompleted = false,
}: LoginFormProps) {
  const submission = useSubmission();

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const identifier = String(form.get('identifier') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const succeeded = await submission.run(() => authApi.login({ identifier, password }));

    if (succeeded) {
      navigate(getSafeRedirect(initialNext ?? null));
    }
  }

  return (
    <AuthCard description="Use your verified email or username to continue." title="Sign in">
      {resetCompleted ? (
        <FormMessage message="Your password was reset. You can now sign in." tone="success" />
      ) : null}
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field-label" htmlFor="identifier">
          Email or username
        </label>
        <input
          autoComplete="username"
          className="text-input"
          id="identifier"
          name="identifier"
          required
        />
        <label className="field-label" htmlFor="password">
          Password
        </label>
        <input
          autoComplete="current-password"
          className="text-input"
          id="password"
          name="password"
          required
          type="password"
        />
        <FormMessage message={submission.message} requestId={submission.requestId} />
        <SubmitButton pending={submission.pending} pendingLabel="Signing in...">
          Sign in
        </SubmitButton>
      </form>
      <div className="auth-links">
        <Link href="/forgot-password">Forgot password?</Link>
        <Link href="/register">Create account</Link>
      </div>
    </AuthCard>
  );
}
