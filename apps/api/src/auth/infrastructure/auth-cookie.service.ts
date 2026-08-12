import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

import type { EnvironmentVariables } from '../../config/environment';
import {
  AUTH_ACCESS_COOKIE_PATH,
  AUTH_CSRF_COOKIE_PATH,
  AUTH_REFRESH_COOKIE_PATH,
  CSRF_TOKEN_TTL_SECONDS,
} from '../domain/auth.constants';

interface CsrfPayload {
  nonce: string;
  expiresAt: number;
}

@Injectable()
export class AuthCookieService {
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  issueCsrf(response: Response): string {
    const nonce = randomBytes(32).toString('base64url');
    const expiresAt = Math.floor(Date.now() / 1_000) + CSRF_TOKEN_TTL_SECONDS;
    response.cookie(this.config.getOrThrow('AUTH_CSRF_COOKIE_NAME', { infer: true }), nonce, {
      ...this.baseCookieOptions(AUTH_CSRF_COOKIE_PATH),
      maxAge: CSRF_TOKEN_TTL_SECONDS * 1_000,
    });
    const payload = Buffer.from(JSON.stringify({ nonce, expiresAt } satisfies CsrfPayload)).toString(
      'base64url',
    );
    return `${payload}.${this.sign(payload)}`;
  }

  validateCsrf(request: Request, token: string): boolean {
    const separator = token.lastIndexOf('.');
    if (separator < 1) return false;
    const payload = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    const expected = this.sign(payload);
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) return false;

    try {
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
      if (!isCsrfPayload(decoded) || decoded.expiresAt < Math.floor(Date.now() / 1_000)) return false;
      const nonce = request.cookies[
        this.config.getOrThrow('AUTH_CSRF_COOKIE_NAME', { infer: true })
      ] as unknown;
      if (typeof nonce !== 'string') return false;
      const receivedNonce = Buffer.from(nonce);
      const expectedNonce = Buffer.from(decoded.nonce);
      return (
        receivedNonce.length === expectedNonce.length &&
        timingSafeEqual(receivedNonce, expectedNonce)
      );
    } catch {
      return false;
    }
  }

  setAuthenticationCookies(
    response: Response,
    access: string,
    refresh: string,
    refreshExpiresAt: Date,
  ): void {
    response.cookie(this.config.getOrThrow('AUTH_ACCESS_COOKIE_NAME', { infer: true }), access, {
      ...this.baseCookieOptions(AUTH_ACCESS_COOKIE_PATH),
      maxAge: this.config.getOrThrow('ACCESS_TOKEN_TTL_SECONDS', { infer: true }) * 1_000,
    });
    response.cookie(this.config.getOrThrow('AUTH_REFRESH_COOKIE_NAME', { infer: true }), refresh, {
      ...this.baseCookieOptions(AUTH_REFRESH_COOKIE_PATH),
      maxAge: Math.max(0, refreshExpiresAt.getTime() - Date.now()),
    });
  }

  clearAuthenticationCookies(response: Response): void {
    response.clearCookie(
      this.config.getOrThrow('AUTH_ACCESS_COOKIE_NAME', { infer: true }),
      this.baseCookieOptions(AUTH_ACCESS_COOKIE_PATH),
    );
    response.clearCookie(
      this.config.getOrThrow('AUTH_REFRESH_COOKIE_NAME', { infer: true }),
      this.baseCookieOptions(AUTH_REFRESH_COOKIE_PATH),
    );
  }

  getAccessToken(request: Request): string | undefined {
    const value = request.cookies[
      this.config.getOrThrow('AUTH_ACCESS_COOKIE_NAME', { infer: true })
    ] as unknown;
    return typeof value === 'string' ? value : undefined;
  }

  getRefreshToken(request: Request): string | undefined {
    const value = request.cookies[
      this.config.getOrThrow('AUTH_REFRESH_COOKIE_NAME', { infer: true })
    ] as unknown;
    return typeof value === 'string' ? value : undefined;
  }

  private baseCookieOptions(path: string): CookieOptions {
    return {
      httpOnly: true,
      path,
      sameSite: 'strict',
      secure: this.config.getOrThrow('COOKIE_SECURE', { infer: true }),
    };
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.config.getOrThrow('CSRF_HMAC_SECRET', { infer: true }))
      .update(payload, 'utf8')
      .digest('base64url');
  }
}

function isCsrfPayload(value: unknown): value is CsrfPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'nonce' in value &&
    typeof value.nonce === 'string' &&
    'expiresAt' in value &&
    typeof value.expiresAt === 'number'
  );
}
