import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MiningSession } from '../contracts';
import { miningApi } from '../mining-api';
import { MiningPanel } from './mining-panel';

vi.mock('../mining-api', () => ({
  miningApi: {
    claim: vi.fn(),
    current: vi.fn(),
    history: vi.fn(),
    start: vi.fn(),
  },
}));

const ACTIVE_SESSION: MiningSession = {
  id: '11111111-1111-4111-8111-111111111111',
  startedAt: '2026-08-14T00:00:00.000Z',
  endsAt: '2026-08-15T00:00:00.000Z',
  claimedAt: null,
  rewardAmount: '100',
  eligible: false,
  createdAt: '2026-08-14T00:00:00.000Z',
};

const ELIGIBLE_SESSION: MiningSession = {
  ...ACTIVE_SESSION,
  endsAt: '2020-01-01T00:00:00.000Z',
  eligible: true,
};

beforeEach(() => {
  vi.mocked(miningApi.current).mockResolvedValue({ session: null });
  vi.mocked(miningApi.history).mockResolvedValue({ sessions: [] });
  vi.mocked(miningApi.start).mockResolvedValue({ session: ACTIVE_SESSION });
  vi.mocked(miningApi.claim).mockResolvedValue({
    session: { ...ELIGIBLE_SESSION, claimedAt: '2026-08-15T00:00:01.000Z', eligible: false },
    wallet: { currency: 'BIC', balance: '100' },
    transaction: { id: '22222222-2222-4222-8222-222222222222' },
  });
});

afterEach(() => {
  cleanup();
});

describe('MiningPanel', () => {
  it('starts mining from server data and never supplies economic inputs', async () => {
    render(<MiningPanel />);
    const startButton = await screen.findByRole('button', { name: 'Start mining' });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(miningApi.start).toHaveBeenCalledWith();
      expect(screen.getByText('100 BIC')).toBeInTheDocument();
      expect(screen.getByText('Mining')).toBeInTheDocument();
    });
  });

  it('does not trust a zero countdown when backend eligibility is false', async () => {
    vi.mocked(miningApi.current).mockResolvedValue({
      session: { ...ACTIVE_SESSION, endsAt: '2020-01-01T00:00:00.000Z', eligible: false },
    });
    vi.mocked(miningApi.history).mockResolvedValue({ sessions: [ACTIVE_SESSION] });

    render(<MiningPanel />);

    expect(await screen.findByText('00:00:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Claim mining reward' })).toBeDisabled();
  });

  it('claims eligible reward and refreshes balance/history', async () => {
    const onBalanceChanged = vi.fn();
    vi.mocked(miningApi.current).mockResolvedValue({ session: ELIGIBLE_SESSION });
    vi.mocked(miningApi.history)
      .mockResolvedValueOnce({ sessions: [ELIGIBLE_SESSION] })
      .mockResolvedValueOnce({
        sessions: [
          { ...ELIGIBLE_SESSION, claimedAt: '2026-08-15T00:00:01.000Z', eligible: false },
        ],
      });

    render(<MiningPanel onBalanceChanged={onBalanceChanged} />);
    const claimButton = await screen.findByRole('button', { name: 'Claim mining reward' });
    fireEvent.click(claimButton);

    expect(
      await screen.findByText('Mining reward claimed. New wallet balance: 100 BIC.'),
    ).toBeInTheDocument();
    expect(onBalanceChanged).toHaveBeenCalledWith('100');
    expect(miningApi.claim).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Claimed')).toBeInTheDocument();
  });

  it('loads bounded history pages through the server cursor', async () => {
    vi.mocked(miningApi.history)
      .mockResolvedValueOnce({ sessions: [ACTIVE_SESSION], nextCursor: 'cursor-1' })
      .mockResolvedValueOnce({ sessions: [{ ...ACTIVE_SESSION, id: 'session-2' }] });

    render(<MiningPanel />);
    const more = await screen.findByRole('button', { name: 'Load more mining history' });
    fireEvent.click(more);

    await waitFor(() => {
      expect(miningApi.history).toHaveBeenNthCalledWith(2, 'cursor-1');
      expect(screen.getAllByText('100 BIC')).toHaveLength(2);
    });
  });
});
