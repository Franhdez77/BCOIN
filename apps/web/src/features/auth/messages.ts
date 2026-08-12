import { ApiClientError } from '@/lib/api/client';

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  ACCOUNT_BANNED: 'This account is not available. Contact support if you need help.',
  ACCOUNT_SUSPENDED: 'This account is not available. Contact support if you need help.',
  API_CONFIGURATION_ERROR: 'The application is not configured correctly.',
  API_RESPONSE_INVALID: 'The service returned an unexpected response. Please try again.',
  API_UNAVAILABLE: 'The service is unavailable. Please try again.',
  CSRF_BOOTSTRAP_FAILED: 'The secure form could not be initialized. Please reload the page.',
  CSRF_VALIDATION_FAILED: 'Your secure form expired. Please reload the page and try again.',
  EMAIL_VERIFICATION_INVALID: 'This verification link is invalid or has expired.',
  EMAIL_VERIFICATION_REQUIRED: 'Verify your email before signing in.',
  AUTHENTICATION_REQUIRED: 'Your session has expired. Please sign in again.',
  INVALID_CREDENTIALS: 'The email, username, or password is incorrect.',
  INVALID_REFRESH_TOKEN: 'Your session has expired. Please sign in again.',
  PASSWORD_REJECTED: 'Choose a longer password that is difficult to guess.',
  PASSWORD_RESET_INVALID: 'This password reset link is invalid or has expired.',
  RATE_LIMIT_EXCEEDED: 'Too many attempts. Please wait before trying again.',
  REGISTRATION_CONFLICT: 'An account with those details cannot be created.',
  SESSION_INVALID: 'Your session has expired. Please sign in again.',
  TOO_MANY_REQUESTS: 'Too many attempts. Please wait before trying again.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
};

export interface SafeErrorMessage {
  message: string;
  requestId?: string;
}

export function getSafeErrorMessage(
  error: unknown,
  fallback = 'The request could not be completed. Please try again.',
): SafeErrorMessage {
  if (!(error instanceof ApiClientError)) {
    return { message: fallback };
  }

  return {
    message: ERROR_MESSAGES[error.code] ?? fallback,
    requestId: error.requestId,
  };
}

export function isExpiredSessionError(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.status === 401 ||
      error.code === 'AUTHENTICATION_REQUIRED' ||
      error.code === 'INVALID_REFRESH_TOKEN' ||
      error.code === 'SESSION_INVALID' ||
      error.code === 'UNAUTHORIZED')
  );
}
