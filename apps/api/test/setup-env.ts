import { resolve } from 'node:path';

import { config as loadEnvironmentFiles } from 'dotenv';

import { resolveAuthenticationTestDatabaseUrl } from './database-test-environment';

loadEnvironmentFiles({
  path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
  quiet: true,
});

if (process.env.RUN_DATABASE_TESTS === 'true') {
  process.env.DATABASE_URL = resolveAuthenticationTestDatabaseUrl(process.env);
}

process.env.NODE_ENV = 'test';
process.env.API_PORT = '3001';
process.env.DATABASE_URL ??=
  'postgresql://bichocoin_test:bichocoin_test@127.0.0.1:5432/bichocoin_test';
// HTTP assertions must be deterministic even when a developer changes local ports in .env.
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.JWT_SIGNING_SECRET = 'test-jwt-signing-secret-at-least-32-bytes';
process.env.CSRF_HMAC_SECRET = 'test-csrf-hmac-secret-at-least-32-bytes';
process.env.RATE_LIMIT_HMAC_SECRET = 'test-rate-limit-secret-at-least-32-bytes';
process.env.COOKIE_SECURE = 'false';
process.env.WEB_APP_BASE_URL = 'http://localhost:3000';
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '1025';
process.env.SMTP_SECURE = 'false';
process.env.SMTP_REQUIRE_TLS = 'false';
process.env.SMTP_FROM = 'noreply@bichocoin.local';
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';
process.env.OPENAPI_ENABLED = 'false';
// Functional suites exercise many auth requests; limiter policy itself has focused unit coverage.
process.env.AUTH_LOGIN_RATE_LIMIT_MAX = '1000';
process.env.AUTH_REGISTER_RATE_LIMIT_MAX = '1000';
process.env.AUTH_REFRESH_RATE_LIMIT_MAX = '1000';
process.env.AUTH_PASSWORD_RECOVERY_RATE_LIMIT_MAX = '1000';
process.env.AUTH_PASSWORD_RESET_RATE_LIMIT_MAX = '1000';
process.env.AUTH_EMAIL_VERIFICATION_RATE_LIMIT_MAX = '1000';
