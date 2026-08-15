import { resolve } from 'node:path';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  API_PORT: number;
  DATABASE_URL: string;
  CORS_ALLOWED_ORIGINS: string[];
  JWT_SIGNING_SECRET: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  ACCESS_TOKEN_TTL_SECONDS: number;
  REFRESH_TOKEN_TTL_SECONDS: number;
  EMAIL_VERIFICATION_TTL_SECONDS: number;
  PASSWORD_RESET_TTL_SECONDS: number;
  MINING_DURATION_SECONDS: number;
  MINING_REWARD_BIC: bigint;
  CSRF_HMAC_SECRET: string;
  RATE_LIMIT_HMAC_SECRET: string;
  AUTH_ACCESS_COOKIE_NAME: string;
  AUTH_REFRESH_COOKIE_NAME: string;
  AUTH_CSRF_COOKIE_NAME: string;
  COOKIE_SECURE: boolean;
  WEB_APP_BASE_URL: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_REQUIRE_TLS: boolean;
  SMTP_FROM: string;
  SMTP_USER: string;
  SMTP_PASSWORD: string;
  OPENAPI_ENABLED: boolean;
  AUTH_LOGIN_RATE_LIMIT_MAX: number;
  AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: number;
  AUTH_REGISTER_RATE_LIMIT_MAX: number;
  AUTH_REGISTER_RATE_LIMIT_WINDOW_SECONDS: number;
  AUTH_REFRESH_RATE_LIMIT_MAX: number;
  AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS: number;
  AUTH_PASSWORD_RECOVERY_RATE_LIMIT_MAX: number;
  AUTH_PASSWORD_RECOVERY_RATE_LIMIT_WINDOW_SECONDS: number;
  AUTH_PASSWORD_RESET_RATE_LIMIT_MAX: number;
  AUTH_PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS: number;
  AUTH_EMAIL_VERIFICATION_RATE_LIMIT_MAX: number;
  AUTH_EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_SECONDS: number;
}

export const REQUEST_BODY_LIMIT_BYTES = 100 * 1024;

const DEFAULT_API_PORT = 3001;
const LOCAL_WEB_ORIGIN = 'http://localhost:3000';
const MINIMUM_SECRET_BYTES = 32;
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;

const DEFAULTS = {
  JWT_ISSUER: 'bichocoin-api',
  JWT_AUDIENCE: 'bichocoin-web',
  ACCESS_TOKEN_TTL_SECONDS: 600,
  REFRESH_TOKEN_TTL_SECONDS: 2_592_000,
  EMAIL_VERIFICATION_TTL_SECONDS: 86_400,
  PASSWORD_RESET_TTL_SECONDS: 3_600,
  MINING_DURATION_SECONDS: 86_400,
  MINING_REWARD_BIC: '100',
  AUTH_ACCESS_COOKIE_NAME: 'bichocoin_access',
  AUTH_REFRESH_COOKIE_NAME: 'bichocoin_refresh',
  AUTH_CSRF_COOKIE_NAME: 'bichocoin_csrf',
  SMTP_HOST: 'localhost',
  SMTP_PORT: 1025,
  SMTP_FROM: 'noreply@bichocoin.local',
  AUTH_LOGIN_RATE_LIMIT_MAX: 10,
  AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: 600,
  AUTH_REGISTER_RATE_LIMIT_MAX: 5,
  AUTH_REGISTER_RATE_LIMIT_WINDOW_SECONDS: 3_600,
  AUTH_REFRESH_RATE_LIMIT_MAX: 30,
  AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS: 60,
  AUTH_PASSWORD_RECOVERY_RATE_LIMIT_MAX: 5,
  AUTH_PASSWORD_RECOVERY_RATE_LIMIT_WINDOW_SECONDS: 3_600,
  AUTH_PASSWORD_RESET_RATE_LIMIT_MAX: 5,
  AUTH_PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS: 900,
  AUTH_EMAIL_VERIFICATION_RATE_LIMIT_MAX: 5,
  AUTH_EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_SECONDS: 3_600,
} as const;

export function getEnvironmentFilePaths(): string[] {
  return [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
}

export function validateEnvironment(
  input: Record<string, unknown>,
): Record<string, unknown> & EnvironmentVariables {
  const nodeEnvironment = parseNodeEnvironment(input.NODE_ENV);
  const databaseUrl = parseDatabaseUrl(input.DATABASE_URL);
  const secureCookies = parseBoolean(input.COOKIE_SECURE, false, 'COOKIE_SECURE');

  if (nodeEnvironment === 'production' && !secureCookies) {
    throw new Error('COOKIE_SECURE must be true in production.');
  }
  const smtpUser = parseOptionalString(input.SMTP_USER, 'SMTP_USER', 255);
  const smtpPassword = parseOptionalString(input.SMTP_PASSWORD, 'SMTP_PASSWORD', 1_024);
  const smtpSecure = parseBoolean(input.SMTP_SECURE, false, 'SMTP_SECURE');
  const smtpRequireTls = parseBoolean(input.SMTP_REQUIRE_TLS, false, 'SMTP_REQUIRE_TLS');
  if ((smtpUser === '') !== (smtpPassword === '')) {
    throw new Error('SMTP_USER and SMTP_PASSWORD must either both be set or both be empty.');
  }
  if (nodeEnvironment === 'production' && !smtpSecure && !smtpRequireTls) {
    throw new Error('SMTP_REQUIRE_TLS must be true in production when SMTP_SECURE is false.');
  }
  const jwtSecret = parseSecret(input.JWT_SIGNING_SECRET, 'JWT_SIGNING_SECRET', nodeEnvironment);
  const csrfSecret = parseSecret(input.CSRF_HMAC_SECRET, 'CSRF_HMAC_SECRET', nodeEnvironment);
  const rateSecret = parseSecret(
    input.RATE_LIMIT_HMAC_SECRET,
    'RATE_LIMIT_HMAC_SECRET',
    nodeEnvironment,
  );
  if (new Set([jwtSecret, csrfSecret, rateSecret]).size !== 3) {
    throw new Error('JWT, CSRF, and rate-limit secrets must be distinct.');
  }
  const accessCookieName = parseCookieName(
    input.AUTH_ACCESS_COOKIE_NAME,
    DEFAULTS.AUTH_ACCESS_COOKIE_NAME,
    'AUTH_ACCESS_COOKIE_NAME',
  );
  const refreshCookieName = parseCookieName(
    input.AUTH_REFRESH_COOKIE_NAME,
    DEFAULTS.AUTH_REFRESH_COOKIE_NAME,
    'AUTH_REFRESH_COOKIE_NAME',
  );
  const csrfCookieName = parseCookieName(
    input.AUTH_CSRF_COOKIE_NAME,
    DEFAULTS.AUTH_CSRF_COOKIE_NAME,
    'AUTH_CSRF_COOKIE_NAME',
  );
  if (new Set([accessCookieName, refreshCookieName, csrfCookieName]).size !== 3) {
    throw new Error('Authentication cookie names must be distinct.');
  }

  return {
    ...input,
    NODE_ENV: nodeEnvironment,
    API_PORT: parsePort(input.API_PORT),
    DATABASE_URL: databaseUrl,
    CORS_ALLOWED_ORIGINS: parseCorsOrigins(input.CORS_ALLOWED_ORIGINS, nodeEnvironment),
    JWT_SIGNING_SECRET: jwtSecret,
    JWT_ISSUER: parseBoundedString(input.JWT_ISSUER, DEFAULTS.JWT_ISSUER, 'JWT_ISSUER', 128),
    JWT_AUDIENCE: parseBoundedString(
      input.JWT_AUDIENCE,
      DEFAULTS.JWT_AUDIENCE,
      'JWT_AUDIENCE',
      128,
    ),
    ACCESS_TOKEN_TTL_SECONDS: parsePositiveInteger(
      input.ACCESS_TOKEN_TTL_SECONDS,
      DEFAULTS.ACCESS_TOKEN_TTL_SECONDS,
      'ACCESS_TOKEN_TTL_SECONDS',
      86_400,
    ),
    REFRESH_TOKEN_TTL_SECONDS: parsePositiveInteger(
      input.REFRESH_TOKEN_TTL_SECONDS,
      DEFAULTS.REFRESH_TOKEN_TTL_SECONDS,
      'REFRESH_TOKEN_TTL_SECONDS',
      31_536_000,
    ),
    EMAIL_VERIFICATION_TTL_SECONDS: parsePositiveInteger(
      input.EMAIL_VERIFICATION_TTL_SECONDS,
      DEFAULTS.EMAIL_VERIFICATION_TTL_SECONDS,
      'EMAIL_VERIFICATION_TTL_SECONDS',
      604_800,
    ),
    PASSWORD_RESET_TTL_SECONDS: parsePositiveInteger(
      input.PASSWORD_RESET_TTL_SECONDS,
      DEFAULTS.PASSWORD_RESET_TTL_SECONDS,
      'PASSWORD_RESET_TTL_SECONDS',
      86_400,
    ),
    MINING_DURATION_SECONDS: parsePositiveInteger(
      input.MINING_DURATION_SECONDS,
      DEFAULTS.MINING_DURATION_SECONDS,
      'MINING_DURATION_SECONDS',
      604_800,
    ),
    MINING_REWARD_BIC: parsePositiveBigInt(
      input.MINING_REWARD_BIC,
      DEFAULTS.MINING_REWARD_BIC,
      'MINING_REWARD_BIC',
    ),
    CSRF_HMAC_SECRET: csrfSecret,
    RATE_LIMIT_HMAC_SECRET: rateSecret,
    AUTH_ACCESS_COOKIE_NAME: accessCookieName,
    AUTH_REFRESH_COOKIE_NAME: refreshCookieName,
    AUTH_CSRF_COOKIE_NAME: csrfCookieName,
    COOKIE_SECURE: secureCookies,
    WEB_APP_BASE_URL: parseWebUrl(input.WEB_APP_BASE_URL, nodeEnvironment),
    SMTP_HOST: parseBoundedString(input.SMTP_HOST, DEFAULTS.SMTP_HOST, 'SMTP_HOST', 255),
    SMTP_PORT: parsePositiveInteger(input.SMTP_PORT, DEFAULTS.SMTP_PORT, 'SMTP_PORT', 65_535),
    SMTP_SECURE: smtpSecure,
    SMTP_REQUIRE_TLS: smtpRequireTls,
    SMTP_FROM: parseEmailLike(input.SMTP_FROM, DEFAULTS.SMTP_FROM, 'SMTP_FROM'),
    SMTP_USER: smtpUser,
    SMTP_PASSWORD: smtpPassword,
    OPENAPI_ENABLED: parseBoolean(input.OPENAPI_ENABLED, false, 'OPENAPI_ENABLED'),
    AUTH_LOGIN_RATE_LIMIT_MAX: parseRate(input, 'AUTH_LOGIN_RATE_LIMIT_MAX'),
    AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: parseRate(input, 'AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS'),
    AUTH_REGISTER_RATE_LIMIT_MAX: parseRate(input, 'AUTH_REGISTER_RATE_LIMIT_MAX'),
    AUTH_REGISTER_RATE_LIMIT_WINDOW_SECONDS: parseRate(
      input,
      'AUTH_REGISTER_RATE_LIMIT_WINDOW_SECONDS',
    ),
    AUTH_REFRESH_RATE_LIMIT_MAX: parseRate(input, 'AUTH_REFRESH_RATE_LIMIT_MAX'),
    AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS: parseRate(
      input,
      'AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS',
    ),
    AUTH_PASSWORD_RECOVERY_RATE_LIMIT_MAX: parseRate(
      input,
      'AUTH_PASSWORD_RECOVERY_RATE_LIMIT_MAX',
    ),
    AUTH_PASSWORD_RECOVERY_RATE_LIMIT_WINDOW_SECONDS: parseRate(
      input,
      'AUTH_PASSWORD_RECOVERY_RATE_LIMIT_WINDOW_SECONDS',
    ),
    AUTH_PASSWORD_RESET_RATE_LIMIT_MAX: parseRate(input, 'AUTH_PASSWORD_RESET_RATE_LIMIT_MAX'),
    AUTH_PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS: parseRate(
      input,
      'AUTH_PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS',
    ),
    AUTH_EMAIL_VERIFICATION_RATE_LIMIT_MAX: parseRate(
      input,
      'AUTH_EMAIL_VERIFICATION_RATE_LIMIT_MAX',
    ),
    AUTH_EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_SECONDS: parseRate(
      input,
      'AUTH_EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_SECONDS',
    ),
  };
}

type DefaultKey = keyof typeof DEFAULTS;

function parseRate(input: Record<string, unknown>, name: DefaultKey): number {
  return parsePositiveInteger(input[name], DEFAULTS[name] as number, name, 86_400);
}

function parsePositiveInteger(
  value: unknown,
  fallback: number,
  name: string,
  maximum: number,
): number {
  const candidate = value === undefined || value === '' ? String(fallback) : value;
  if (typeof candidate !== 'string' || !/^\d+$/.test(candidate)) {
    throw new Error(`${name} must be a positive integer.`);
  }
  const parsed = Number(candidate);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name} must be a positive integer no greater than ${maximum}.`);
  }
  return parsed;
}

function parsePositiveBigInt(value: unknown, fallback: string, name: string): bigint {
  const candidate = value === undefined || value === '' ? fallback : value;
  if (typeof candidate !== 'string' || !/^\d+$/.test(candidate)) {
    throw new Error(`${name} must be a positive whole number.`);
  }

  const parsed = BigInt(candidate);
  if (parsed < 1n || parsed > POSTGRES_BIGINT_MAX) {
    throw new Error(`${name} must fit in a positive PostgreSQL BIGINT.`);
  }
  return parsed;
}

function parseBoolean(value: unknown, fallback: boolean, name: string): boolean {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false.`);
}

function parseSecret(value: unknown, name: string, environment: NodeEnvironment): string {
  if (typeof value !== 'string' || Buffer.byteLength(value.trim(), 'utf8') < MINIMUM_SECRET_BYTES) {
    throw new Error(`${name} must contain at least ${MINIMUM_SECRET_BYTES} UTF-8 bytes.`);
  }
  const result = value.trim();
  if (
    environment === 'production' &&
    /^(change[-_ ]?me|replace([-_ ]?with)?([-_ ]?a)?|placeholder|development|test)([-_ ].*)?$/i.test(
      result,
    )
  ) {
    throw new Error(`${name} must not use a placeholder value in production.`);
  }
  return result;
}

function parseBoundedString(
  value: unknown,
  fallback: string,
  name: string,
  maximum: number,
): string {
  const result = value === undefined || value === '' ? fallback : value;
  if (typeof result !== 'string' || result.trim() === '' || result.length > maximum) {
    throw new Error(`${name} must be a non-empty string up to ${maximum} characters.`);
  }
  return result.trim();
}

function parseOptionalString(value: unknown, name: string, maximum: number): string {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > maximum) {
    throw new Error(`${name} must contain at most ${maximum} characters.`);
  }
  return value;
}

function parseEmailLike(value: unknown, fallback: string, name: string): string {
  const result = parseBoundedString(value, fallback, name, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
    throw new Error(`${name} must be a valid email address.`);
  }
  return result;
}

function parseCookieName(value: unknown, fallback: string, name: string): string {
  const result = parseBoundedString(value, fallback, name, 64);
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(result)) {
    throw new Error(`${name} must be a valid cookie name.`);
  }
  return result;
}

function parseWebUrl(value: unknown, environment: NodeEnvironment): string {
  if (environment === 'production' && (value === undefined || value === '')) {
    throw new Error('WEB_APP_BASE_URL is required in production.');
  }
  const candidate = parseBoundedString(value, LOCAL_WEB_ORIGIN, 'WEB_APP_BASE_URL', 2_048);
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('WEB_APP_BASE_URL must be a valid HTTP origin.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== candidate) {
    throw new Error('WEB_APP_BASE_URL must be a valid HTTP origin.');
  }
  if (environment === 'production' && parsed.protocol !== 'https:') {
    throw new Error('WEB_APP_BASE_URL must use HTTPS in production.');
  }
  return candidate;
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

  const validatedOrigins = origins.map((origin) => validateOrigin(origin, nodeEnvironment));
  return [...new Set(validatedOrigins)];
}

function validateOrigin(origin: string, nodeEnvironment: NodeEnvironment): string {
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
  if (nodeEnvironment === 'production' && parsedOrigin.protocol !== 'https:') {
    throw new Error('CORS_ALLOWED_ORIGINS must use HTTPS in production.');
  }

  return parsedOrigin.origin;
}
