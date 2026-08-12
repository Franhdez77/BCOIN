'use client';

interface ErrorViewProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorView({ reset }: ErrorViewProps) {
  return (
    <main className="page-shell">
      <section aria-labelledby="error-title" className="auth-card">
        <p className="eyebrow">BichoCoin</p>
        <h1 className="auth-title" id="error-title">
          Something went wrong
        </h1>
        <p className="auth-description">The page could not be loaded safely. Please try again.</p>
        <button className="primary-button" onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}
