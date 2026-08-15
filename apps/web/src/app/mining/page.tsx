import Link from 'next/link';

import { MiningPanel } from '@/features/mining/components/mining-panel';

export default function MiningPage() {
  return (
    <main className="account-shell">
      <header className="account-header">
        <div>
          <Link className="brand-link" href="/">
            BichoCoin
          </Link>
          <h1 className="account-title">Mining</h1>
          <p className="account-subtitle">Run the 24-hour BIC mining loop from server state.</p>
        </div>
        <Link className="secondary-link" href="/account">
          View account
        </Link>
      </header>
      <MiningPanel />
    </main>
  );
}
