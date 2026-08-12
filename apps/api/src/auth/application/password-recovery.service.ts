import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../../config/environment';
import { SecurityEventType, SessionRevocationReason } from '../../generated/prisma/enums';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { invalidPasswordReset, passwordRejected } from '../domain/auth-errors';
import type { RequestMetadata } from '../presentation/request-metadata';
import { normalizeEmail } from './auth-mappers';
import { AuthTransactionService } from './auth-transaction.service';
import { EMAIL_SENDER, type EmailSender } from './email-sender.port';
import { PasswordHasher, PasswordPolicyError } from './password-hasher';
import { TokenCryptoService } from './token-crypto.service';

@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: AuthTransactionService,
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenCryptoService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {}

  async request(emailInput: string, metadata: RequestMetadata): Promise<{ accepted: true }> {
    const email = normalizeEmail(emailInput);
    const user = await this.prisma.user.findUnique({ where: { emailNormalized: email.normalized } });
    if (user === null || user.emailVerifiedAt === null) {
      return { accepted: true };
    }
    const token = this.tokens.createOpaqueToken();
    const now = new Date();
    const expiresAt = addSeconds(
      this.config.getOrThrow('PASSWORD_RESET_TTL_SECONDS', { infer: true }),
    );
    await this.transactions.run(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, consumedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.passwordResetToken.create({
        data: { id: token.id, userId: user.id, tokenHash: token.hash, expiresAt },
      });
      await tx.securityEvent.create({
        data: {
          type: SecurityEventType.PASSWORD_RESET_REQUESTED,
          userId: user.id,
          requestId: metadata.requestId,
          subjectHash: this.tokens.subjectHash(email.normalized),
        },
      });
    });
    try {
      await this.emailSender.sendPasswordReset(user.email, token.value);
    } catch (error: unknown) {
      this.logger.error({
        event: 'password_reset_delivery_failed',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
    }
    return { accepted: true };
  }

  async reset(
    value: string,
    newPassword: string,
    metadata: RequestMetadata,
  ): Promise<{ passwordReset: true }> {
    const parsed = this.tokens.parseOpaqueToken(value);
    if (parsed === null) throw invalidPasswordReset();
    let passwordHash: string;
    try {
      passwordHash = await this.passwords.hash(newPassword);
    } catch (error: unknown) {
      if (error instanceof PasswordPolicyError) throw passwordRejected();
      throw error;
    }
    const now = new Date();
    await this.transactions.run(async (tx) => {
      const token = await tx.passwordResetToken.findUnique({ where: { id: parsed.id } });
      if (
        token === null ||
        token.consumedAt !== null ||
        token.revokedAt !== null ||
        token.expiresAt <= now ||
        !this.tokens.hashesEqual(token.tokenHash, parsed.hash)
      ) {
        throw invalidPasswordReset();
      }
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: token.id, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw invalidPasswordReset();
      await tx.user.update({
        where: { id: token.userId },
        data: { passwordHash, passwordChangedAt: now },
      });
      const sessions = await tx.authSession.findMany({
        where: { userId: token.userId, revokedAt: null },
        select: { id: true },
      });
      const sessionIds = sessions.map(({ id }) => id);
      await tx.authSession.updateMany({
        where: { id: { in: sessionIds }, revokedAt: null },
        data: { revokedAt: now, revocationReason: SessionRevocationReason.PASSWORD_RESET },
      });
      await tx.refreshToken.updateMany({
        where: { sessionId: { in: sessionIds }, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: token.userId, id: { not: token.id }, consumedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.securityEvent.create({
        data: {
          type: SecurityEventType.PASSWORD_RESET_COMPLETED,
          userId: token.userId,
          requestId: metadata.requestId,
        },
      });
    });
    return { passwordReset: true };
  }
}

function addSeconds(seconds: number): Date {
  return new Date(Date.now() + seconds * 1_000);
}
