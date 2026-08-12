import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { createContentSecurityPolicy } from '@/lib/security/content-security-policy';

const developmentApiBaseUrl = 'http://localhost:3001';

function getApiOrigin(): string {
  const configuredValue = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const candidate = configuredValue || developmentApiBaseUrl;

  return new URL(candidate).origin;
}

function createNonce(): string {
  return Buffer.from(randomUUID()).toString('base64');
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = createNonce();
  const policy = createContentSecurityPolicy({
    apiOrigin: getApiOrigin(),
    isDevelopment: process.env.NODE_ENV === 'development',
    nonce,
  });
  const requestHeaders = new Headers(request.headers);

  // Next.js reads the request CSP to discover the nonce used for its generated assets.
  requestHeaders.set('Content-Security-Policy', policy);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
