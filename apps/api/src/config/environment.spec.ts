import { validateEnvironment } from './environment';

const VALID_ENVIRONMENT: Record<string, unknown> = {
  NODE_ENV: 'test',
  API_PORT: '3001',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/bichocoin_test',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000,https://app.example.com',
  JWT_SIGNING_SECRET: 'test-jwt-signing-secret-that-is-long-enough',
  CSRF_HMAC_SECRET: 'test-csrf-hmac-secret-that-is-long-enough',
  RATE_LIMIT_HMAC_SECRET: 'test-rate-limit-secret-that-is-long-enough',
};

const PRODUCTION_OVERRIDES: Record<string, unknown> = {
  NODE_ENV: 'production',
  COOKIE_SECURE: 'true',
  CORS_ALLOWED_ORIGINS: 'https://app.example.com',
  WEB_APP_BASE_URL: 'https://app.example.com',
  SMTP_REQUIRE_TLS: 'true',
  JWT_SIGNING_SECRET: 'prod-like-jwt-key-4zGLkkbK5pUP7sHN',
  CSRF_HMAC_SECRET: 'prod-like-csrf-key-RhG2Ttbx4j7aE6kD',
  RATE_LIMIT_HMAC_SECRET: 'prod-like-rate-key-A9qxCeP3F4vN8sLm',
};

describe('validateEnvironment', () => {
  it('validates and transforms supported values', () => {
    const environment = validateEnvironment(VALID_ENVIRONMENT);

    expect(environment).toMatchObject({
      NODE_ENV: 'test',
      API_PORT: 3001,
      DATABASE_URL: 'postgresql://user:password@localhost:5432/bichocoin_test',
      CORS_ALLOWED_ORIGINS: ['http://localhost:3000', 'https://app.example.com'],
      ACCESS_TOKEN_TTL_SECONDS: 600,
      REFRESH_TOKEN_TTL_SECONDS: 2_592_000,
      EMAIL_VERIFICATION_TTL_SECONDS: 86_400,
      PASSWORD_RESET_TTL_SECONDS: 3_600,
      MINING_DURATION_SECONDS: 86_400,
      MINING_REWARD_BIC: 100n,
      COOKIE_SECURE: false,
      AUTH_LOGIN_RATE_LIMIT_MAX: 10,
    });
  });

  it('parses explicit mining policy values and rejects invalid ones', () => {
    expect(
      validateEnvironment({
        ...VALID_ENVIRONMENT,
        MINING_DURATION_SECONDS: '3600',
        MINING_REWARD_BIC: '250',
      }),
    ).toMatchObject({ MINING_DURATION_SECONDS: 3600, MINING_REWARD_BIC: 250n });

    expect(() =>
      validateEnvironment({ ...VALID_ENVIRONMENT, MINING_DURATION_SECONDS: '0' }),
    ).toThrow('MINING_DURATION_SECONDS must be a positive integer');
    expect(() => validateEnvironment({ ...VALID_ENVIRONMENT, MINING_REWARD_BIC: '0' })).toThrow(
      'MINING_REWARD_BIC must fit in a positive PostgreSQL BIGINT.',
    );
    expect(() =>
      validateEnvironment({
        ...VALID_ENVIRONMENT,
        MINING_REWARD_BIC: '9223372036854775808',
      }),
    ).toThrow('MINING_REWARD_BIC must fit in a positive PostgreSQL BIGINT.');
  });

  it('fails clearly when DATABASE_URL is missing', () => {
    const environment = { ...VALID_ENVIRONMENT };
    delete environment.DATABASE_URL;

    expect(() => validateEnvironment(environment)).toThrow('DATABASE_URL is required.');
  });

  it('rejects non-PostgreSQL URLs without echoing their values', () => {
    const sensitiveUrl = 'mysql://user:super-secret@localhost:3306/database';

    expect(() =>
      validateEnvironment({
        ...VALID_ENVIRONMENT,
        DATABASE_URL: sensitiveUrl,
      }),
    ).toThrow('DATABASE_URL must be a valid PostgreSQL connection URL.');

    try {
      validateEnvironment({
        ...VALID_ENVIRONMENT,
        DATABASE_URL: sensitiveUrl,
      });
    } catch (error: unknown) {
      expect(String(error)).not.toContain('super-secret');
    }
  });

  it.each(['0', '65536', '3001x', '3.5'])('rejects invalid API_PORT %s', (port) => {
    expect(() => validateEnvironment({ ...VALID_ENVIRONMENT, API_PORT: port })).toThrow(
      'API_PORT must be an integer between 1 and 65535.',
    );
  });

  it('rejects a wildcard CORS origin', () => {
    expect(() =>
      validateEnvironment({
        ...VALID_ENVIRONMENT,
        CORS_ALLOWED_ORIGINS: '*',
      }),
    ).toThrow('CORS_ALLOWED_ORIGINS must contain explicit HTTP origins; wildcard is not allowed.');
  });

  it('requires an explicit CORS allowlist in production', () => {
    const environment: Record<string, unknown> = {
      ...VALID_ENVIRONMENT,
      ...PRODUCTION_OVERRIDES,
    };
    delete environment.CORS_ALLOWED_ORIGINS;

    expect(() => validateEnvironment(environment)).toThrow(
      'CORS_ALLOWED_ORIGINS is required in production.',
    );
  });

  it('uses the local web origin outside production when CORS is omitted', () => {
    const environment = { ...VALID_ENVIRONMENT };
    delete environment.CORS_ALLOWED_ORIGINS;

    expect(validateEnvironment(environment).CORS_ALLOWED_ORIGINS).toEqual([
      'http://localhost:3000',
    ]);
  });

  it('rejects origins containing a path', () => {
    expect(() =>
      validateEnvironment({
        ...VALID_ENVIRONMENT,
        CORS_ALLOWED_ORIGINS: 'https://app.example.com/path',
      }),
    ).toThrow('CORS_ALLOWED_ORIGINS must contain only valid HTTP origins.');
  });

  it('requires secure cookies in production', () => {
    expect(() =>
      validateEnvironment({
        ...VALID_ENVIRONMENT,
        ...PRODUCTION_OVERRIDES,
        COOKIE_SECURE: 'false',
      }),
    ).toThrow('COOKIE_SECURE must be true in production.');
  });

  it.each(['JWT_SIGNING_SECRET', 'CSRF_HMAC_SECRET', 'RATE_LIMIT_HMAC_SECRET'])(
    'requires a sufficiently long %s',
    (name) => {
      expect(() => validateEnvironment({ ...VALID_ENVIRONMENT, [name]: 'too-short' })).toThrow(
        `${name} must contain at least 32 UTF-8 bytes.`,
      );
    },
  );

  it('rejects incomplete SMTP credentials', () => {
    expect(() => validateEnvironment({ ...VALID_ENVIRONMENT, SMTP_USER: 'mailer' })).toThrow(
      'SMTP_USER and SMTP_PASSWORD must either both be set or both be empty.',
    );
  });

  it.each(['replace-with-a-real-secret', 'replace_with_secret', 'change-me-now', 'placeholder'])(
    'rejects production placeholder secret %s',
    (secret) => {
      expect(() =>
        validateEnvironment({
          ...VALID_ENVIRONMENT,
          ...PRODUCTION_OVERRIDES,
          JWT_SIGNING_SECRET: secret.padEnd(32, '-'),
        }),
      ).toThrow('JWT_SIGNING_SECRET must not use a placeholder value in production.');
    },
  );

  it('requires three distinct security secrets and cookie names', () => {
    expect(() =>
      validateEnvironment({
        ...VALID_ENVIRONMENT,
        CSRF_HMAC_SECRET: VALID_ENVIRONMENT.JWT_SIGNING_SECRET,
      }),
    ).toThrow('JWT, CSRF, and rate-limit secrets must be distinct.');
    expect(() =>
      validateEnvironment({
        ...VALID_ENVIRONMENT,
        AUTH_ACCESS_COOKIE_NAME: 'same',
        AUTH_REFRESH_COOKIE_NAME: 'same',
      }),
    ).toThrow('Authentication cookie names must be distinct.');
  });

  it('requires HTTPS web and CORS origins plus encrypted SMTP in production', () => {
    expect(() =>
      validateEnvironment({
        ...VALID_ENVIRONMENT,
        ...PRODUCTION_OVERRIDES,
        COOKIE_SECURE: 'false',
      }),
    ).toThrow('COOKIE_SECURE must be true in production.');
    expect(() =>
      validateEnvironment({
        ...VALID_ENVIRONMENT,
        ...PRODUCTION_OVERRIDES,
        WEB_APP_BASE_URL: 'http://app.example.com',
      }),
    ).toThrow('WEB_APP_BASE_URL must use HTTPS in production.');
    expect(() =>
      validateEnvironment({
        ...VALID_ENVIRONMENT,
        ...PRODUCTION_OVERRIDES,
        SMTP_REQUIRE_TLS: 'false',
      }),
    ).toThrow('SMTP_REQUIRE_TLS must be true in production when SMTP_SECURE is false.');
  });

  it.each(['0', '-1', '90000', 'not-a-number'])(
    'rejects invalid targeted rate settings %s',
    (value) => {
      expect(() =>
        validateEnvironment({ ...VALID_ENVIRONMENT, AUTH_LOGIN_RATE_LIMIT_MAX: value }),
      ).toThrow('AUTH_LOGIN_RATE_LIMIT_MAX must be a positive integer');
    },
  );
});
