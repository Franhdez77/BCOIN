import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { miningCursorInvalid } from '../domain/mining-errors';
import { toMiningSessionView, type MiningSessionView } from '../domain/mining-session';

const DEFAULT_PAGE_SIZE = 20;
export const MAX_MINING_HISTORY_PAGE_SIZE = 50;

export interface MiningHistoryPage {
  sessions: MiningSessionView[];
  nextCursor?: string;
}

@Injectable()
export class MiningQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent(userId: string): Promise<MiningSessionView | null> {
    const session = await this.prisma.miningSession.findFirst({
      where: { userId, claimedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: miningSessionSelection,
    });
    return session === null ? null : toMiningSessionView(session, new Date());
  }

  async getHistory(
    userId: string,
    cursorInput?: string,
    limitInput?: number,
  ): Promise<MiningHistoryPage> {
    const cursor = cursorInput === undefined ? undefined : decodeCursor(cursorInput);
    const limit = Math.min(limitInput ?? DEFAULT_PAGE_SIZE, MAX_MINING_HISTORY_PAGE_SIZE);
    const now = new Date();
    const rows = await this.prisma.miningSession.findMany({
      where: {
        userId,
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
      select: miningSessionSelection,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const sessions = pageRows.map((session) => toMiningSessionView(session, now));
    const last = pageRows.at(-1);

    return {
      sessions,
      ...(hasMore && last !== undefined
        ? { nextCursor: encodeCursor(last.createdAt, last.id) }
        : {}),
    };
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

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

function decodeCursor(value: string): { createdAt: Date; id: string } {
  if (value.length < 1 || value.length > 160 || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw miningCursorInvalid();
  }

  let decoded: string;
  try {
    decoded = Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    throw miningCursorInvalid();
  }

  const separator = decoded.indexOf('|');
  if (separator < 1 || separator !== decoded.lastIndexOf('|')) throw miningCursorInvalid();

  const timestamp = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  const createdAt = new Date(timestamp);
  if (
    Number.isNaN(createdAt.getTime()) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)
  ) {
    throw miningCursorInvalid();
  }

  return { createdAt, id };
}
