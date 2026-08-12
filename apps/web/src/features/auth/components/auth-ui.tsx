import Link from 'next/link';
import type { ReactNode } from 'react';

interface AuthCardProps {
  children: ReactNode;
  description: string;
  eyebrow?: string;
  title: string;
}

export function AuthCard({ children, description, eyebrow = 'BichoCoin', title }: AuthCardProps) {
  return (
    <main className="page-shell">
      <section aria-labelledby="auth-title" className="auth-card">
        <Link className="brand-link" href="/">
          {eyebrow}
        </Link>
        <h1 id="auth-title" className="auth-title">
          {title}
        </h1>
        <p className="auth-description">{description}</p>
        {children}
      </section>
    </main>
  );
}

interface FormMessageProps {
  message: string;
  requestId?: string;
  tone?: 'error' | 'success';
}

export function FormMessage({ message, requestId, tone = 'error' }: FormMessageProps) {
  if (!message) {
    return <div aria-live="polite" className="min-h-6" />;
  }

  return (
    <div
      aria-live="polite"
      className={tone === 'success' ? 'form-message-success' : 'form-message-error'}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <p>{message}</p>
      {requestId ? <p className="request-id">Reference: {requestId}</p> : null}
    </div>
  );
}

interface SubmitButtonProps {
  children: ReactNode;
  pending: boolean;
  pendingLabel: string;
}

export function SubmitButton({ children, pending, pendingLabel }: SubmitButtonProps) {
  return (
    <button className="primary-button" disabled={pending} type="submit">
      {pending ? pendingLabel : children}
    </button>
  );
}
