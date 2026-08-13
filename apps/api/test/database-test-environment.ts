export function resolveAuthenticationTestDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  const value = environment.AUTH_TEST_DATABASE_URL?.trim();
  if (value === undefined || value === '') {
    throw new Error('AUTH_TEST_DATABASE_URL is required when RUN_DATABASE_TESTS=true.');
  }
  const destination = parseDestination(value);
  if (!destination.database.endsWith('_test')) {
    throw new Error(
      'AUTH_TEST_DATABASE_URL must target a loopback PostgreSQL database ending in _test.',
    );
  }
  const applicationUrl = environment.DATABASE_URL?.trim();
  if (applicationUrl !== undefined && applicationUrl !== '') {
    const application = parseDestination(applicationUrl);
    if (
      application.host === destination.host &&
      application.port === destination.port &&
      application.database === destination.database
    ) {
      throw new Error('AUTH_TEST_DATABASE_URL must not target the DATABASE_URL database.');
    }
  }
  return value;
}

interface DatabaseDestination {
  host: 'loopback';
  port: number;
  database: string;
}

function parseDestination(value: string): DatabaseDestination {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('AUTH_TEST_DATABASE_URL must be a valid PostgreSQL URL.');
  }
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  const allowedParameters = new Set(['schema', 'sslmode']);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !loopbackHosts.has(url.hostname) ||
    url.pathname === '/' ||
    [...url.searchParams.keys()].some((name) => !allowedParameters.has(name))
  ) {
    throw new Error(
      'AUTH_TEST_DATABASE_URL must target a loopback PostgreSQL database ending in _test.',
    );
  }
  let database: string;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error('AUTH_TEST_DATABASE_URL contains an invalid database name.');
  }
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error('AUTH_TEST_DATABASE_URL contains an invalid database name.');
  }
  const port = url.port === '' ? 5_432 : Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('AUTH_TEST_DATABASE_URL contains an invalid port.');
  }
  return { host: 'loopback', port, database };
}
