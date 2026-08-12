import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { getOrCreateRequestId, type ApiResponse } from '../request-context/request-context';

export interface ApiSuccessResponse<T> {
  success: true;
  data: T | null;
  requestId: string;
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor<
  unknown,
  ApiSuccessResponse<unknown>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<ApiSuccessResponse<unknown>> {
    const response = context.switchToHttp().getResponse<ApiResponse>();

    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        data: data ?? null,
        requestId: getOrCreateRequestId(response),
      })),
    );
  }
}
