import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';

import { PrismaModule } from '../infrastructure/prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { AccessTokenService } from './application/access-token.service';
import { AccountVerificationService } from './application/account-verification.service';
import { AuthenticationService } from './application/authentication.service';
import { AuthTransactionService } from './application/auth-transaction.service';
import { EMAIL_SENDER } from './application/email-sender.port';
import { PasswordHasher } from './application/password-hasher';
import { PasswordRecoveryService } from './application/password-recovery.service';
import { SessionQueryService } from './application/session-query.service';
import { TokenCryptoService } from './application/token-crypto.service';
import { AuthGuard } from './guards/auth.guard';
import { CsrfGuard } from './guards/csrf.guard';
import { RolesGuard } from './guards/roles.guard';
import { TargetedRateLimitGuard } from './guards/targeted-rate-limit.guard';
import { AuthCookieService } from './infrastructure/auth-cookie.service';
import { SmtpEmailSender } from './infrastructure/smtp-email-sender';
import { AuthController } from './presentation/auth.controller';

@Module({
  imports: [PrismaModule, UsersModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AccessTokenService,
    AccountVerificationService,
    AuthenticationService,
    AuthTransactionService,
    AuthCookieService,
    PasswordHasher,
    PasswordRecoveryService,
    SessionQueryService,
    SmtpEmailSender,
    TargetedRateLimitGuard,
    TokenCryptoService,
    { provide: EMAIL_SENDER, useExisting: SmtpEmailSender },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useExisting: TargetedRateLimitGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
