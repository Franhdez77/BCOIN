export const AUTH_ACCESS_COOKIE_PATH = '/api/v1';
export const AUTH_REFRESH_COOKIE_PATH = '/api/v1/auth';
export const AUTH_CSRF_COOKIE_PATH = '/api/v1';
export const ACCESS_TOKEN_ALGORITHM = 'HS256' as const;
export const PASSWORD_MINIMUM_CHARACTERS = 12;
export const PASSWORD_MAXIMUM_CHARACTERS = 128;
export const PASSWORD_MAXIMUM_BYTES = 512;
export const TOKEN_SECRET_BYTES = 32;
export const CSRF_TOKEN_TTL_SECONDS = 3_600;
export const MAX_SESSIONS_PER_RESPONSE = 100;

export const PUBLIC_ROUTE_KEY = 'auth:is-public';
export const ROLES_KEY = 'auth:roles';
export const CSRF_EXEMPT_KEY = 'auth:csrf-exempt';
export const RATE_LIMIT_POLICY_KEY = 'auth:rate-limit-policy';
