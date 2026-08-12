import {
  authApiRequest,
  clearAuthenticationClientState,
  type ApiRequestOptions,
} from '@/lib/api/client';

import type { AuthResult, AuthSession, AuthUser } from './contracts';

function withoutAuthenticationRetry(options: ApiRequestOptions): ApiRequestOptions {
  return { ...options, retryOnUnauthorized: false };
}

export const authApi = {
  register(input: { email: string; password: string; username: string }) {
    return authApiRequest<{ accepted: true }>(
      '/register',
      withoutAuthenticationRetry({ body: input, method: 'POST' }),
    );
  },

  login(input: { identifier: string; password: string }) {
    return authApiRequest<AuthResult>(
      '/login',
      withoutAuthenticationRetry({ body: input, method: 'POST' }),
    );
  },

  verifyEmail(token: string) {
    return authApiRequest<{ emailVerified: true }>(
      '/verify-email',
      withoutAuthenticationRetry({ body: { token }, method: 'POST' }),
    );
  },

  resendVerification(email: string) {
    return authApiRequest<{ accepted: true }>(
      '/resend-verification',
      withoutAuthenticationRetry({ body: { email }, method: 'POST' }),
    );
  },

  forgotPassword(email: string) {
    return authApiRequest<{ accepted: true }>(
      '/forgot-password',
      withoutAuthenticationRetry({ body: { email }, method: 'POST' }),
    );
  },

  resetPassword(input: { newPassword: string; token: string }) {
    return authApiRequest<{ passwordReset: true; csrfToken: string }>(
      '/reset-password',
      withoutAuthenticationRetry({ body: input, method: 'POST' }),
    );
  },

  me(signal?: AbortSignal) {
    return authApiRequest<{ user: AuthUser }>('/me', { signal });
  },

  sessions(signal?: AbortSignal) {
    return authApiRequest<{ sessions: AuthSession[] }>('/sessions', { signal });
  },

  async revokeSession(sessionId: string, endsCurrentSession = false) {
    const result = await authApiRequest<{ revoked: true }>(
      `/sessions/${encodeURIComponent(sessionId)}`,
      { method: 'DELETE' },
    );
    if (endsCurrentSession) {
      clearAuthenticationClientState();
    }
    return result;
  },

  async logout() {
    const result = await authApiRequest<{ csrfToken: string; loggedOut: true }>('/logout', {
      method: 'POST',
    });
    clearAuthenticationClientState();
    return result;
  },

  async logoutAll() {
    const result = await authApiRequest<{ csrfToken: string; loggedOut: true }>('/logout-all', {
      method: 'POST',
    });
    clearAuthenticationClientState();
    return result;
  },
};
