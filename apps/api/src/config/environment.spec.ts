import { validateEnvironment } from './environment';

const VALID_ENVIRONMENT: Record<string, unknown> = {
  NODE_ENV: 'test',
  API_PORT: '3001',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/bichocoin_test',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000,https://app.example.com',
};

describe('validateEnvironment', () => {
  it('validates and transforms supported values', () => {
    const environment = validateEnvironment(VALID_ENVIRONMENT);

    expect(environment).toMatchObject({
      NODE_ENV: 'test',
      API_PORT: 3001,
      DATABASE_URL: 'postgresql://user:password@localhost:5432/bichocoin_test',
      CORS_ALLOWED_ORIGINS: ['http://localhost:3000', 'https://app.example.com'],
    });
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
      NODE_ENV: 'production',
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
});
