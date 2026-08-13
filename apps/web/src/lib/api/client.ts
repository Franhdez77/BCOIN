const API_PREFIX = '/api/v1';
const AUTH_API_PREFIX = '/auth';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  requestId: string;
}

interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
  };
  requestId: string;
}

export interface ApiRequestOptions {
  body?: unknown;
  method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
  retryOnUnauthorized?: boolean;
  signal?: AbortSignal;
}

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(code);
    this.name = 'ApiClientError';
  }
}

let csrfToken: string | undefined;
let csrfBootstrapPromise: Promise<void> | undefined;
let refreshPromise: Promise<void> | undefined;

function getApiBaseUrl(): string {
  const configuredValue = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!configuredValue) {
    throw new ApiClientError('API_CONFIGURATION_ERROR', 0);
  }

  return configuredValue;
}

function buildApiUrl(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new ApiClientError('API_PATH_INVALID', 0);
  }

  return new URL(`${API_PREFIX}${path}`, getApiBaseUrl()).toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSuccessEnvelope<T>(value: unknown): value is ApiSuccessEnvelope<T> {
  return (
    isRecord(value) &&
    value.success === true &&
    'data' in value &&
    typeof value.requestId === 'string'
  );
}

function isErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  return (
    isRecord(value) &&
    value.success === false &&
    isRecord(value.error) &&
    typeof value.error.code === 'string' &&
    typeof value.error.message === 'string' &&
    typeof value.requestId === 'string'
  );
}

function captureCsrfToken(value: unknown): void {
  if (!isRecord(value)) {
    return;
  }

  const candidate = value.csrfToken;
  if (typeof candidate === 'string' && candidate.length > 0) {
    csrfToken = candidate;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new ApiClientError('API_RESPONSE_INVALID', response.status);
  }

  if (response.ok && isSuccessEnvelope<T>(payload)) {
    captureCsrfToken(payload.data);
    return payload.data;
  }

  if (isErrorEnvelope(payload)) {
    throw new ApiClientError(payload.error.code, response.status, payload.requestId);
  }

  throw new ApiClientError('API_RESPONSE_INVALID', response.status);
}

async function sendRequest<T>(path: string, options: ApiRequestOptions): Promise<T> {
  const method = options.method ?? 'GET';
  const headers = new Headers({ Accept: 'application/json' });

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  if (UNSAFE_METHODS.has(method)) {
    await ensureCsrfToken();
    if (csrfToken === undefined) {
      throw new ApiClientError('CSRF_BOOTSTRAP_FAILED', 0);
    }
    headers.set('X-CSRF-Token', csrfToken);
  }

  let response: Response;

  try {
    response = await fetch(buildApiUrl(path), {
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
      credentials: 'include',
      headers,
      method,
      signal: options.signal,
    });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    throw new ApiClientError('API_UNAVAILABLE', 0);
  }

  return parseResponse<T>(response);
}

async function ensureCsrfToken(): Promise<void> {
  if (csrfToken !== undefined) {
    return;
  }

  if (csrfBootstrapPromise === undefined) {
    csrfBootstrapPromise = sendRequest<{ csrfToken: string }>(`${AUTH_API_PREFIX}/csrf`, {
      method: 'GET',
      retryOnUnauthorized: false,
    })
      .then((data) => {
        if (!data.csrfToken) {
          throw new ApiClientError('CSRF_BOOTSTRAP_FAILED', 0);
        }
        csrfToken = data.csrfToken;
      })
      .finally(() => {
        csrfBootstrapPromise = undefined;
      });
  }

  return csrfBootstrapPromise;
}

async function sendWithCsrfRecovery<T>(path: string, options: ApiRequestOptions): Promise<T> {
  try {
    return await sendRequest<T>(path, options);
  } catch (error: unknown) {
    const method = options.method ?? 'GET';
    if (
      !(error instanceof ApiClientError) ||
      error.status !== 403 ||
      error.code !== 'CSRF_VALIDATION_FAILED' ||
      !UNSAFE_METHODS.has(method)
    ) {
      throw error;
    }

    csrfToken = undefined;
    await ensureCsrfToken();
    return sendRequest<T>(path, options);
  }
}

async function refreshSession(): Promise<void> {
  if (refreshPromise === undefined) {
    refreshPromise = sendWithCsrfRecovery<unknown>(`${AUTH_API_PREFIX}/refresh`, {
      method: 'POST',
      retryOnUnauthorized: false,
    })
      .then(() => undefined)
      .catch((error: unknown) => {
        csrfToken = undefined;
        throw error;
      })
      .finally(() => {
        refreshPromise = undefined;
      });
  }

  return refreshPromise;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const retryOnUnauthorized = options.retryOnUnauthorized ?? true;

  try {
    return await sendWithCsrfRecovery<T>(path, options);
  } catch (error: unknown) {
    if (!(error instanceof ApiClientError) || error.status !== 401 || !retryOnUnauthorized) {
      throw error;
    }

    await refreshSession();
    return sendWithCsrfRecovery<T>(path, { ...options, retryOnUnauthorized: false });
  }
}

export function authApiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//')) {
    return Promise.reject(new ApiClientError('API_PATH_INVALID', 0));
  }
  return apiRequest<T>(`${AUTH_API_PREFIX}${path}`, options);
}

export function clearAuthenticationClientState(): void {
  csrfToken = undefined;
  csrfBootstrapPromise = undefined;
  refreshPromise = undefined;
}
