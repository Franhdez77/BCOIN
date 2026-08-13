import { CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { UserStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { invalidSession } from '../domain/auth-errors';
import { PUBLIC_ROUTE_KEY } from '../domain/auth.constants';
import type { AuthenticatedPrincipal } from '../domain/auth.types';
import { AccessTokenService } from '../application/access-token.service';
import { AuthCookieService } from '../infrastructure/auth-cookie.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cookies: AuthCookieService,
    private readonly tokens: AccessTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    ) {
      return true;
    }
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedPrincipal }>();
    const rawToken = this.cookies.getAccessToken(request);
    if (rawToken === undefined) throw invalidSession();
    let payload;
    try {
      payload = await this.tokens.verify(rawToken);
    } catch {
      throw invalidSession();
    }
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      typeof payload.jti !== 'string'
    ) {
      throw invalidSession();
    }
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: UserStatus.ACTIVE, emailVerifiedAt: { not: null } },
      },
      include: { user: true },
    });
    if (session === null) throw invalidSession();
    request.user = {
      userId: session.userId,
      sessionId: session.id,
      role: session.user.role,
      email: session.user.email,
      username: session.user.username,
    };
    return true;
  }
}
