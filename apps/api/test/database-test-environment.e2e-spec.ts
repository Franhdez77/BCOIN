import { resolveAuthenticationTestDatabaseUrl } from './database-test-environment';

describe('authentication database test isolation', () => {
  const base: NodeJS.ProcessEnv = {
    DATABASE_URL: 'postgresql://dev:dev@localhost:5432/bichocoin',
  };

  it('accepts a separate loopback database ending in _test', () => {
    expect(
      resolveAuthenticationTestDatabaseUrl({
        ...base,
        AUTH_TEST_DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/bichocoin_auth_test',
      }),
    ).toContain('bichocoin_auth_test');
  });

  it.each([
    undefined,
    'postgresql://prod:secret@db.example.com/bichocoin_auth_test',
    'postgresql://dev:dev@localhost:5432/bichocoin',
    'postgresql://dev:dev@localhost:5432/bichocoin_staging',
    'mysql://test:test@localhost:3306/bichocoin_auth_test',
    'postgresql://test:test@localhost:5432/bichocoin_auth_test?host=evil.example.com',
    'postgresql://test:test@localhost:5432/bichocoin_auth_test?hostaddr=203.0.113.1',
  ])('rejects unsafe test database destination %s', (testUrl) => {
    expect(() =>
      resolveAuthenticationTestDatabaseUrl({ ...base, AUTH_TEST_DATABASE_URL: testUrl }),
    ).toThrow();
  });

  it('rejects reusing the configured development URL even if its name ends in _test', () => {
    const url = 'postgresql://test:test@localhost:5432/bichocoin_auth_test';
    expect(() =>
      resolveAuthenticationTestDatabaseUrl({ DATABASE_URL: url, AUTH_TEST_DATABASE_URL: url }),
    ).toThrow('must not target the DATABASE_URL database');
  });

  it('rejects the same destination disguised with loopback aliases or credentials', () => {
    expect(() =>
      resolveAuthenticationTestDatabaseUrl({
        DATABASE_URL: 'postgresql://dev:dev@localhost:5432/bichocoin_auth_test',
        AUTH_TEST_DATABASE_URL:
          'postgresql://other:other@127.0.0.1:5432/bichocoin_auth_test?schema=public',
      }),
    ).toThrow('must not target the DATABASE_URL database');
  });
});
