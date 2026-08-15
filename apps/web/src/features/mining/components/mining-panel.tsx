'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { getSafeErrorMessage, isExpiredSessionError } from '@/features/auth/messages';
import { navigateTo } from '@/features/auth/navigation';

import type { MiningHistoryPage, MiningSession } from '../contracts';
import { miningApi } from '../mining-api';

interface MiningPanelProps {
  navigate?: (path: string) => void;
  onBalanceChanged?: (balance: string) => void;
}

export function MiningPanel({ navigate = navigateTo, onBalanceChanged }: MiningPanelProps) {
  const [current, setCurrent] = useState<MiningSession | null>();
  const [history, setHistory] = useState<MiningHistoryPage>();
  const [now, setNow] = useState(() => Date.now());
  const [errorMessage, setErrorMessage] = useState('');
  const [requestId, setRequestId] = useState<string>();
  const [pendingAction, setPendingAction] = useState<string>();
  const [lastClaimBalance, setLastClaimBalance] = useState<string>();
  const actionLocked = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    void Promise.all([
      miningApi.current(controller.signal),
      miningApi.history(undefined, controller.signal),
    ])
      .then(([currentResult, historyResult]) => {
        setCurrent(currentResult.session);
        setHistory(historyResult);
        setErrorMessage('');
        setRequestId(undefined);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (isExpiredSessionError(error)) {
          navigate('/login?next=%2Fmining');
          return;
        }
        const safeError = getSafeErrorMessage(error, 'Mining data could not be loaded.');
        setErrorMessage(safeError.message);
        setRequestId(safeError.requestId);
      });

    return () => controller.abort();
  }, [navigate]);

  useEffect(() => {
    if (current === null || current === undefined) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [current]);

  const countdown = useMemo(
    () =>
      current === null || current === undefined ? undefined : formatCountdown(current.endsAt, now),
    [current, now],
  );

  async function runAction(actionName: string, task: () => Promise<void>): Promise<void> {
    if (actionLocked.current) return;
    actionLocked.current = true;
    setPendingAction(actionName);
    setErrorMessage('');
    setRequestId(undefined);

    try {
      await task();
    } catch (error: unknown) {
      if (isExpiredSessionError(error)) {
        navigate('/login?next=%2Fmining');
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

  function startMining(): void {
    void runAction('start', async () => {
      const result = await miningApi.start();
      setCurrent(result.session);
      setLastClaimBalance(undefined);
      setHistory(await miningApi.history());
    });
  }

  function refreshStatus(): void {
    void runAction('refresh', async () => {
      const result = await miningApi.current();
      setCurrent(result.session);
    });
  }

  function claimMining(): void {
    void runAction('claim', async () => {
      const result = await miningApi.claim();
      setCurrent(null);
      setLastClaimBalance(result.wallet.balance);
      onBalanceChanged?.(result.wallet.balance);
      setHistory(await miningApi.history());
    });
  }

  function loadMoreHistory(): void {
    const cursor = history?.nextCursor;
    if (cursor === undefined) return;
    void runAction('history', async () => {
      const page = await miningApi.history(cursor);
      setHistory((currentHistory) =>
        currentHistory === undefined
          ? page
          : {
              sessions: [...currentHistory.sessions, ...page.sessions],
              nextCursor: page.nextCursor,
            },
      );
    });
  }

  return (
    <section aria-labelledby="mining-title" className="account-panel">
      <div className="panel-heading">
        <div>
          <h2 id="mining-title">BIC mining</h2>
          <p>
            The backend decides timing, eligibility, reward amount, and the final wallet credit.
          </p>
        </div>
        {current === null ? (
          <button
            className="primary-button"
            disabled={pendingAction !== undefined}
            onClick={startMining}
            type="button"
          >
            {pendingAction === 'start' ? 'Starting...' : 'Start mining'}
          </button>
        ) : null}
      </div>

      {errorMessage ? (
        <div className="form-message-error" role="alert">
          <p>{errorMessage}</p>
          {requestId ? <p className="request-id">Reference: {requestId}</p> : null}
        </div>
      ) : null}

      {current === undefined || history === undefined ? (
        <p className="loading-state">Loading mining status...</p>
      ) : current === null ? (
        <p className="empty-state">No open mining session.</p>
      ) : (
        <>
          <dl className="detail-grid">
            <div>
              <dt>Started</dt>
              <dd>{new Date(current.startedAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Ends</dt>
              <dd>{new Date(current.endsAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Reward</dt>
              <dd>{current.rewardAmount} BIC</dd>
            </div>
            <div>
              <dt>Server status</dt>
              <dd>{current.eligible ? 'Ready to claim' : 'Mining'}</dd>
            </div>
            <div>
              <dt>Informative countdown</dt>
              <dd>{countdown}</dd>
            </div>
          </dl>
          <div className="home-actions">
            <button
              className="secondary-button"
              disabled={pendingAction !== undefined}
              onClick={refreshStatus}
              type="button"
            >
              {pendingAction === 'refresh' ? 'Refreshing...' : 'Refresh server status'}
            </button>
            <button
              className="primary-button"
              disabled={pendingAction !== undefined || !current.eligible}
              onClick={claimMining}
              type="button"
            >
              {pendingAction === 'claim' ? 'Claiming...' : 'Claim mining reward'}
            </button>
          </div>
        </>
      )}

      {lastClaimBalance ? (
        <div className="form-message-success" role="status">
          <p>Mining reward claimed. New wallet balance: {lastClaimBalance} BIC.</p>
        </div>
      ) : null}

      {history !== undefined ? (
        <div>
          <div className="panel-heading">
            <div>
              <h3>Mining history</h3>
              <p>Newest sessions first.</p>
            </div>
          </div>
          {history.sessions.length === 0 ? (
            <p className="empty-state">No mining sessions yet.</p>
          ) : (
            <ul className="transaction-list">
              {history.sessions.map((session) => (
                <li className="transaction-item" key={session.id}>
                  <div>
                    <p className="session-name">{miningStatusLabel(session)}</p>
                    <p>{new Date(session.startedAt).toLocaleString()}</p>
                  </div>
                  <div className="transaction-amount">
                    <strong>{session.rewardAmount} BIC</strong>
                    <small>Ends {new Date(session.endsAt).toLocaleString()}</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {history.nextCursor ? (
            <button
              className="secondary-button"
              disabled={pendingAction !== undefined}
              onClick={loadMoreHistory}
              type="button"
            >
              {pendingAction === 'history' ? 'Loading...' : 'Load more mining history'}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function formatCountdown(endsAt: string, now: number): string {
  const remainingSeconds = Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1_000));
  const hours = Math.floor(remainingSeconds / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function miningStatusLabel(session: MiningSession): string {
  if (session.claimedAt !== null) return 'Claimed';
  return session.eligible ? 'Ready to claim' : 'Mining';
}
