import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@/lib/api/client';

import { authApi } from '../auth-api';
import type { AuthResult, AuthSession, AuthUser } from '../contracts';
import { AccountView } from './account-view';
import { ForgotPasswordForm } from './forgot-password-form';
import { LoginForm } from './login-form';
import { RegisterForm } from './register-form';
import { ResetPasswordForm } from './reset-password-form';
import { VerifyEmailForm } from './verify-email-form';

vi.mock('../auth-api', () => ({
  authApi: {
    forgotPassword: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    me: vi.fn(),
    register: vi.fn(),
    resendVerification: vi.fn(),
    resetPassword: vi.fn(),
    revokeSession: vi.fn(),
    sessions: vi.fn(),
    verifyEmail: vi.fn(),
  },
}));

const USER: AuthUser = {
  createdAt: '2026-01-02T03:04:05.000Z',
  email: 'fan@example.com',
  emailVerified: true,
  id: 'user-1',
  role: 'USER',
  status: 'ACTIVE',
  username: 'football-fan',
};

const CURRENT_SESSION: AuthSession = {
  createdAt: '2026-07-01T00:00:00.000Z',
  current: true,
  expiresAt: '2026-09-01T00:00:00.000Z',
  id: 'session-current',
  lastUsedAt: '2026-08-11T10:00:00.000Z',
};

const OTHER_SESSION: AuthSession = {
  createdAt: '2026-07-15T00:00:00.000Z',
  current: false,
  expiresAt: '2026-09-15T00:00:00.000Z',
  id: 'session-other',
  lastUsedAt: '2026-08-10T10:00:00.000Z',
};

interface Deferred<T> {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
}

function createDeferred<T>(): Deferred<T> {
  let reject!: Deferred<T>['reject'];
  let resolve!: Deferred<T>['resolve'];
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function changeField(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function submitForm(buttonName: string): HTMLFormElement {
  const form = screen.getByRole('button', { name: buttonName }).closest('form');
  if (!(form instanceof HTMLFormElement)) {
    throw new Error(`No form found for ${buttonName}.`);
  }
  fireEvent.submit(form);
  return form;
}

function setDefaultApiResponses(): void {
  vi.mocked(authApi.register).mockResolvedValue({ accepted: true });
  vi.mocked(authApi.login).mockResolvedValue({
    accessExpiresAt: '2026-08-11T10:15:00.000Z',
    csrfToken: 'csrf-login',
    user: USER,
  });
  vi.mocked(authApi.verifyEmail).mockResolvedValue({ emailVerified: true });
  vi.mocked(authApi.resendVerification).mockResolvedValue({ accepted: true });
  vi.mocked(authApi.forgotPassword).mockResolvedValue({ accepted: true });
  vi.mocked(authApi.resetPassword).mockResolvedValue({
    csrfToken: 'csrf-reset',
    passwordReset: true,
  });
  vi.mocked(authApi.me).mockResolvedValue({ user: USER });
  vi.mocked(authApi.sessions).mockResolvedValue({
    sessions: [CURRENT_SESSION, OTHER_SESSION],
  });
  vi.mocked(authApi.revokeSession).mockResolvedValue({ revoked: true });
  vi.mocked(authApi.logout).mockResolvedValue({ csrfToken: 'csrf-logout', loggedOut: true });
  vi.mocked(authApi.logoutAll).mockResolvedValue({ csrfToken: 'csrf-logout', loggedOut: true });
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  setDefaultApiResponses();
});

afterEach(() => {
  cleanup();
});

describe('registration and login', () => {
  it('registers and sends the user to email verification without signing in', async () => {
    const navigate = vi.fn();
    render(<RegisterForm navigate={navigate} />);

    changeField('Email', ' fan@example.com ');
    changeField('Username', ' football-fan ');
    changeField('Password', 'correct-horse-battery');
    changeField('Confirm password', 'correct-horse-battery');
    submitForm('Create account');

    await waitFor(() => {
      expect(authApi.register).toHaveBeenCalledWith({
        email: 'fan@example.com',
        password: 'correct-horse-battery',
        username: 'football-fan',
      });
      expect(navigate).toHaveBeenCalledWith('/verify-email');
    });
  });

  it('shows a safe registration conflict with its request reference', async () => {
    vi.mocked(authApi.register).mockRejectedValue(
      new ApiClientError('REGISTRATION_CONFLICT', 409, 'request-register'),
    );
    render(<RegisterForm />);

    changeField('Email', 'fan@example.com');
    changeField('Username', 'football-fan');
    changeField('Password', 'correct-horse-battery');
    changeField('Confirm password', 'correct-horse-battery');
    submitForm('Create account');

    expect(
      await screen.findByText('An account with those details cannot be created.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Reference: request-register')).toBeInTheDocument();
  });

  it('shows login loading, prevents duplicate submissions, and follows a safe redirect', async () => {
    const pendingLogin = createDeferred<AuthResult>();
    const navigate = vi.fn();
    vi.mocked(authApi.login).mockReturnValue(pendingLogin.promise);
    render(<LoginForm initialNext="/account?view=sessions" navigate={navigate} />);

    changeField('Email or username', 'football-fan');
    changeField('Password', 'correct-horse-battery');
    const form = submitForm('Sign in');
    fireEvent.submit(form);

    expect(authApi.login).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Signing in...' })).toBeDisabled();

    await act(async () => {
      pendingLogin.resolve({ csrfToken: 'csrf-login', user: USER });
      await pendingLogin.promise;
    });

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/account?view=sessions');
    });
  });

  it('does not expose a server login message and rejects an external redirect', async () => {
    const navigate = vi.fn();
    vi.mocked(authApi.login).mockRejectedValue(
      new ApiClientError('INVALID_CREDENTIALS', 401, 'request-login'),
    );
    const { rerender } = render(
      <LoginForm initialNext="https://evil.example" navigate={navigate} />,
    );

    changeField('Email or username', 'football-fan');
    changeField('Password', 'wrong-password');
    submitForm('Sign in');

    expect(
      await screen.findByText('The email, username, or password is incorrect.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/server/i)).not.toBeInTheDocument();

    vi.mocked(authApi.login).mockResolvedValue({ csrfToken: 'csrf-login', user: USER });
    rerender(<LoginForm initialNext="https://evil.example" navigate={navigate} />);
    submitForm('Sign in');
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/account'));
  });
});

describe('email and password recovery', () => {
  it('returns the same generic forgot-password confirmation', async () => {
    render(<ForgotPasswordForm />);
    changeField('Email', ' unknown@example.com ');
    submitForm('Send reset link');

    expect(
      await screen.findByText(
        'If an account matches that email, password reset instructions will be sent.',
      ),
    ).toBeInTheDocument();
    expect(authApi.forgotPassword).toHaveBeenCalledWith('unknown@example.com');
  });

  it('consumes a verification token from the fragment exactly once', async () => {
    window.history.replaceState(null, '', '/verify-email#token=verify-secret');
    render(
      <StrictMode>
        <VerifyEmailForm />
      </StrictMode>,
    );

    expect(await screen.findByText('Your email has been verified.')).toBeInTheDocument();
    expect(authApi.verifyEmail).toHaveBeenCalledTimes(1);
    expect(authApi.verifyEmail).toHaveBeenCalledWith('verify-secret');
    expect(window.location.hash).toBe('');
  });

  it('retries a transient verification failure with the token kept only in memory', async () => {
    vi.mocked(authApi.verifyEmail)
      .mockRejectedValueOnce(new ApiClientError('API_UNAVAILABLE', 0, 'request-verify'))
      .mockResolvedValueOnce({ emailVerified: true });
    window.history.replaceState(null, '', '/verify-email#token=verify-secret');
    render(<VerifyEmailForm />);

    expect(
      await screen.findByText('The service is unavailable. Please try again.'),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Try verification again' }));

    expect(await screen.findByText('Your email has been verified.')).toBeInTheDocument();
    expect(authApi.verifyEmail).toHaveBeenCalledTimes(2);
    expect(authApi.verifyEmail).toHaveBeenNthCalledWith(2, 'verify-secret');
  });

  it('supports anti-enumeration-safe verification resend', async () => {
    render(<VerifyEmailForm />);
    await screen.findByLabelText('Email');
    changeField('Email', 'fan@example.com');
    submitForm('Resend verification email');

    expect(
      await screen.findByText('If the address is eligible, a new verification email will be sent.'),
    ).toBeInTheDocument();
    expect(authApi.resendVerification).toHaveBeenCalledWith('fan@example.com');
  });

  it('removes the reset token from the URL before submitting a new password', async () => {
    const navigate = vi.fn();
    window.history.replaceState(null, '', '/reset-password#token=reset-secret');
    render(
      <StrictMode>
        <ResetPasswordForm navigate={navigate} />
      </StrictMode>,
    );

    await screen.findByLabelText('New password');
    expect(window.location.hash).toBe('');
    changeField('New password', 'new-correct-horse-battery');
    changeField('Confirm new password', 'new-correct-horse-battery');
    submitForm('Update password');

    await waitFor(() => {
      expect(authApi.resetPassword).toHaveBeenCalledWith({
        newPassword: 'new-correct-horse-battery',
        token: 'reset-secret',
      });
      expect(navigate).toHaveBeenCalledWith('/login?reset=success');
    });
  });

  it('shows an expired reset error safely', async () => {
    vi.mocked(authApi.resetPassword).mockRejectedValue(
      new ApiClientError('PASSWORD_RESET_INVALID', 400, 'request-reset'),
    );
    window.history.replaceState(null, '', '/reset-password#token=expired-secret');
    render(<ResetPasswordForm />);

    await screen.findByLabelText('New password');
    changeField('New password', 'new-correct-horse-battery');
    changeField('Confirm new password', 'new-correct-horse-battery');
    submitForm('Update password');

    expect(
      await screen.findByText('This password reset link is invalid or has expired.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Reference: request-reset')).toBeInTheDocument();
  });
});

describe('account and sessions', () => {
  it('shows loading, then loads profile and sessions, and revokes another session', async () => {
    const pendingMe = createDeferred<{ user: AuthUser }>();
    const pendingSessions = createDeferred<{ sessions: AuthSession[] }>();
    vi.mocked(authApi.me).mockReturnValue(pendingMe.promise);
    vi.mocked(authApi.sessions).mockReturnValue(pendingSessions.promise);
    render(<AccountView />);

    expect(screen.getByText('Loading your account...')).toBeInTheDocument();
    await act(async () => {
      pendingMe.resolve({ user: USER });
      pendingSessions.resolve({ sessions: [CURRENT_SESSION, OTHER_SESSION] });
      await Promise.all([pendingMe.promise, pendingSessions.promise]);
    });

    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByText('football-fan')).toBeInTheDocument();
    expect(screen.getByText('fan@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke session' }));

    await waitFor(() => {
      expect(authApi.revokeSession).toHaveBeenCalledWith('session-other', false);
      expect(screen.queryByRole('button', { name: 'Revoke session' })).not.toBeInTheDocument();
    });
  });

  it('revokes the current session and returns to sign in', async () => {
    const navigate = vi.fn();
    render(<AccountView navigate={navigate} />);
    await screen.findByRole('heading', { name: 'Profile' });
    fireEvent.click(screen.getByRole('button', { name: 'Revoke this session' }));

    await waitFor(() => {
      expect(authApi.revokeSession).toHaveBeenCalledWith('session-current', true);
      expect(navigate).toHaveBeenCalledWith('/login');
    });
  });

  it('prevents duplicate logout actions and redirects after logout', async () => {
    const pendingLogout = createDeferred<{ csrfToken: string; loggedOut: true }>();
    const navigate = vi.fn();
    vi.mocked(authApi.logout).mockReturnValue(pendingLogout.promise);
    render(<AccountView navigate={navigate} />);
    await screen.findByRole('heading', { name: 'Profile' });

    const button = screen.getByRole('button', { name: 'Sign out' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(authApi.logout).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Signing out...' })).toBeDisabled();

    await act(async () => {
      pendingLogout.resolve({ csrfToken: 'csrf-logout', loggedOut: true });
      await pendingLogout.promise;
    });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
  });

  it('supports signing out all sessions', async () => {
    const navigate = vi.fn();
    render(<AccountView navigate={navigate} />);
    await screen.findByRole('heading', { name: 'Profile' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));

    await waitFor(() => {
      expect(authApi.logoutAll).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith('/login');
    });
  });

  it('redirects an expired account session without rendering protected data', async () => {
    const navigate = vi.fn();
    vi.mocked(authApi.me).mockRejectedValue(new ApiClientError('SESSION_INVALID', 401));
    render(<AccountView navigate={navigate} />);

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/login?next=%2Faccount');
    });
    expect(screen.queryByText('fan@example.com')).not.toBeInTheDocument();
  });
});
