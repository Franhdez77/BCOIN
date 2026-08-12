import { randomUUID } from 'node:crypto';

import type { Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-ID';

export interface ApiResponseLocals {
  requestId?: string;
}

export type ApiResponse = Response<unknown, ApiResponseLocals>;

export function getOrCreateRequestId(response: ApiResponse): string {
  const existingRequestId = response.locals.requestId;
  if (existingRequestId !== undefined) {
    return existingRequestId;
  }

  const requestId = randomUUID();
  response.locals.requestId = requestId;

  if (!response.headersSent) {
    response.setHeader(REQUEST_ID_HEADER, requestId);
  }

  return requestId;
}
