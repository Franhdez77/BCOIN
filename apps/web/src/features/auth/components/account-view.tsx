'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { usersApi } from '@/features/users/users-api';
import type { UserProfile } from '@/features/users/contracts';
import { walletApi } from '@/features/wallet/wallet-api';
import type { WalletSummary, WalletTransactionPage } from '@/features/wallet/contracts';

import { authApi } from '../auth-api';
import type { AuthSession } from '../contracts';
import { getSafeErrorMessage, isExpiredSessionError } from '../messages';
import { navigateTo } from '../navigation';

interface AccountViewProps {
  navigate?: (path: string) => void;
}

interface AccountData {
  profile: UserProfile;
  sessions: AuthSession[];
  wallet: WalletSummary;
  history: WalletTransactionPage;
}

export function AccountView({ navigate = navigateTo }: AccountViewProps) {
  const [data, setData] = useState<AccountData>();
  const [usernameDraft, setUsernameDraft] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [requestId, setRequestId] = useState<string>();
  const [pendingAction, setPendingAction] = useState<string>();
  const actionLocked = useRef(false);

  const loadAccount = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [profileResult, sessionsResult, walletResult, historyResult] = await Promise.all([
          usersApi.me(signal),
          authApi.sessions(signal),
          walletApi.wallet(signal),
          walletApi.transactions(undefined, signal),
        ]);
        setUsernameDraft(profileResult.user.username);
        setData({
          profile: profileResult.user,
          sessions: sessionsResult.sessions,
          wallet: walletResult.wallet,
          history: historyResult,
        });
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        if (isExpiredSessionError(error)) {
          navigate('/login?next=%2Faccount');
          return;
        }

        const safeError = getSafeErrorMessage(error, 'Your account could not be loaded.');
        setErrorMessage(safeError.message);
        setRequestId(safeError.requestId);
      }
    },
    [navigate],
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    queueMicrotask(() => {
      if (active) {
        void loadAccount(controller.signal);
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [loadAccount]);

  async function runAction(actionName: string, task: () => Promise<void>): Promise<void> {
    if (actionLocked.current) {
      return;
    }

    actionLocked.current = true;
    setPendingAction(actionName);
    setErrorMessage('');
    setRequestId(undefined);

    try {
      await task();
    } catch (error: unknown) {
      if (isExpiredSessionError(error)) {
        navigate('/login?next=%2Faccount');
        return;
      }

      const safeError = getSafeErrorMessage(error);
      setErrorMessage(safeError.message);
      setRequestId(safeError.requestId);
    } finally {
      actionLocked.current = false;
      setPendingAction(undefined);
    }
  }

  function submitProfile(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const username = usernameDraft.trim();
    if (username.length < 3 || username.length > 32 || !/^[A-Za-z0-9_]+$/u.test(username)) {
      setErrorMessage('Use 3-32 letters, numbers, or underscores for your username.');
      return;
    }

    void runAction('profile', async () => {
      const result = await usersApi.updateProfile({ username });
      setUsernameDraft(result.user.username);
      setData((current) =>
        current === undefined ? current : { ...current, profile: result.user },
      );
    });
  }

  function loadMoreTransactions(): void {
    if (data?.history.nextCursor === undefined) return;

    void runAction('transactions', async () => {
      const page = await walletApi.transactions(data.history.nextCursor);
      setData((current) =>
        current === undefined
          ? current
          : {
              ...current,
              history: {
                transactions: [...current.history.transactions, ...page.transactions],
                nextCursor: page.nextCursor,
              },
            },
      );
    });
  }

  function revokeSession(session: AuthSession): void {
    void runAction(`revoke-${session.id}`, async () => {
      await authApi.revokeSession(session.id, session.current);
      if (session.current) {
        navigate('/login');
        return;
      }

      setData((current) =>
        current
          ? { ...current, sessions: current.sessions.filter(({ id }) => id !== session.id) }
          : current,
      );
    });
  }

  function logout(): void {
    void runAction('logout', async () => {
      await authApi.logout();
      navigate('/login');
    });
  }

  function logoutAll(): void {
    void runAction('logout-all', async () => {
      await authApi.logoutAll();
      navigate('/login');
    });
  }

  if (!data && !errorMessage) {
    return (
      <main className="page-shell">
        <p aria-live="polite" className="loading-state">
          Loading your account...
        </p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page-shell">
        <section className="auth-card">
          <h1 className="auth-title">Account unavailable</h1>
          <div role="alert">
            <p>{errorMessage}</p>
            {requestId ? <p className="request-id">Reference: {requestId}</p> : null}
          </div>
          <button className="primary-button" onClick={() => void loadAccount()} type="button">
            Try again
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="account-shell">
      <header className="account-header">
        <div>
          <Link className="brand-link" href="/">
            BichoCoin
          </Link>
          <h1 className="account-title">Your account</h1>
          <p className="account-subtitle">Signed in as {data.profile.username}</p>
        </div>
        <button
          className="secondary-button"
          disabled={pendingAction !== undefined}
          onClick={logout}
          type="button"
        >
          {pendingAction === 'logout' ? 'Signing out...' : 'Sign out'}
        </button>
      </header>

      {errorMessage ? (
        <div className="form-message-error" role="alert">
          <p>{errorMessage}</p>
          {requestId ? <p className="request-id">Reference: {requestId}</p> : null}
        </div>
      ) : null}

      <section aria-labelledby="profile-title" className="account-panel">
        <div className="panel-heading">
          <div>
            <h2 id="profile-title">Profile</h2>
            <p>Email changes remain disabled until a reverification flow is designed.</p>
          </div>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>Email</dt>
            <dd>{data.profile.email}</dd>
          </div>
          <div>
            <dt>Email status</dt>
            <dd>{data.profile.emailVerified ? 'Verified' : 'Verification required'}</dd>
          </div>
          <div>
            <dt>Account status</dt>
            <dd>{data.profile.status}</dd>
          </div>
        </dl>
        <form className="inline-form" onSubmit={submitProfile}>
          <label className="field-label" htmlFor="profile-username">
            Username
          </label>
          <input
            autoComplete="username"
            className="text-input"
            disabled={pendingAction !== undefined}
            id="profile-username"
            maxLength={32}
            minLength={3}
            onChange={(event) => setUsernameDraft(event.target.value)}
            pattern="[A-Za-z0-9_]+"
            required
            value={usernameDraft}
          />
          <button className="primary-button" disabled={pendingAction !== undefined} type="submit">
            {pendingAction === 'profile' ? 'Saving...' : 'Save username'}
          </button>
        </form>
      </section>

      <section aria-labelledby="wallet-title" className="account-panel">
        <div className="panel-heading">
          <div>
            <h2 id="wallet-title">BIC wallet</h2>
            <p>The backend is the authority for this balance and transaction history.</p>
            <Link href="/mining">Open mining</Link>
          </div>
          <strong className="wallet-balance">{data.wallet.balance} BIC</strong>
        </div>

        {data.history.transactions.length === 0 ? (
          <p className="empty-state">No BIC transactions yet.</p>
        ) : (
          <ul className="transaction-list">
            {data.history.transactions.map((transaction) => (
              <li className="transaction-item" key={transaction.id}>
                <div>
                  <p className="session-name">{transaction.type}</p>
                  <p>{new Date(transaction.createdAt).toLocaleString()}</p>
                </div>
                <div className="transaction-amount">
                  <strong>{transaction.amount} BIC</strong>
                  <small>Balance: {transaction.balanceAfter} BIC</small>
                </div>
              </li>
            ))}
          </ul>
        )}

        {data.history.nextCursor ? (
          <button
            className="secondary-button"
            disabled={pendingAction !== undefined}
            onClick={loadMoreTransactions}
            type="button"
          >
            {pendingAction === 'transactions' ? 'Loading...' : 'Load more transactions'}
          </button>
        ) : null}
      </section>

      <section aria-labelledby="sessions-title" className="account-panel">
        <div className="panel-heading">
          <div>
            <h2 id="sessions-title">Active sessions</h2>
            <p>Revoke sessions that you no longer recognize or use.</p>
          </div>
          <button
            className="danger-button"
            disabled={pendingAction !== undefined}
            onClick={logoutAll}
            type="button"
          >
            {pendingAction === 'logout-all' ? 'Signing out everywhere...' : 'Sign out everywhere'}
          </button>
        </div>
        <ul className="session-list">
          {data.sessions.map((session) => (
            <li className="session-item" key={session.id}>
              <div>
                <p className="session-name">{session.current ? 'This session' : 'Session'}</p>
                <p>Last used {new Date(session.lastUsedAt).toLocaleString()}</p>
                <p>Expires {new Date(session.expiresAt).toLocaleString()}</p>
              </div>
              <button
                aria-label={session.current ? 'Revoke this session' : 'Revoke session'}
                className="secondary-button"
                disabled={pendingAction !== undefined}
                onClick={() => revokeSession(session)}
                type="button"
              >
                {pendingAction === `revoke-${session.id}` ? 'Revoking...' : 'Revoke'}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
