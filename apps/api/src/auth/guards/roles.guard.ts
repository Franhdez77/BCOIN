import { CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { ApiHttpException } from '../../common/errors/api-http.exception';
import type { UserRole } from '../../generated/prisma/enums';
import { ROLES_KEY } from '../domain/auth.constants';
import type { AuthenticatedPrincipal } from '../domain/auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles === undefined || roles.length === 0) return true;
    const principal = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedPrincipal }>().user;
    if (principal === undefined || !roles.includes(principal.role)) {
      throw new ApiHttpException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Access is denied.');
    }
    return true;
  }
}

