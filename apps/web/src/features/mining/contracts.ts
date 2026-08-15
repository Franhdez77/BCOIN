export interface MiningSession {
  id: string;
  startedAt: string;
  endsAt: string;
  claimedAt: string | null;
  rewardAmount: string;
  eligible: boolean;
  createdAt: string;
}

export interface MiningHistoryPage {
  sessions: MiningSession[];
  nextCursor?: string;
}

export interface MiningClaimResult {
  session: MiningSession;
  wallet: {
    currency: 'BIC';
    balance: string;
  };
  transaction: {
    id: string;
  };
}
