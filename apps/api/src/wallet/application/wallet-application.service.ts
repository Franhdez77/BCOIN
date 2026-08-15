import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import type { WalletTransactionType } from '../../generated/prisma/enums';
import {
  isPrismaCode,
  runSerializableTransaction,
} from '../../infrastructure/prisma/prisma-transaction';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  idempotencyConflict,
  insufficientBalance,
  invalidWalletMovement,
  walletNotFound,
} from '../domain/wallet-errors';

const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const MAX_REFERENCE_TYPE_LENGTH = 64;
const MAX_REFERENCE_ID_LENGTH = 128;
const MAX_REASON_LENGTH = 500;

export interface WalletMovementInput {
  userId: string;
  type: WalletTransactionType;
  amount: bigint;
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  actorUserId?: string;
  requestId?: string;
  reason?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface WalletMovementResult {
  transactionId: string;
  balanceBefore: bigint;
  balanceAfter: bigint;
  amount: bigint;
}

@Injectable()
export class WalletApplicationService {
  constructor(private readonly prisma: PrismaService) {}

  async recordMovement(input: WalletMovementInput): Promise<WalletMovementResult> {
    validateMovement(input);

    try {
      return await runSerializableTransaction(this.prisma, (transaction) =>
        this.recordMovementInTransaction(transaction, input),
      );
    } catch (error: unknown) {
      if (!isPrismaCode(error, 'P2002')) throw error;

      const existing = await this.prisma.walletTransaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { wallet: { select: { userId: true } } },
      });
      if (existing === null) throw error;
      return this.resolveExisting(existing, input);
    }
  }

  async recordMovementInTransaction(
    transaction: Prisma.TransactionClient,
    input: WalletMovementInput,
  ): Promise<WalletMovementResult> {
    validateMovement(input);

    const existing = await transaction.walletTransaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { wallet: { select: { userId: true } } },
    });

    if (existing !== null) {
      return this.resolveExisting(existing, input);
    }

    const wallet = await transaction.wallet.findUnique({
      where: { userId: input.userId },
      select: { id: true, balance: true },
    });
    if (wallet === null) throw walletNotFound();

    const balanceAfter = wallet.balance + input.amount;
    if (balanceAfter < 0n) throw insufficientBalance();

    await transaction.wallet.update({
      where: { id: wallet.id },
      data: { balance: balanceAfter },
    });

    const ledger = await transaction.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: input.type,
        amount: input.amount,
        balanceBefore: wallet.balance,
        balanceAfter,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        idempotencyKey: input.idempotencyKey,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        reason: input.reason,
        metadata: input.metadata,
      },
      select: { id: true },
    });

    return {
      transactionId: ledger.id,
      balanceBefore: wallet.balance,
      balanceAfter,
      amount: input.amount,
    };
  }

  private resolveExisting(
    existing: {
      id: string;
      type: WalletTransactionType;
      amount: bigint;
      balanceBefore: bigint;
      balanceAfter: bigint;
      referenceType: string | null;
      referenceId: string | null;
      wallet: { userId: string };
    },
    input: WalletMovementInput,
  ): WalletMovementResult {
    const sameOperation =
      existing.wallet.userId === input.userId &&
      existing.type === input.type &&
      existing.amount === input.amount &&
      existing.referenceType === (input.referenceType ?? null) &&
      existing.referenceId === (input.referenceId ?? null);

    if (!sameOperation) throw idempotencyConflict();

    return {
      transactionId: existing.id,
      balanceBefore: existing.balanceBefore,
      balanceAfter: existing.balanceAfter,
      amount: existing.amount,
    };
  }
}

function validateMovement(input: WalletMovementInput): void {
  const referencePairIsValid =
    (input.referenceType === undefined && input.referenceId === undefined) ||
    (input.referenceType !== undefined && input.referenceId !== undefined);
  const signIsValid =
    (input.type === 'CREDIT' && input.amount > 0n) ||
    (input.type === 'DEBIT' && input.amount < 0n) ||
    (input.type === 'ADJUSTMENT' && input.amount !== 0n);

  if (
    !signIsValid ||
    input.idempotencyKey.length < 1 ||
    input.idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH ||
    !referencePairIsValid ||
    (input.referenceType?.length ?? 0) > MAX_REFERENCE_TYPE_LENGTH ||
    (input.referenceId?.length ?? 0) > MAX_REFERENCE_ID_LENGTH ||
    (input.reason?.length ?? 0) > MAX_REASON_LENGTH
  ) {
    throw invalidWalletMovement();
  }
}
