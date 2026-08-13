import { HttpStatus, Injectable } from '@nestjs/common';

import { ApiHttpException } from '../../common/errors/api-http.exception';
import type { WalletTransactionType } from '../../generated/prisma/enums';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { walletNotFound } from '../domain/wallet-errors';

const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export interface WalletSummary {
  id: string;
  balance: bigint;
  createdAt: Date;
}

export interface WalletHistoryEntry {
  id: string;
  type: WalletTransactionType;
  amount: bigint;
  balanceBefore: bigint;
  balanceAfter: bigint;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: Date;
}

export interface WalletHistoryPage {
  transactions: WalletHistoryEntry[];
  nextCursor?: string;
}

@Injectable()
export class WalletQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async getWallet(userId: string): Promise<WalletSummary> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true, balance: true, createdAt: true },
    });
    if (wallet === null) throw walletNotFound();
    return wallet;
  }

  async getHistory(
    userId: string,
    cursorInput?: string,
    limitInput?: number,
  ): Promise<WalletHistoryPage> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (wallet === null) throw walletNotFound();

    const cursor = cursorInput === undefined ? undefined : decodeCursor(cursorInput);
    const limit = limitInput ?? DEFAULT_PAGE_SIZE;
    const rows = await this.prisma.walletTransaction.findMany({
      where: {
        walletId: wallet.id,
        ...(cursor === undefined
          ? {}
          : {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        type: true,
        amount: true,
        balanceBefore: true,
        balanceAfter: true,
        referenceType: true,
        referenceId: true,
        createdAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const transactions = hasMore ? rows.slice(0, limit) : rows;
    const last = transactions.at(-1);

    return {
      transactions,
      ...(hasMore && last !== undefined
        ? { nextCursor: encodeCursor(last.createdAt, last.id) }
        : {}),
    };
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

function decodeCursor(value: string): { createdAt: Date; id: string } {
  if (value.length < 1 || value.length > 160 || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw invalidCursor();
  }

  let decoded: string;
  try {
    decoded = Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    throw invalidCursor();
  }

  const separator = decoded.indexOf('|');
  if (separator < 1 || separator !== decoded.lastIndexOf('|')) throw invalidCursor();

  const timestamp = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  const createdAt = new Date(timestamp);
  if (
    Number.isNaN(createdAt.getTime()) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)
  ) {
    throw invalidCursor();
  }

  return { createdAt, id };
}

function invalidCursor(): ApiHttpException {
  return new ApiHttpException(
    HttpStatus.BAD_REQUEST,
    'WALLET_CURSOR_INVALID',
    'The transaction cursor is invalid.',
  );
}
