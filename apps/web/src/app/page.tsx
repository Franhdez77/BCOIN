import Link from 'next/link';

export default function Home() {
  return (
    <main className="home-shell">
      <section aria-labelledby="home-title" className="home-card">
        <p className="eyebrow">Football. Play. Progress.</p>
        <h1 id="home-title" className="home-title">
          BichoCoin
        </h1>
        <p className="home-description">
          Create a secure account and get ready for the BichoCoin football experience.
        </p>
        <div className="home-actions">
          <Link className="primary-link" href="/register">
            Create account
          </Link>
          <Link className="secondary-link" href="/login">
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
