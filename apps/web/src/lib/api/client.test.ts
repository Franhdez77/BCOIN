import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authApiRequest, clearAuthenticationClientState } from './client';

function successResponse(data: unknown, requestId = 'request-success'): Response {
  return new Response(JSON.stringify({ data, requestId, success: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

function errorResponse(code: string, status: number, requestId = 'request-error'): Response {
  return new Response(
    JSON.stringify({
      error: { code, message: 'This server message must not be displayed directly.' },
      requestId,
      success: false,
    }),
    { headers: { 'Content-Type': 'application/json' }, status },
  );
}

describe('auth API client', () => {
  beforeEach(() => {
    clearAuthenticationClientState();
  });

  afterEach(() => {
    clearAuthenticationClientState();
    vi.unstubAllGlobals();
  });

  it('bootstraps CSRF in memory and includes credentials on unsafe requests', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(successResponse({ csrfToken: 'csrf-one' }))
      .mockResolvedValueOnce(successResponse({ accepted: true }));
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    vi.stubGlobal('fetch', fetchMock);

    await authApiRequest('/register', {
      body: { email: 'fan@example.com', password: 'a-safe-password', username: 'fan' },
      method: 'POST',
      retryOnUnauthorized: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [csrfUrl, csrfOptions] = fetchMock.mock.calls[0]!;
    const [registerUrl, registerOptions] = fetchMock.mock.calls[1]!;
    expect(String(csrfUrl)).toBe('http://localhost:3001/api/v1/auth/csrf');
    expect(csrfOptions?.credentials).toBe('include');
    expect(String(registerUrl)).toBe('http://localhost:3001/api/v1/auth/register');
    expect(registerOptions?.credentials).toBe('include');
    expect(new Headers(registerOptions?.headers).get('X-CSRF-Token')).toBe('csrf-one');
    expect(storageSpy).not.toHaveBeenCalled();
  });

  it('single-flights a cold CSRF bootstrap across concurrent unsafe requests', async () => {
    let resolveCsrf!: (response: Response) => void;
    const pendingCsrf = new Promise<Response>((resolve) => {
      resolveCsrf = resolve;
    });
    let csrfRequests = 0;
    let mutationRequests = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, options) => {
      if (String(input).endsWith('/csrf')) {
        csrfRequests += 1;
        return pendingCsrf;
      }

      mutationRequests += 1;
      expect(new Headers(options?.headers).get('X-CSRF-Token')).toBe('csrf-shared');
      return successResponse({ accepted: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = authApiRequest('/register', {
      body: { email: 'first@example.com' },
      method: 'POST',
      retryOnUnauthorized: false,
    });
    const second = authApiRequest('/forgot-password', {
      body: { email: 'second@example.com' },
      method: 'POST',
      retryOnUnauthorized: false,
    });

    expect(csrfRequests).toBe(1);
    resolveCsrf(successResponse({ csrfToken: 'csrf-shared' }));
    await Promise.all([first, second]);

    expect(csrfRequests).toBe(1);
    expect(mutationRequests).toBe(2);
  });

  it('re-bootstraps CSRF and retries one rejected unsafe request exactly once', async () => {
    let csrfRequests = 0;
    let mutationRequests = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, options) => {
      if (String(input).endsWith('/csrf')) {
        csrfRequests += 1;
        return successResponse({ csrfToken: `csrf-${csrfRequests}` });
      }

      mutationRequests += 1;
      const sentToken = new Headers(options?.headers).get('X-CSRF-Token');
      if (mutationRequests === 1) {
        expect(sentToken).toBe('csrf-1');
        return errorResponse('CSRF_VALIDATION_FAILED', 403);
      }

      expect(sentToken).toBe('csrf-2');
      return successResponse({ accepted: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    await authApiRequest('/forgot-password', {
      body: { email: 'fan@example.com' },
      method: 'POST',
      retryOnUnauthorized: false,
    });

    expect(csrfRequests).toBe(2);
    expect(mutationRequests).toBe(2);
  });

  it('uses one single-flight refresh and retries each concurrent 401 only once', async () => {
    let csrfRequests = 0;
    let meRequests = 0;
    let refreshRequests = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);

      if (url.endsWith('/me')) {
        meRequests += 1;
        return meRequests <= 2
          ? errorResponse('SESSION_INVALID', 401)
          : successResponse({ user: { id: `user-${meRequests}` } });
      }

      if (url.endsWith('/csrf')) {
        csrfRequests += 1;
        return successResponse({ csrfToken: 'csrf-before-refresh' });
      }

      if (url.endsWith('/refresh')) {
        refreshRequests += 1;
        return successResponse({ accessExpiresAt: '2030-01-01T00:00:00Z', csrfToken: 'csrf-new' });
      }

      return errorResponse('NOT_FOUND', 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await Promise.all([
      authApiRequest<{ user: { id: string } }>('/me'),
      authApiRequest<{ user: { id: string } }>('/me'),
    ]);

    expect(results).toHaveLength(2);
    expect(csrfRequests).toBe(1);
    expect(refreshRequests).toBe(1);
    expect(meRequests).toBe(4);
  });

  it('recovers stale CSRF once while refreshing an expired session', async () => {
    let csrfRequests = 0;
    let loginRequests = 0;
    let meRequests = 0;
    let refreshRequests = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, options) => {
      const url = String(input);

      if (url.endsWith('/csrf')) {
        csrfRequests += 1;
        return successResponse({ csrfToken: `csrf-${csrfRequests}` });
      }

      if (url.endsWith('/login')) {
        loginRequests += 1;
        return successResponse({ user: { id: 'user-1' } });
      }

      if (url.endsWith('/me')) {
        meRequests += 1;
        return meRequests === 1
          ? errorResponse('AUTHENTICATION_REQUIRED', 401)
          : successResponse({ user: { id: 'user-1' } });
      }

      if (url.endsWith('/refresh')) {
        refreshRequests += 1;
        const sentToken = new Headers(options?.headers).get('X-CSRF-Token');
        if (refreshRequests === 1) {
          expect(sentToken).toBe('csrf-1');
          return errorResponse('CSRF_VALIDATION_FAILED', 403);
        }
        expect(sentToken).toBe('csrf-2');
        return successResponse({ csrfToken: 'csrf-refreshed' });
      }

      return errorResponse('NOT_FOUND', 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    await authApiRequest('/login', {
      body: { identifier: 'fan', password: 'a-safe-password' },
      method: 'POST',
      retryOnUnauthorized: false,
    });
    await authApiRequest('/me');

    expect(csrfRequests).toBe(2);
    expect(loginRequests).toBe(1);
    expect(meRequests).toBe(2);
    expect(refreshRequests).toBe(2);
  });

  it('does not loop after a failed refresh and clears the stale CSRF token', async () => {
    let csrfRequests = 0;
    let loginRequests = 0;
    let meRequests = 0;
    let refreshRequests = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);

      if (url.endsWith('/me')) {
        meRequests += 1;
        return errorResponse('SESSION_INVALID', 401);
      }

      if (url.endsWith('/csrf')) {
        csrfRequests += 1;
        return successResponse({ csrfToken: `csrf-${csrfRequests}` });
      }

      if (url.endsWith('/refresh')) {
        refreshRequests += 1;
        return errorResponse('SESSION_INVALID', 401);
      }

      if (url.endsWith('/login')) {
        loginRequests += 1;
        return successResponse({ csrfToken: 'csrf-login', user: { id: 'user-1' } });
      }

      return errorResponse('NOT_FOUND', 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(authApiRequest('/me')).rejects.toMatchObject({
      code: 'SESSION_INVALID',
      status: 401,
    });
    await authApiRequest('/login', {
      body: { identifier: 'fan', password: 'a-safe-password' },
      method: 'POST',
      retryOnUnauthorized: false,
    });

    expect(meRequests).toBe(1);
    expect(refreshRequests).toBe(1);
    expect(loginRequests).toBe(1);
    expect(csrfRequests).toBe(2);
  });

  it('rejects malformed envelopes without exposing response content', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ internal: 'sensitive detail' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(authApiRequest('/me', { retryOnUnauthorized: false })).rejects.toMatchObject({
      code: 'API_RESPONSE_INVALID',
      status: 500,
    });
  });
});
