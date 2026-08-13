import { Module } from '@nestjs/common';

import { PrismaModule } from '../infrastructure/prisma/prisma.module';
import { WalletApplicationService } from './application/wallet-application.service';
import { WalletProvisioningService } from './application/wallet-provisioning.service';
import { WalletQueryService } from './application/wallet-query.service';
import { WalletController } from './presentation/wallet.controller';

@Module({
  imports: [PrismaModule],
  controllers: [WalletController],
  providers: [WalletApplicationService, WalletProvisioningService, WalletQueryService],
  exports: [WalletApplicationService, WalletProvisioningService],
})
export class WalletModule {}
