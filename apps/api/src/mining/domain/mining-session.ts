export interface MiningSessionRecord {
  id: string;
  userId: string;
  startedAt: Date;
  endsAt: Date;
  claimedAt: Date | null;
  rewardAmount: bigint;
  createdAt: Date;
}

export interface MiningSessionView extends MiningSessionRecord {
  eligible: boolean;
}

export function toMiningSessionView(session: MiningSessionRecord, now: Date): MiningSessionView {
  return {
    ...session,
    eligible: session.claimedAt === null && session.endsAt.getTime() <= now.getTime(),
  };
}
