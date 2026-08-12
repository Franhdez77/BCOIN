import type { NextFunction, Request } from 'express';

import { getOrCreateRequestId, type ApiResponse } from './request-context';

export function requestIdMiddleware(
  _request: Request,
  response: ApiResponse,
  next: NextFunction,
): void {
  getOrCreateRequestId(response);
  next();
}
