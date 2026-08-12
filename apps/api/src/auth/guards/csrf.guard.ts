import { CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { ApiHttpException } from '../../common/errors/api-http.exception';
import type { EnvironmentVariables } from '../../config/environment';
import { CSRF_EXEMPT_KEY } from '../domain/auth.constants';
import { AuthCookieService } from '../infrastructure/auth-cookie.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALLOWED_FETCH_SITES = new Set(['same-origin', 'same-site', 'none']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cookies: AuthCookieService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      SAFE_METHODS.has(request.method) ||
      this.reflector.getAllAndOverride<boolean>(CSRF_EXEMPT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    ) {
      return true;
    }

    const origin = request.header('origin');
    const allowed = this.config.getOrThrow('CORS_ALLOWED_ORIGINS', { infer: true });
    const fetchSite = request.header('sec-fetch-site');
    const token = request.header('x-csrf-token');
    if (
      origin === undefined ||
      !allowed.includes(origin) ||
      (fetchSite !== undefined && !ALLOWED_FETCH_SITES.has(fetchSite)) ||
      token === undefined ||
      !this.cookies.validateCsrf(request, token)
    ) {
      throw new ApiHttpException(
        HttpStatus.FORBIDDEN,
        'CSRF_VALIDATION_FAILED',
        'The request could not be verified.',
      );
    }
    return true;
  }
}
