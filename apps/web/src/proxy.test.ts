/** @vitest-environment node */

import { unstable_doesMiddlewareMatch as doesProxyMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { config, proxy } from './proxy';

const nonceSourcePattern = /'nonce-([A-Za-z0-9+/_-]+={0,2})'/;

describe('CSP proxy', () => {
  it('sets one matching nonce on the rendered request and response', () => {
    const response = proxy(new NextRequest('https://app.bichocoin.test/login'));
    const responsePolicy = response.headers.get('Content-Security-Policy');
    const requestPolicy = response.headers.get('x-middleware-request-content-security-policy');
    const requestNonce = response.headers.get('x-middleware-request-x-nonce');
    const policyNonce = responsePolicy?.match(nonceSourcePattern)?.[1];

    expect(responsePolicy).toBeTruthy();
    expect(policyNonce).toBeTruthy();
    expect(requestPolicy).toBe(responsePolicy);
    expect(requestNonce).toBe(policyNonce);
    expect(responsePolicy).not.toContain("'unsafe-inline'");
    expect(responsePolicy).not.toContain("'unsafe-eval'");
  });

  it('generates an unpredictable nonce for every request', () => {
    const firstPolicy = proxy(new NextRequest('https://app.bichocoin.test/register')).headers.get(
      'Content-Security-Policy',
    );
    const secondPolicy = proxy(new NextRequest('https://app.bichocoin.test/register')).headers.get(
      'Content-Security-Policy',
    );

    expect(firstPolicy?.match(nonceSourcePattern)?.[1]).toBeTruthy();
    expect(firstPolicy?.match(nonceSourcePattern)?.[1]).not.toBe(
      secondPolicy?.match(nonceSourcePattern)?.[1],
    );
  });

  it('covers documents but skips framework assets and prefetches', () => {
    expect(doesProxyMatch({ config, nextConfig: {}, url: '/account' })).toBe(true);
    expect(
      doesProxyMatch({
        config,
        headers: { 'next-router-prefetch': '1' },
        nextConfig: {},
        url: '/account',
      }),
    ).toBe(false);
    expect(
      doesProxyMatch({
        config,
        nextConfig: {},
        url: '/_next/static/chunks/app.js',
      }),
    ).toBe(false);
  });
});
