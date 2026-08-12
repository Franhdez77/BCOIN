import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';

import { getOrCreateRequestId, type ApiResponse } from '../request-context/request-context';
import { ApiHttpException } from './api-http.exception';

interface SafeErrorDescription {
  code: string;
  message: string;
}

const MINIMUM_ERROR_STATUS = 400;
const INTERNAL_SERVER_ERROR_STATUS = 500;
const MAXIMUM_HTTP_STATUS = 599;

const SAFE_HTTP_ERRORS: Partial<Record<number, SafeErrorDescription>> = {
  [HttpStatus.BAD_REQUEST]: {
    code: 'BAD_REQUEST',
    message: 'The request is invalid.',
  },
  [HttpStatus.UNAUTHORIZED]: {
    code: 'UNAUTHORIZED',
    message: 'Authentication is required.',
  },
  [HttpStatus.FORBIDDEN]: {
    code: 'FORBIDDEN',
    message: 'Access is denied.',
  },
  [HttpStatus.NOT_FOUND]: {
    code: 'NOT_FOUND',
    message: 'The requested resource was not found.',
  },
  [HttpStatus.METHOD_NOT_ALLOWED]: {
    code: 'METHOD_NOT_ALLOWED',
    message: 'The request method is not allowed.',
  },
  [HttpStatus.CONFLICT]: {
    code: 'CONFLICT',
    message: 'The request conflicts with the current state.',
  },
  [HttpStatus.PAYLOAD_TOO_LARGE]: {
    code: 'PAYLOAD_TOO_LARGE',
    message: 'The request body is too large.',
  },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    code: 'UNPROCESSABLE_ENTITY',
    message: 'The request could not be processed.',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many requests.',
  },
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    code: 'SERVICE_UNAVAILABLE',
    message: 'The service is temporarily unavailable.',
  },
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter<unknown> {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<ApiResponse>();

    if (response.headersSent) {
      return;
    }

    const statusCode = getStatusCode(exception);
    const safeError = getSafeError(exception, statusCode);
    const requestId = getOrCreateRequestId(response);

    if (statusCode >= INTERNAL_SERVER_ERROR_STATUS) {
      this.logger.error({
        event: 'http_request_failed',
        requestId,
        method: request.method,
        path: request.path,
        statusCode,
        errorType: getErrorType(exception),
      });
    }

    response.status(statusCode).json({
      success: false,
      error: safeError,
      requestId,
    });
  }
}

function getStatusCode(exception: unknown): number {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }

  if (typeof exception === 'object' && exception !== null) {
    const candidate = exception as { status?: unknown; statusCode?: unknown };
    const status = candidate.status ?? candidate.statusCode;

    if (
      typeof status === 'number' &&
      Number.isInteger(status) &&
      status >= MINIMUM_ERROR_STATUS &&
      status <= MAXIMUM_HTTP_STATUS
    ) {
      return status;
    }
  }

  return HttpStatus.INTERNAL_SERVER_ERROR;
}

function getSafeError(exception: unknown, statusCode: number): SafeErrorDescription {
  if (exception instanceof ApiHttpException) {
    return {
      code: exception.errorCode,
      message: exception.safeMessage,
    };
  }

  const knownError = SAFE_HTTP_ERRORS[statusCode];
  if (knownError !== undefined) {
    return knownError;
  }

  if (statusCode >= MINIMUM_ERROR_STATUS && statusCode < INTERNAL_SERVER_ERROR_STATUS) {
    return {
      code: 'REQUEST_FAILED',
      message: 'The request could not be completed.',
    };
  }

  return {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred.',
  };
}

function getErrorType(exception: unknown): string {
  return exception instanceof Error ? exception.name : 'UnknownError';
}
