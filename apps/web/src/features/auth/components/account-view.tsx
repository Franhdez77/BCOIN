'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { authApi } from '../auth-api';
import type { AuthSession, AuthUser } from '../contracts';
import { getSafeErrorMessage, isExpiredSessionError } from '../messages';
import { navigateTo } from '../navigation';

interface AccountViewProps {
  navigate?: (path: string) => void;
}

interface AccountData {
  sessions: AuthSession[];
  user: AuthUser;
}

export function AccountView({ navigate = navigateTo }: AccountViewProps) {
  const [data, setData] = useState<AccountData>();
  const [errorMessage, setErrorMessage] = useState('');
  const [requestId, setRequestId] = useState<string>();
  const [pendingAction, setPendingAction] = useState<string>();
  const actionLocked = useRef(false);

  const loadAccount = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [meResult, sessionsResult] = await Promise.all([
          authApi.me(signal),
          authApi.sessions(signal),
        ]);
        setData({ sessions: sessionsResult.sessions, user: meResult.user });
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
          <p className="account-subtitle">Signed in as {data.user.username}</p>
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
        <h2 id="profile-title">Profile</h2>
        <dl className="detail-grid">
          <div>
            <dt>Username</dt>
            <dd>{data.user.username}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{data.user.email}</dd>
          </div>
          <div>
            <dt>Email status</dt>
            <dd>{data.user.emailVerified ? 'Verified' : 'Verification required'}</dd>
          </div>
          <div>
            <dt>Account status</dt>
            <dd>{data.user.status}</dd>
          </div>
        </dl>
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
