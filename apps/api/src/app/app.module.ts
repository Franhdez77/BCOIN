import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { GlobalExceptionFilter } from '../common/errors/global-exception.filter';
import { ResponseEnvelopeInterceptor } from '../common/interceptors/response-envelope.interceptor';
import { getEnvironmentFilePaths, validateEnvironment } from '../config/environment';
import { HealthModule } from '../health/health.module';
import { MiningModule } from '../mining/mining.module';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: getEnvironmentFilePaths(),
      isGlobal: true,
      validate: validateEnvironment,
    }),
    AuthModule,
    UsersModule,
    WalletModule,
    MiningModule,
    HealthModule,
  ],
  providers: [GlobalExceptionFilter, ResponseEnvelopeInterceptor],
})
export class AppModule {}
