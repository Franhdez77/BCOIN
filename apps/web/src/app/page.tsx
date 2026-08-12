function getLiveHealthUrl(): string {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is not configured.');
  }

  return new URL('/health/live', apiBaseUrl).toString();
}

export default function Home() {
  const liveHealthUrl = getLiveHealthUrl();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-16">
      <section
        aria-labelledby="foundation-title"
        className="w-full rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl"
      >
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">Sprint 0</p>
        <h1 id="foundation-title" className="mt-3 text-4xl font-semibold tracking-tight">
          BichoCoin
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-300">The web foundation is running.</p>
        <a
          className="mt-8 inline-flex rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-emerald-500 hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
          href={liveHealthUrl}
        >
          Open API live health
        </a>
      </section>
    </main>
  );
}
