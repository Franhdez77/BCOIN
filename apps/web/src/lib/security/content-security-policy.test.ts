import { describe, expect, it } from 'vitest';

import { createContentSecurityPolicy } from './content-security-policy';

const nonce = 'fixed-test-nonce_123';
const apiOrigin = 'https://api.bichocoin.test';

describe('createContentSecurityPolicy', () => {
  it('creates a strict production policy without unsafe inline execution', () => {
    const policy = createContentSecurityPolicy({
      apiOrigin,
      isDevelopment: false,
      nonce,
    });

    expect(policy).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(policy).toContain(`style-src 'self' 'nonce-${nonce}'`);
    expect(policy).toContain(`connect-src 'self' ${apiOrigin}`);
    expect(policy).toContain('upgrade-insecure-requests');
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain('ws:');
  });

  it('keeps only the development allowances required by Next.js', () => {
    const policy = createContentSecurityPolicy({
      apiOrigin: 'http://localhost:3001',
      isDevelopment: true,
      nonce,
    });

    expect(policy).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`);
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("connect-src 'self' http://localhost:3001 ws: wss:");
    expect(policy).not.toContain('upgrade-insecure-requests');
  });

  it('rejects values that could inject another CSP directive', () => {
    expect(() =>
      createContentSecurityPolicy({
        apiOrigin,
        isDevelopment: false,
        nonce: "nonce'; script-src *",
      }),
    ).toThrow('The CSP nonce contains unsupported characters.');
  });
});
