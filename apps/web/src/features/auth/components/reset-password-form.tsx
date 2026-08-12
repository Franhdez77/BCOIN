'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import { authApi } from '../auth-api';
import { navigateTo } from '../navigation';
import { consumeTokenFragment } from '../token-fragment';
import { useSubmission } from '../use-submission';
import { AuthCard, FormMessage, SubmitButton } from './auth-ui';

interface ResetPasswordFormProps {
  navigate?: (path: string) => void;
}

export function ResetPasswordForm({ navigate = navigateTo }: ResetPasswordFormProps) {
  const [token, setToken] = useState<string>();
  const [initialized, setInitialized] = useState(false);
  const submission = useSubmission();

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) {
        return;
      }
      const fragmentToken = consumeTokenFragment();
      setToken(fragmentToken);
      setInitialized(true);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!token) {
      submission.setError('This password reset link is invalid or has expired.');
      return;
    }

    const form = new FormData(formElement);
    const newPassword = String(form.get('newPassword') ?? '');
    const passwordConfirmation = String(form.get('passwordConfirmation') ?? '');

    if (newPassword !== passwordConfirmation) {
      submission.setError('The passwords do not match.');
      return;
    }

    const succeeded = await submission.run(() => authApi.resetPassword({ newPassword, token }));

    if (succeeded) {
      setToken(undefined);
      formElement.reset();
      navigate('/login?reset=success');
    }
  }

  return (
    <AuthCard description="Choose a new password for your account." title="Choose new password">
      {!initialized ? (
        <p aria-live="polite" className="loading-state">
          Loading secure form...
        </p>
      ) : token ? (
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="new-password">
            New password
          </label>
          <input
            autoComplete="new-password"
            className="text-input"
            id="new-password"
            maxLength={128}
            minLength={12}
            name="newPassword"
            required
            type="password"
          />
          <label className="field-label" htmlFor="password-confirmation">
            Confirm new password
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
          <SubmitButton pending={submission.pending} pendingLabel="Updating password...">
            Update password
          </SubmitButton>
        </form>
      ) : (
        <>
          <FormMessage message="This password reset link is invalid or has expired." />
          <Link className="primary-link" href="/forgot-password">
            Request another link
          </Link>
        </>
      )}
    </AuthCard>
  );
}
