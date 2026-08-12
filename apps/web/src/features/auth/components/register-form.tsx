'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';

import { authApi } from '../auth-api';
import { navigateTo } from '../navigation';
import { useSubmission } from '../use-submission';
import { AuthCard, FormMessage, SubmitButton } from './auth-ui';

interface RegisterFormProps {
  navigate?: (path: string) => void;
}

export function RegisterForm({ navigate = navigateTo }: RegisterFormProps) {
  const submission = useSubmission();

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const username = String(form.get('username') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const passwordConfirmation = String(form.get('passwordConfirmation') ?? '');

    if (password !== passwordConfirmation) {
      submission.setError('The passwords do not match.');
      return;
    }

    const succeeded = await submission.run(() => authApi.register({ email, password, username }));
    if (succeeded) {
      navigate('/verify-email');
    }
  }

  return (
    <AuthCard
      description="Create your account. You will verify your email before signing in."
      title="Create account"
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field-label" htmlFor="email">
          Email
        </label>
        <input
          autoComplete="email"
          className="text-input"
          id="email"
          name="email"
          required
          type="email"
        />
        <label className="field-label" htmlFor="username">
          Username
        </label>
        <input
          autoComplete="username"
          className="text-input"
          id="username"
          maxLength={32}
          name="username"
          required
        />
        <label className="field-label" htmlFor="password">
          Password
        </label>
        <input
          autoComplete="new-password"
          className="text-input"
          id="password"
          maxLength={128}
          minLength={12}
          name="password"
          required
          type="password"
        />
        <label className="field-label" htmlFor="password-confirmation">
          Confirm password
        </label>
        <input
          autoComplete="new-password"
          className="text-input"
          id="password-confirmation"
          maxLength={128}
          minLength={12}
          name="passwordConfirmation"
          required
          type="password"
        />
        <FormMessage message={submission.message} requestId={submission.requestId} />
        <SubmitButton pending={submission.pending} pendingLabel="Creating account...">
          Create account
        </SubmitButton>
      </form>
      <p className="auth-footer">
        Already registered? <Link href="/login">Sign in</Link>
      </p>
    </AuthCard>
  );
}
