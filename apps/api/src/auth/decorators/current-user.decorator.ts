import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedPrincipal } from '../domain/auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedPrincipal }>();
    if (request.user === undefined) {
      throw new Error('Authenticated principal is missing.');
    }
    return request.user;
  },
);

