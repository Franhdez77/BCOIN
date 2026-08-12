'use client';

import './globals.css';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <title>Something went wrong | BichoCoin</title>
        <main className="page-shell">
          <section aria-labelledby="global-error-title" className="auth-card">
            <p className="eyebrow">BichoCoin</p>
            <h1 className="auth-title" id="global-error-title">
              Something went wrong
            </h1>
            <p className="auth-description">
              The application could not be loaded safely. Please try again.
            </p>
            <button className="primary-button" onClick={reset} type="button">
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
