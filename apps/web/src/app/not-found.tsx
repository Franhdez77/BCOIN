import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="page-shell">
      <section aria-labelledby="not-found-title" className="auth-card">
        <Link className="brand-link" href="/">
          BichoCoin
        </Link>
        <p className="eyebrow">404</p>
        <h1 className="auth-title" id="not-found-title">
          Page not found
        </h1>
        <p className="auth-description">The page you requested does not exist.</p>
        <Link className="primary-link" href="/">
          Return home
        </Link>
      </section>
    </main>
  );
}
