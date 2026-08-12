import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app/app.module';
import { configureApplication } from './app/configure-application';
import type { EnvironmentVariables } from './config/environment';

const logger = new ConsoleLogger({
  colors: false,
  json: true,
});

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger,
  });

  configureApplication(app);
  app.enableShutdownHooks();

  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const port = config.getOrThrow('API_PORT', { infer: true });

  await app.listen(port, '0.0.0.0');
  logger.log({
    event: 'application_started',
    port,
  });
}

bootstrap().catch((error: unknown) => {
  logger.error({
    event: 'application_start_failed',
    errorType: error instanceof Error ? error.name : 'UnknownError',
  });
  process.exitCode = 1;
});
