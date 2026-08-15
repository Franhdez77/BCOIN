import { Module } from '@nestjs/common';

import { PrismaModule } from '../infrastructure/prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { MiningApplicationService } from './application/mining-application.service';
import { MiningQueryService } from './application/mining-query.service';
import { MiningController } from './presentation/mining.controller';

@Module({
  imports: [PrismaModule, WalletModule],
  controllers: [MiningController],
  providers: [MiningApplicationService, MiningQueryService],
})
export class MiningModule {}
