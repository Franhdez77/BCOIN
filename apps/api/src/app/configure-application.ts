import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

import { GlobalExceptionFilter } from '../common/errors/global-exception.filter';
import { ResponseEnvelopeInterceptor } from '../common/interceptors/response-envelope.interceptor';
import { httpLoggingMiddleware } from '../common/logging/http-logging.middleware';
import { requestIdMiddleware } from '../common/request-context/request-id.middleware';
import { createGlobalValidationPipe } from '../common/validation/global-validation.pipe';
import { type EnvironmentVariables, REQUEST_BODY_LIMIT_BYTES } from '../config/environment';

const URL_ENCODED_PARAMETER_LIMIT = 100;

export function configureApplication(app: NestExpressApplication): void {
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const nodeEnvironment = config.getOrThrow('NODE_ENV', { infer: true });
  const allowedOrigins = config.getOrThrow('CORS_ALLOWED_ORIGINS', {
    infer: true,
  });

  app.use(requestIdMiddleware);
  app.use(
    helmet(
      nodeEnvironment === 'production'
        ? {}
        : {
            strictTransportSecurity: false,
          },
    ),
  );
  app.use(httpLoggingMiddleware);

  app.enableCors({
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: true,
    exposedHeaders: ['X-Request-ID'],
    maxAge: 600,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin: [...allowedOrigins],
  });

  app.useBodyParser('json', {
    limit: REQUEST_BODY_LIMIT_BYTES,
  });
  app.useBodyParser('urlencoded', {
    extended: false,
    limit: REQUEST_BODY_LIMIT_BYTES,
    parameterLimit: URL_ENCODED_PARAMETER_LIMIT,
  });

  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });

  app.useGlobalPipes(createGlobalValidationPipe());
  app.useGlobalInterceptors(app.get(ResponseEnvelopeInterceptor));
  app.useGlobalFilters(app.get(GlobalExceptionFilter));
}
