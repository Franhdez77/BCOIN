import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import type { EnvironmentVariables } from '../../config/environment';
import { AuthCookieService } from './auth-cookie.service';

describe('AuthCookieService', () => {
  const config = new ConfigService<EnvironmentVariables, true>({
    ACCESS_TOKEN_TTL_SECONDS: 600,
    REFRESH_TOKEN_TTL_SECONDS: 2_592_000,
    AUTH_ACCESS_COOKIE_NAME: 'access',
    AUTH_REFRESH_COOKIE_NAME: 'refresh',
    AUTH_CSRF_COOKIE_NAME: 'csrf',
    COOKIE_SECURE: false,
    CSRF_HMAC_SECRET: 'test-csrf-hmac-secret-at-least-32-bytes',
  });
  const service = new AuthCookieService(config);

  it('issues a signed CSRF token bound to the HttpOnly nonce', () => {
    let nonce = '';
    const response = {
      cookie: jest.fn((name: string, value: string) => {
        if (name === 'csrf') nonce = value;
      }),
    } as unknown as Response;
    const token = service.issueCsrf(response);
    const request = { cookies: { csrf: nonce } } as unknown as Request;

    expect(service.validateCsrf(request, token)).toBe(true);
    expect(
      service.validateCsrf({ cookies: { csrf: `${nonce}x` } } as unknown as Request, token),
    ).toBe(false);
    expect(service.validateCsrf(request, `${token}x`)).toBe(false);
  });

  it('uses strict scoped HttpOnly cookies and never returns auth tokens in payloads', () => {
    const cookie = jest.fn();
    const response = { cookie } as unknown as Response;
    service.setAuthenticationCookies(
      response,
      'access-value',
      'refresh-value',
      new Date(Date.now() + 60_000),
    );

    expect(cookie).toHaveBeenNthCalledWith(
      1,
      'access',
      'access-value',
      expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/api/v1' }),
    );
    expect(cookie).toHaveBeenNthCalledWith(
      2,
      'refresh',
      'refresh-value',
      expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/api/v1/auth' }),
    );
  });
});
