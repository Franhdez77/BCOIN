'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { authApi } from '../auth-api';
import { useSubmission } from '../use-submission';
import { AuthCard, FormMessage, SubmitButton } from './auth-ui';

const GENERIC_CONFIRMATION =
  'If an account matches that email, password reset instructions will be sent.';

export function ForgotPasswordForm() {
  const submission = useSubmission();
  const [completed, setCompleted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const succeeded = await submission.run(() => authApi.forgotPassword(email));

    if (succeeded) {
      setCompleted(true);
    }
  }

  return (
    <AuthCard
      description="Enter your email to request a single-use reset link."
      title="Reset password"
    >
      {completed ? (
        <>
          <FormMessage message={GENERIC_CONFIRMATION} tone="success" />
          <Link className="primary-link" href="/login">
            Return to sign in
          </Link>
        </>
      ) : (
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
          <FormMessage message={submission.message} requestId={submission.requestId} />
          <SubmitButton pending={submission.pending} pendingLabel="Sending request...">
            Send reset link
          </SubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
