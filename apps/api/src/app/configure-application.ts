import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

import { GlobalExceptionFilter } from '../common/errors/global-exception.filter';
import { ResponseEnvelopeInterceptor } from '../common/interceptors/response-envelope.interceptor';
import { httpLoggingMiddleware } from '../common/logging/http-logging.middleware';
import { requestIdMiddleware } from '../common/request-context/request-id.middleware';
import { createGlobalValidationPipe } from '../common/validation/global-validation.pipe';
import { type EnvironmentVariables, REQUEST_BODY_LIMIT_BYTES } from '../config/environment';

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
  app.use(cookieParser());
  app.use('/api/v1/auth', (_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.enableCors({
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    credentials: true,
    exposedHeaders: ['X-Request-ID'],
    maxAge: 600,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin: [...allowedOrigins],
  });

  app.useBodyParser('json', {
    limit: REQUEST_BODY_LIMIT_BYTES,
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

  if (nodeEnvironment !== 'production' && config.getOrThrow('OPENAPI_ENABLED', { infer: true })) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('BichoCoin API')
        .setDescription('BichoCoin authenticated application API')
        .setVersion('1.0')
        .addCookieAuth(
          config.getOrThrow('AUTH_ACCESS_COOKIE_NAME', { infer: true }),
          { type: 'apiKey', in: 'cookie' },
          'accessCookie',
        )
        .addCookieAuth(
          config.getOrThrow('AUTH_REFRESH_COOKIE_NAME', { infer: true }),
          { type: 'apiKey', in: 'cookie' },
          'refreshCookie',
        )
        .addCookieAuth(
          config.getOrThrow('AUTH_CSRF_COOKIE_NAME', { infer: true }),
          { type: 'apiKey', in: 'cookie' },
          'csrfNonceCookie',
        )
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs-json',
      swaggerOptions: { persistAuthorization: false, supportedSubmitMethods: [] },
    });
  }
}
