import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client';
import { WalletProvisioningService } from '../../wallet/application/wallet-provisioning.service';

export interface CreateUserInput {
  email: string;
  emailNormalized: string;
  username: string;
  usernameNormalized: string;
  passwordHash: string;
}

@Injectable()
export class UserProvisioningService {
  constructor(private readonly walletProvisioning: WalletProvisioningService) {}

  async create(transaction: Prisma.TransactionClient, input: CreateUserInput) {
    const user = await transaction.user.create({ data: input });
    await this.walletProvisioning.provision(transaction, user.id);
    return user;
  }
}
