import type { Request } from 'express';

import type { ApiResponse } from '../../common/request-context/request-context';
import { getOrCreateRequestId } from '../../common/request-context/request-context';

export interface RequestMetadata {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
}

export function getRequestMetadata(request: Request, response: ApiResponse): RequestMetadata {
  return {
    requestId: getOrCreateRequestId(response),
    ip: bounded(request.ip, 45),
    userAgent: bounded(request.header('user-agent'), 512),
  };
}

function bounded(value: string | undefined, maximum: number): string | null {
  if (value === undefined || value === '') return null;
  return value.slice(0, maximum);
}

