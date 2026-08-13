import { Inject, Injectable, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiHttpException } from '../../common/errors/api-http.exception';
import type { EnvironmentVariables } from '../../config/environment';
import { SecurityEventType } from '../../generated/prisma/enums';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { UserProvisioningService } from '../../users/application/user-provisioning.service';
import { invalidVerification, passwordRejected } from '../domain/auth-errors';
import type { RequestMetadata } from '../presentation/request-metadata';
import { EMAIL_SENDER, type EmailSender } from './email-sender.port';
import { normalizeEmail, normalizeUsername } from './auth-mappers';
import { AuthTransactionService, isPrismaCode } from './auth-transaction.service';
import { PasswordHasher, PasswordPolicyError } from './password-hasher';
import { TokenCryptoService } from './token-crypto.service';

@Injectable()
export class AccountVerificationService {
  private readonly logger = new Logger(AccountVerificationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: AuthTransactionService,
    private readonly userProvisioning: UserProvisioningService,
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenCryptoService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {}

  async register(
    emailInput: string,
    usernameInput: string,
    password: string,
    metadata: RequestMetadata,
  ): Promise<{ accepted: true }> {
    const email = normalizeEmail(emailInput);
    const username = normalizeUsername(usernameInput);
    let passwordHash: string;
    try {
      passwordHash = await this.passwords.hash(password);
    } catch (error: unknown) {
      if (error instanceof PasswordPolicyError) throw passwordRejected();
      throw error;
    }
    const token = this.tokens.createOpaqueToken();
    const expiresAt = addSeconds(
      this.config.getOrThrow('EMAIL_VERIFICATION_TTL_SECONDS', { infer: true }),
    );

    try {
      await this.transactions.run(async (tx) => {
        const user = await this.userProvisioning.create(tx, {
          email: email.display,
          emailNormalized: email.normalized,
          username: username.display,
          usernameNormalized: username.normalized,
          passwordHash,
        });
        await tx.emailVerificationToken.create({
          data: { id: token.id, userId: user.id, tokenHash: token.hash, expiresAt },
        });
        await tx.securityEvent.createMany({
          data: [
            {
              type: SecurityEventType.REGISTRATION_CREATED,
              userId: user.id,
              requestId: metadata.requestId,
              subjectHash: this.tokens.subjectHash(email.normalized),
            },
            {
              type: SecurityEventType.EMAIL_VERIFICATION_REQUESTED,
              userId: user.id,
              requestId: metadata.requestId,
            },
          ],
        });
      });
    } catch (error: unknown) {
      if (isPrismaCode(error, 'P2002')) {
        throw new ApiHttpException(
          HttpStatus.CONFLICT,
          'REGISTRATION_CONFLICT',
          'An account with those details cannot be created.',
        );
      }
      throw error;
    }

    try {
      await this.emailSender.sendEmailVerification(email.display, token.value);
    } catch (error: unknown) {
      this.logDeliveryFailure(error);
    }
    return { accepted: true };
  }

  async resend(emailInput: string, metadata: RequestMetadata): Promise<{ accepted: true }> {
    const email = normalizeEmail(emailInput);
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: email.normalized },
    });
    if (user === null || user.emailVerifiedAt !== null) {
      return { accepted: true };
    }

    const token = this.tokens.createOpaqueToken();
    const now = new Date();
    const expiresAt = addSeconds(
      this.config.getOrThrow('EMAIL_VERIFICATION_TTL_SECONDS', { infer: true }),
    );
    await this.transactions.run(async (tx) => {
      await tx.emailVerificationToken.updateMany({
        where: { userId: user.id, consumedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.emailVerificationToken.create({
        data: { id: token.id, userId: user.id, tokenHash: token.hash, expiresAt },
      });
      await tx.securityEvent.create({
        data: {
          type: SecurityEventType.EMAIL_VERIFICATION_REQUESTED,
          userId: user.id,
          requestId: metadata.requestId,
        },
      });
    });
    try {
      await this.emailSender.sendEmailVerification(user.email, token.value);
    } catch (error: unknown) {
      this.logDeliveryFailure(error);
    }
    return { accepted: true };
  }

  async verify(value: string, metadata: RequestMetadata): Promise<{ emailVerified: true }> {
    const parsed = this.tokens.parseOpaqueToken(value);
    if (parsed === null) throw invalidVerification();
    const now = new Date();
    await this.transactions.run(async (tx) => {
      const token = await tx.emailVerificationToken.findUnique({ where: { id: parsed.id } });
      if (
        token === null ||
        token.consumedAt !== null ||
        token.revokedAt !== null ||
        token.expiresAt <= now ||
        !this.tokens.hashesEqual(token.tokenHash, parsed.hash)
      ) {
        throw invalidVerification();
      }
      const consumed = await tx.emailVerificationToken.updateMany({
        where: { id: token.id, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw invalidVerification();
      await tx.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: now } });
      await tx.securityEvent.create({
        data: {
          type: SecurityEventType.EMAIL_VERIFIED,
          userId: token.userId,
          requestId: metadata.requestId,
        },
      });
    });
    return { emailVerified: true };
  }

  private logDeliveryFailure(error: unknown): void {
    this.logger.error({
      event: 'email_verification_delivery_failed',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}

function addSeconds(seconds: number): Date {
  return new Date(Date.now() + seconds * 1_000);
}
