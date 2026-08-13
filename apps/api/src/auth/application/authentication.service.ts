import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiHttpException } from '../../common/errors/api-http.exception';
import type { EnvironmentVariables } from '../../config/environment';
import {
  SecurityEventType,
  SessionRevocationReason,
  UserStatus,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { invalidCredentials, invalidRefreshToken } from '../domain/auth-errors';
import type { AccessTokenPayload, PublicUser } from '../domain/auth.types';
import type { RequestMetadata } from '../presentation/request-metadata';
import { AccessTokenService } from './access-token.service';
import { normalizeEmail, normalizeUsername, toPublicUser } from './auth-mappers';
import { AuthTransactionService } from './auth-transaction.service';
import { PasswordHasher } from './password-hasher';
import { TokenCryptoService } from './token-crypto.service';

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$xt9qs3pVALsCPwwSSfCHjQ$fn7T5qmRZWtZll+sW39RvcnYO+m/LSJuMowmA4+7PtQ';

export interface AuthenticationResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthenticationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: AuthTransactionService,
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenCryptoService,
    private readonly accessTokens: AccessTokenService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async login(
    identifierInput: string,
    password: string,
    metadata: RequestMetadata,
  ): Promise<AuthenticationResult> {
    const emailNormalized = normalizeEmail(identifierInput).normalized;
    const usernameNormalized = normalizeUsername(identifierInput).normalized;
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ emailNormalized }, { usernameNormalized }] },
    });
    const valid = await this.passwords.verify(user?.passwordHash ?? DUMMY_PASSWORD_HASH, password);
    if (user === null || !valid) {
      await this.prisma.securityEvent.create({
        data: {
          type: SecurityEventType.LOGIN_FAILED,
          requestId: metadata.requestId,
          subjectHash: this.tokens.subjectHash(emailNormalized),
        },
      });
      throw invalidCredentials();
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ApiHttpException(
        HttpStatus.FORBIDDEN,
        user.status === UserStatus.SUSPENDED ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_BANNED',
        user.status === UserStatus.SUSPENDED
          ? 'The account is suspended.'
          : 'The account is banned.',
      );
    }
    if (user.emailVerifiedAt === null) {
      throw new ApiHttpException(
        HttpStatus.FORBIDDEN,
        'EMAIL_VERIFICATION_REQUIRED',
        'The email address must be verified before signing in.',
      );
    }

    const sessionId = crypto.randomUUID();
    const refresh = this.tokens.createOpaqueToken();
    const upgradedPasswordHash = this.passwords.needsRehash(user.passwordHash)
      ? await this.passwords.hash(password)
      : null;
    const expiresAt = addSeconds(
      this.config.getOrThrow('REFRESH_TOKEN_TTL_SECONDS', { infer: true }),
    );
    const accessToken = await this.accessTokens.sign(user.id, sessionId);
    await this.transactions.run(async (tx) => {
      const current = await tx.user.findUnique({ where: { id: user.id } });
      if (
        current === null ||
        current.status !== UserStatus.ACTIVE ||
        current.emailVerifiedAt === null ||
        current.passwordHash !== user.passwordHash
      ) {
        throw invalidCredentials();
      }
      if (upgradedPasswordHash !== null) {
        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash: upgradedPasswordHash },
        });
      }
      await tx.authSession.create({
        data: {
          id: sessionId,
          userId: user.id,
          expiresAt,
          userAgent: metadata.userAgent,
          ipCreated: metadata.ip,
          ipLastSeen: metadata.ip,
          refreshTokens: {
            create: { id: refresh.id, tokenHash: refresh.hash, expiresAt },
          },
        },
      });
      await tx.securityEvent.create({
        data: {
          type: SecurityEventType.LOGIN_SUCCEEDED,
          userId: user.id,
          sessionId,
          requestId: metadata.requestId,
        },
      });
    });
    return {
      user: toPublicUser(user),
      accessToken,
      refreshToken: refresh.value,
      accessExpiresAt: addSeconds(
        this.config.getOrThrow('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
      ),
      refreshExpiresAt: expiresAt,
    };
  }

  async refresh(
    value: string | undefined,
    metadata: RequestMetadata,
  ): Promise<AuthenticationResult> {
    const parsed = this.tokens.parseOpaqueToken(value);
    if (parsed === null) throw invalidRefreshToken();
    const replacement = this.tokens.createOpaqueToken();
    const now = new Date();

    const initial = await this.prisma.refreshToken.findUnique({
      where: { id: parsed.id },
      include: { session: { include: { user: true } } },
    });
    if (initial === null || !this.tokens.hashesEqual(initial.tokenHash, parsed.hash)) {
      throw invalidRefreshToken();
    }
    const accessToken = await this.accessTokens.sign(initial.session.userId, initial.sessionId);
    const outcome = await this.transactions.run(async (tx) => {
      const token = await tx.refreshToken.findUnique({
        where: { id: parsed.id },
        include: { session: { include: { user: true } } },
      });
      if (token === null || !this.tokens.hashesEqual(token.tokenHash, parsed.hash)) {
        return { kind: 'invalid' as const };
      }
      if (token.consumedAt !== null) {
        const revoked = await tx.authSession.updateMany({
          where: { id: token.sessionId, revokedAt: null },
          data: { revokedAt: now, revocationReason: SessionRevocationReason.REFRESH_REUSE },
        });
        if (revoked.count === 1) {
          await tx.refreshToken.updateMany({
            where: { sessionId: token.sessionId, revokedAt: null },
            data: { revokedAt: now },
          });
          await tx.securityEvent.create({
            data: {
              type: SecurityEventType.REFRESH_REUSE_DETECTED,
              userId: token.session.userId,
              sessionId: token.sessionId,
              requestId: metadata.requestId,
            },
          });
        }
        return { kind: 'reuse' as const };
      }
      if (token.revokedAt !== null) return { kind: 'invalid' as const };
      if (
        token.expiresAt <= now ||
        token.session.expiresAt <= now ||
        token.session.revokedAt !== null ||
        token.session.user.status !== UserStatus.ACTIVE ||
        token.session.user.emailVerifiedAt === null
      ) {
        return { kind: 'invalid' as const };
      }
      const consumed = await tx.refreshToken.updateMany({
        where: { id: token.id, consumedAt: null, revokedAt: null },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) return { kind: 'invalid' as const };
      await tx.refreshToken.create({
        data: {
          id: replacement.id,
          sessionId: token.sessionId,
          parentTokenId: token.id,
          tokenHash: replacement.hash,
          expiresAt: token.expiresAt,
        },
      });
      await tx.authSession.update({
        where: { id: token.sessionId },
        data: { lastUsedAt: now, ipLastSeen: metadata.ip },
      });
      await tx.securityEvent.create({
        data: {
          type: SecurityEventType.REFRESH_ROTATED,
          userId: token.session.userId,
          sessionId: token.sessionId,
          requestId: metadata.requestId,
        },
      });
      return { kind: 'ok' as const, user: token.session.user, expiresAt: token.expiresAt };
    });
    if (outcome.kind !== 'ok') throw invalidRefreshToken();
    return {
      user: toPublicUser(outcome.user),
      accessToken,
      refreshToken: replacement.value,
      accessExpiresAt: addSeconds(
        this.config.getOrThrow('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
      ),
      refreshExpiresAt: outcome.expiresAt,
    };
  }

  async logout(userId: string, sessionId: string, requestId: string): Promise<{ loggedOut: true }> {
    await this.revokeSessions(
      userId,
      { id: sessionId },
      SessionRevocationReason.LOGOUT,
      SecurityEventType.LOGOUT,
      requestId,
    );
    return { loggedOut: true };
  }

  async logoutByRefresh(
    refreshValue: string | undefined,
    accessValue: string | undefined,
    requestId: string,
  ): Promise<{ loggedOut: true }> {
    const sessionIds = new Set<string>();
    const parsed =
      typeof this.tokens?.parseOpaqueToken === 'function'
        ? this.tokens.parseOpaqueToken(refreshValue)
        : null;
    if (parsed !== null) {
      const token = await this.prisma.refreshToken.findUnique({ where: { id: parsed.id } });
      if (token !== null && this.tokens.hashesEqual(token.tokenHash, parsed.hash)) {
        sessionIds.add(token.sessionId);
      }
    }
    if (accessValue !== undefined) {
      let payload: AccessTokenPayload | undefined;
      try {
        payload = await this.accessTokens.verify(accessValue);
      } catch {
        // A stale access cookie must not make logout fail when refresh is still usable.
      }
      if (typeof payload?.sid === 'string' && typeof payload.sub === 'string') {
        const accessSession = await this.prisma.authSession.findFirst({
          where: { id: payload.sid, userId: payload.sub },
          select: { id: true },
        });
        if (accessSession !== null) sessionIds.add(accessSession.id);
      }
    }
    for (const sessionId of sessionIds) {
      const session = await this.prisma.authSession.findUnique({ where: { id: sessionId } });
      if (session === null || session.revokedAt !== null) continue;
      await this.revokeSessions(
        session.userId,
        { id: session.id },
        SessionRevocationReason.LOGOUT,
        SecurityEventType.LOGOUT,
        requestId,
      );
    }
    return { loggedOut: true };
  }

  async logoutAll(userId: string, requestId: string): Promise<{ loggedOut: true }> {
    await this.revokeSessions(
      userId,
      {},
      SessionRevocationReason.LOGOUT_ALL,
      SecurityEventType.LOGOUT_ALL,
      requestId,
    );
    return { loggedOut: true };
  }

  private async revokeSessions(
    userId: string,
    extraWhere: { id?: string },
    reason: SessionRevocationReason,
    eventType: SecurityEventType,
    requestId: string,
  ): Promise<void> {
    const now = new Date();
    await this.transactions.run(async (tx) => {
      const sessions = await tx.authSession.findMany({
        where: { userId, revokedAt: null, ...extraWhere },
        select: { id: true },
      });
      const ids = sessions.map(({ id }) => id);
      if (ids.length > 0) {
        await tx.authSession.updateMany({
          where: { id: { in: ids }, revokedAt: null },
          data: { revokedAt: now, revocationReason: reason },
        });
        await tx.refreshToken.updateMany({
          where: { sessionId: { in: ids }, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      if (ids.length > 0) {
        await tx.securityEvent.create({
          data: { type: eventType, userId, requestId },
        });
      }
    });
  }
}

function addSeconds(seconds: number): Date {
  return new Date(Date.now() + seconds * 1_000);
}
