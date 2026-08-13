import { WalletTransactionType } from '../../generated/prisma/enums';
import { WalletApplicationService } from './wallet-application.service';

describe('WalletApplicationService validation', () => {
  const service = new WalletApplicationService({} as never);

  it('rejects a credit with a negative amount before touching the database', async () => {
    await expect(
      service.recordMovement({
        userId: crypto.randomUUID(),
        type: WalletTransactionType.CREDIT,
        amount: -1n,
        idempotencyKey: 'invalid-credit',
      }),
    ).rejects.toMatchObject({ errorCode: 'WALLET_MOVEMENT_INVALID' });
  });

  it('rejects incomplete references before touching the database', async () => {
    await expect(
      service.recordMovement({
        userId: crypto.randomUUID(),
        type: WalletTransactionType.ADJUSTMENT,
        amount: 1n,
        idempotencyKey: 'invalid-reference',
        referenceType: 'ADMIN_ADJUSTMENT',
      }),
    ).rejects.toMatchObject({ errorCode: 'WALLET_MOVEMENT_INVALID' });
  });
});
