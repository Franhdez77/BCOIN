const CSP_NONCE_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/;

interface ContentSecurityPolicyOptions {
  apiOrigin: string;
  isDevelopment: boolean;
  nonce: string;
}

export function createContentSecurityPolicy({
  apiOrigin,
  isDevelopment,
  nonce,
}: ContentSecurityPolicyOptions): string {
  if (!CSP_NONCE_PATTERN.test(nonce)) {
    throw new Error('The CSP nonce contains unsupported characters.');
  }

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    isDevelopment ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    isDevelopment ? `connect-src 'self' ${apiOrigin} ws: wss:` : `connect-src 'self' ${apiOrigin}`,
    "manifest-src 'self'",
    "media-src 'self'",
    "worker-src 'self' blob:",
  ];

  if (!isDevelopment) {
    directives.push('upgrade-insecure-requests');
  }

  return directives.join('; ');
}
