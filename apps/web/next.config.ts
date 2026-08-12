import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(webDirectory, '../..');
const isProduction = process.env.NODE_ENV === 'production';

// Next.js normally scopes env loading to the app directory. The monorepo keeps
// its shared local configuration at the repository root, so load it explicitly.
loadEnvConfig(repositoryRoot, !isProduction, console, true);

const developmentApiBaseUrl = 'http://localhost:3001';

function getApiBaseUrl(): string {
  const configuredValue = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const candidate = configuredValue || (isProduction ? undefined : developmentApiBaseUrl);

  if (!candidate) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is required in production.');
  }

  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    throw new Error('NEXT_PUBLIC_API_BASE_URL must be a valid absolute URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_API_BASE_URL must use HTTP or HTTPS.');
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      'NEXT_PUBLIC_API_BASE_URL must not contain credentials, query parameters, or fragments.',
    );
  }

  return url.toString().replace(/\/$/, '');
}

const apiBaseUrl = getApiBaseUrl();
const apiOrigin = new URL(apiBaseUrl).origin;

function createContentSecurityPolicy(): string {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    isProduction
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    isProduction ? `connect-src 'self' ${apiOrigin}` : `connect-src 'self' ${apiOrigin} ws: wss:`,
    "manifest-src 'self'",
    "media-src 'self'",
    "worker-src 'self' blob:",
  ];

  if (isProduction) {
    directives.push('upgrade-insecure-requests');
  }

  return directives.join('; ');
}

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: createContentSecurityPolicy(),
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
];

if (isProduction) {
  securityHeaders.push({
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  });
}

const nextConfig = {
  agentRules: false,
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
} satisfies NextConfig;

export default nextConfig;
