import { Module } from '@nestjs/common';

import { PrismaModule } from '../infrastructure/prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { UserProfileService } from './application/user-profile.service';
import { UserProvisioningService } from './application/user-provisioning.service';
import { UsersController } from './presentation/users.controller';

@Module({
  imports: [PrismaModule, WalletModule],
  controllers: [UsersController],
  providers: [UserProfileService, UserProvisioningService],
  exports: [UserProvisioningService],
})
export class UsersModule {}
