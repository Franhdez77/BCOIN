'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { authApi } from '../auth-api';
import { consumeTokenFragment } from '../token-fragment';
import { useSubmission } from '../use-submission';
import { AuthCard, FormMessage, SubmitButton } from './auth-ui';

export function VerifyEmailForm() {
  const [token, setToken] = useState<string>();
  const [initialized, setInitialized] = useState(false);
  const [resendCompleted, setResendCompleted] = useState(false);
  const [verified, setVerified] = useState(false);
  const attempted = useRef(false);
  const verification = useSubmission();
  const runVerification = verification.run;
  const resend = useSubmission();

  const verifyToken = useCallback(
    async (value: string) => {
      const succeeded = await runVerification(() => authApi.verifyEmail(value));
      if (succeeded) {
        setVerified(true);
        setToken(undefined);
      }
    },
    [runVerification],
  );

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

  useEffect(() => {
    if (!token || attempted.current) {
      return;
    }

    attempted.current = true;
    void verifyToken(token);
  }, [token, verifyToken]);

  async function handleResend(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const succeeded = await resend.run(() => authApi.resendVerification(email));
    if (succeeded) {
      setResendCompleted(true);
    }
  }

  return (
    <AuthCard
      description="Confirm your email before signing in. Verification links are single-use."
      title="Verify email"
    >
      {!initialized ? (
        <p aria-live="polite" className="loading-state">
          Loading verification...
        </p>
      ) : verified ? (
        <>
          <FormMessage message="Your email has been verified." tone="success" />
          <Link className="primary-link" href="/login">
            Continue to sign in
          </Link>
        </>
      ) : token ? (
        <>
          <p aria-live="polite" className="loading-state">
            {verification.pending
              ? 'Verifying your email...'
              : 'Verification could not be completed.'}
          </p>
          <FormMessage message={verification.message} requestId={verification.requestId} />
          {verification.message ? (
            <button
              className="secondary-button"
              disabled={verification.pending}
              onClick={() => void verifyToken(token)}
              type="button"
            >
              Try verification again
            </button>
          ) : null}
        </>
      ) : resendCompleted ? (
        <>
          <FormMessage
            message="If the address is eligible, a new verification email will be sent."
            tone="success"
          />
          <Link className="primary-link" href="/login">
            Return to sign in
          </Link>
        </>
      ) : (
        <>
          <FormMessage
            message="Open the verification link from your email, or request a new one below."
            tone="success"
          />
          <form className="auth-form" onSubmit={handleResend}>
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
            <FormMessage message={resend.message} requestId={resend.requestId} />
            <SubmitButton pending={resend.pending} pendingLabel="Sending request...">
              Resend verification email
            </SubmitButton>
          </form>
        </>
      )}
    </AuthCard>
  );
}
