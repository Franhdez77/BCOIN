import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../../config/environment';
import { WalletTransactionType } from '../../generated/prisma/enums';
import {
  isPrismaCode,
  runSerializableTransaction,
} from '../../infrastructure/prisma/prisma-transaction';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { WalletApplicationService } from '../../wallet/application/wallet-application.service';
import {
  miningAlreadyActive,
  miningAlreadyClaimed,
  miningNotEligible,
  miningSessionNotFound,
} from '../domain/mining-errors';
import type { MiningSessionRecord } from '../domain/mining-session';

const MILLISECONDS_PER_SECOND = 1_000;
const MINING_REFERENCE_TYPE = 'MINING';
const MINING_CLAIM_IDEMPOTENCY_PREFIX = 'mining:claim:';

export interface MiningClaimResult {
  session: MiningSessionRecord;
  transactionId: string;
  walletBalance: bigint;
}

@Injectable()
export class MiningApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly walletApplication: WalletApplicationService,
  ) {}

  async start(userId: string): Promise<MiningSessionRecord> {
    const startedAt = new Date();
    const durationSeconds = this.config.getOrThrow('MINING_DURATION_SECONDS', { infer: true });
    const rewardAmount = this.config.getOrThrow('MINING_REWARD_BIC', { infer: true });
    const endsAt = new Date(startedAt.getTime() + durationSeconds * MILLISECONDS_PER_SECOND);

    try {
      return await runSerializableTransaction(this.prisma, async (transaction) => {
        const existing = await transaction.miningSession.findFirst({
          where: { userId, claimedAt: null },
          select: { id: true },
        });
        if (existing !== null) throw miningAlreadyActive();

        return transaction.miningSession.create({
          data: {
            userId,
            startedAt,
            endsAt,
            rewardAmount,
          },
          select: miningSessionSelection,
        });
      });
    } catch (error: unknown) {
      if (isPrismaCode(error, 'P2002')) throw miningAlreadyActive();
      throw error;
    }
  }

  async claim(userId: string): Promise<MiningClaimResult> {
    return runSerializableTransaction(this.prisma, async (transaction) => {
      const session = await transaction.miningSession.findFirst({
        where: { userId, claimedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: miningSessionSelection,
      });

      if (session === null) {
        const latest = await transaction.miningSession.findFirst({
          where: { userId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { claimedAt: true },
        });
        if (latest === null) throw miningSessionNotFound();
        if (latest.claimedAt !== null) throw miningAlreadyClaimed();
        throw miningSessionNotFound();
      }

      const claimedAt = new Date();
      if (session.endsAt.getTime() > claimedAt.getTime()) throw miningNotEligible();

      const transition = await transaction.miningSession.updateMany({
        where: {
          id: session.id,
          userId,
          claimedAt: null,
          endsAt: { lte: claimedAt },
        },
        data: { claimedAt },
      });
      if (transition.count !== 1) throw miningAlreadyClaimed();

      const movement = await this.walletApplication.recordMovementInTransaction(transaction, {
        userId,
        type: WalletTransactionType.CREDIT,
        amount: session.rewardAmount,
        idempotencyKey: `${MINING_CLAIM_IDEMPOTENCY_PREFIX}${session.id}`,
        referenceType: MINING_REFERENCE_TYPE,
        referenceId: session.id,
        actorUserId: userId,
        reason: 'Mining session claim',
      });

      return {
        session: { ...session, claimedAt },
        transactionId: movement.transactionId,
        walletBalance: movement.balanceAfter,
      };
    });
  }
}

const miningSessionSelection = {
  id: true,
  userId: true,
  startedAt: true,
  endsAt: true,
  claimedAt: true,
  rewardAmount: true,
  createdAt: true,
} as const;
