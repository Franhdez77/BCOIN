import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { GlobalExceptionFilter } from '../common/errors/global-exception.filter';
import { ResponseEnvelopeInterceptor } from '../common/interceptors/response-envelope.interceptor';
import { getEnvironmentFilePaths, validateEnvironment } from '../config/environment';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: getEnvironmentFilePaths(),
      isGlobal: true,
      validate: validateEnvironment,
    }),
    HealthModule,
  ],
  providers: [GlobalExceptionFilter, ResponseEnvelopeInterceptor],
})
export class AppModule {}
