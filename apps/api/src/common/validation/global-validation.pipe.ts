import { HttpStatus, ValidationPipe } from '@nestjs/common';

import { ApiHttpException } from '../errors/api-http.exception';

export function createGlobalValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    stopAtFirstError: false,
    transform: true,
    transformOptions: {
      enableImplicitConversion: false,
    },
    validationError: {
      target: false,
      value: false,
    },
    whitelist: true,
    exceptionFactory: () =>
      new ApiHttpException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Request validation failed.',
      ),
  });
}
