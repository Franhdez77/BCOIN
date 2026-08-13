import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client';

@Injectable()
export class WalletProvisioningService {
  async provision(transaction: Prisma.TransactionClient, userId: string): Promise<void> {
    await transaction.wallet.create({
      data: {
        userId,
        balance: 0n,
      },
    });
  }
}
