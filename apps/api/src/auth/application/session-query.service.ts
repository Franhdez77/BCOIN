import { HttpStatus, Injectable } from '@nestjs/common';

import { ApiHttpException } from '../../common/errors/api-http.exception';
import { SecurityEventType, SessionRevocationReason } from '../../generated/prisma/enums';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthenticatedPrincipal, PublicUser } from '../domain/auth.types';
import { MAX_SESSIONS_PER_RESPONSE } from '../domain/auth.constants';
import { toPublicUser } from './auth-mappers';
import { AuthTransactionService } from './auth-transaction.service';

@Injectable()
export class SessionQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: AuthTransactionService,
  ) {}

  async me(principal: AuthenticatedPrincipal): Promise<{ user: PublicUser }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: principal.userId } });
    return { user: toPublicUser(user) };
  }

  async list(principal: AuthenticatedPrincipal): Promise<{
    sessions: Array<{
      id: string;
      createdAt: Date;
      lastUsedAt: Date;
      expiresAt: Date;
      current: boolean;
    }>;
  }> {
    const sessions = await this.prisma.authSession.findMany({
      where: { userId: principal.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: MAX_SESSIONS_PER_RESPONSE,
      select: { id: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    });
    return {
      sessions: sessions.map((session) => ({
        ...session,
        current: session.id === principal.sessionId,
      })),
    };
  }

  async revoke(
    principal: AuthenticatedPrincipal,
    sessionId: string,
    requestId: string,
  ): Promise<{ revoked: true }> {
    const now = new Date();
    const found = await this.transactions.run(async (tx) => {
      const changed = await tx.authSession.updateMany({
        where: { id: sessionId, userId: principal.userId, revokedAt: null },
        data: { revokedAt: now, revocationReason: SessionRevocationReason.USER_REVOKED },
      });
      if (changed.count !== 1) return false;
      await tx.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.securityEvent.create({
        data: {
          type: SecurityEventType.SESSION_REVOKED,
          userId: principal.userId,
          sessionId,
          requestId,
        },
      });
      return true;
    });
    if (!found) {
      throw new ApiHttpException(
        HttpStatus.NOT_FOUND,
        'SESSION_NOT_FOUND',
        'The session was not found.',
      );
    }
    return { revoked: true };
  }
}
