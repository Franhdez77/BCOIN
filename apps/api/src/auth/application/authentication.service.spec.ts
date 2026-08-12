import type { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../../config/environment';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AccessTokenService } from './access-token.service';
import { AuthenticationService } from './authentication.service';
import type { AuthTransactionService } from './auth-transaction.service';
import type { PasswordHasher } from './password-hasher';
import type { TokenCryptoService } from './token-crypto.service';

describe('AuthenticationService', () => {
  it('propagates database failure after a valid access cookie during logout', async () => {
    const databaseFailure = new Error('database unavailable');
    const prisma = {
      authSession: { findFirst: jest.fn().mockRejectedValue(databaseFailure) },
    } as unknown as PrismaService;
    const accessTokens = {
      verify: jest.fn().mockResolvedValue({
        sub: crypto.randomUUID(),
        sid: crypto.randomUUID(),
        jti: crypto.randomUUID(),
      }),
    } as unknown as AccessTokenService;
    const service = new AuthenticationService(
      prisma,
      {} as AuthTransactionService,
      {} as PasswordHasher,
      {} as TokenCryptoService,
      accessTokens,
      {} as ConfigService<EnvironmentVariables, true>,
    );

    await expect(
      service.logoutByRefresh(undefined, 'valid-access-cookie', crypto.randomUUID()),
    ).rejects.toBe(databaseFailure);
  });
});
