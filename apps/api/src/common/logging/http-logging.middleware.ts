import { Logger } from '@nestjs/common';
import type { NextFunction, Request } from 'express';

import { getOrCreateRequestId, type ApiResponse } from '../request-context/request-context';

const httpLogger = new Logger('HttpRequest');

export function httpLoggingMiddleware(
  request: Request,
  response: ApiResponse,
  next: NextFunction,
): void {
  const startedAt = performance.now();

  response.once('finish', () => {
    const statusCode = response.statusCode;
    const logRecord = {
      event: 'http_request_completed',
      requestId: getOrCreateRequestId(response),
      method: request.method,
      path: request.path,
      statusCode,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    };

    if (statusCode >= 500) {
      httpLogger.error(logRecord);
    } else if (statusCode >= 400) {
      httpLogger.warn(logRecord);
    } else {
      httpLogger.log(logRecord);
    }
  });

  next();
}
