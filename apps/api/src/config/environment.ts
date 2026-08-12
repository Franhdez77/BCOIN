import { resolve } from 'node:path';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  API_PORT: number;
  DATABASE_URL: string;
  CORS_ALLOWED_ORIGINS: string[];
}

export const REQUEST_BODY_LIMIT_BYTES = 100 * 1024;

const DEFAULT_API_PORT = 3001;
const LOCAL_WEB_ORIGIN = 'http://localhost:3000';

export function getEnvironmentFilePaths(): string[] {
  return [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
}

export function validateEnvironment(
  input: Record<string, unknown>,
): Record<string, unknown> & EnvironmentVariables {
  const nodeEnvironment = parseNodeEnvironment(input.NODE_ENV);
  const databaseUrl = parseDatabaseUrl(input.DATABASE_URL);

  return {
    ...input,
    NODE_ENV: nodeEnvironment,
    API_PORT: parsePort(input.API_PORT),
    DATABASE_URL: databaseUrl,
    CORS_ALLOWED_ORIGINS: parseCorsOrigins(input.CORS_ALLOWED_ORIGINS, nodeEnvironment),
  };
}

function parseNodeEnvironment(value: unknown): NodeEnvironment {
  if (value === undefined || value === '') {
    return 'development';
  }

  if (value === 'development' || value === 'test' || value === 'production') {
    return value;
  }

  throw new Error('NODE_ENV must be one of: development, test, or production.');
}

function parsePort(value: unknown): number {
  if (value === undefined || value === '') {
    return DEFAULT_API_PORT;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error('API_PORT must be an integer between 1 and 65535.');
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('API_PORT must be an integer between 1 and 65535.');
  }

  return port;
}

function parseDatabaseUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('DATABASE_URL is required.');
  }

  const databaseUrl = value.trim();
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }

  if (
    (parsedUrl.protocol !== 'postgresql:' && parsedUrl.protocol !== 'postgres:') ||
    parsedUrl.hostname === '' ||
    parsedUrl.pathname === '' ||
    parsedUrl.pathname === '/'
  ) {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }

  return databaseUrl;
}

function parseCorsOrigins(value: unknown, nodeEnvironment: NodeEnvironment): string[] {
  if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
    if (nodeEnvironment === 'production') {
      throw new Error('CORS_ALLOWED_ORIGINS is required in production.');
    }

    return [LOCAL_WEB_ORIGIN];
  }

  if (typeof value !== 'string') {
    throw new Error('CORS_ALLOWED_ORIGINS must be a comma-separated list of HTTP origins.');
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0 || origins.includes('*')) {
    throw new Error(
      'CORS_ALLOWED_ORIGINS must contain explicit HTTP origins; wildcard is not allowed.',
    );
  }

  const validatedOrigins = origins.map(validateOrigin);
  return [...new Set(validatedOrigins)];
}

function validateOrigin(origin: string): string {
  let parsedOrigin: URL;

  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new Error('CORS_ALLOWED_ORIGINS must contain only valid HTTP origins.');
  }

  if (
    (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') ||
    parsedOrigin.origin !== origin
  ) {
    throw new Error('CORS_ALLOWED_ORIGINS must contain only valid HTTP origins.');
  }

  return parsedOrigin.origin;
}
