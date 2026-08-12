import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { UserRole, UserStatus } from '../../generated/prisma/enums';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AccessTokenService } from '../application/access-token.service';
import type { AuthCookieService } from '../infrastructure/auth-cookie.service';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';

describe('authorization guards', () => {
  const principal = {
    userId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    role: UserRole.USER,
    email: 'player@example.com',
    username: 'Player',
  };

  it('allows configured roles and denies a mismatched role', () => {
    const request = { user: principal };
    const context = httpContext(request);
    const getAllAndOverride = jest.fn().mockReturnValue([UserRole.USER]);
    const reflector = {
      getAllAndOverride,
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(context)).toBe(true);
    getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    expect(() => guard.canActivate(context)).toThrow('Access is denied.');
  });

  it('propagates database outages instead of disguising them as authentication failures', async () => {
    const databaseError = new Error('database unavailable');
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const cookies = { getAccessToken: jest.fn().mockReturnValue('jwt') } as unknown as AuthCookieService;
    const tokens = {
      verify: jest.fn().mockResolvedValue({
        sub: principal.userId,
        sid: principal.sessionId,
        jti: crypto.randomUUID(),
      }),
    } as unknown as AccessTokenService;
    const prisma = {
      authSession: { findFirst: jest.fn().mockRejectedValue(databaseError) },
    } as unknown as PrismaService;
    const guard = new AuthGuard(reflector, cookies, tokens, prisma);

    await expect(guard.canActivate(httpContext({}))).rejects.toBe(databaseError);
  });

  it('uses the current database role and state for the authenticated principal', async () => {
    const request: { user?: unknown } = {};
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const cookies = { getAccessToken: jest.fn().mockReturnValue('jwt') } as unknown as AuthCookieService;
    const tokens = {
      verify: jest.fn().mockResolvedValue({
        sub: principal.userId,
        sid: principal.sessionId,
        jti: crypto.randomUUID(),
      }),
    } as unknown as AccessTokenService;
    const prisma = {
      authSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: principal.sessionId,
          userId: principal.userId,
          user: {
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
            email: principal.email,
            username: principal.username,
          },
        }),
      },
    } as unknown as PrismaService;
    const guard = new AuthGuard(reflector, cookies, tokens, prisma);

    await expect(guard.canActivate(httpContext(request))).resolves.toBe(true);
    expect(request.user).toMatchObject({ role: UserRole.ADMIN });
  });
});

function httpContext(request: object): ExecutionContext {
  return {
    getClass: () => class TestController {},
    getHandler: () => () => undefined,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}
