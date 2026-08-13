import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { configureApplication } from '../src/app/configure-application';
import { AccountVerificationService } from '../src/auth/application/account-verification.service';
import { AuthenticationService } from '../src/auth/application/authentication.service';
import { PasswordRecoveryService } from '../src/auth/application/password-recovery.service';
import { SessionQueryService } from '../src/auth/application/session-query.service';
import { TargetedRateLimitGuard } from '../src/auth/guards/targeted-rate-limit.guard';
import type { EnvironmentVariables } from '../src/config/environment';
import { UserRole, UserStatus } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

const ORIGIN = 'http://localhost:3000';
const REFRESH_TOKEN = `${crypto.randomUUID()}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

interface SuccessBody<T> { data: T }
interface ErrorBody { error: { code: string } }

describe('authentication HTTP contract', () => {
  let app: NestExpressApplication;
  let agent: ReturnType<typeof request.agent>;
  const user = {
    id: crypto.randomUUID(),
    email: 'player@example.com',
    username: 'Player',
    emailVerified: true,
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    createdAt: new Date('2026-08-11T00:00:00.000Z'),
  };
  const verification = {
    register: jest.fn().mockResolvedValue({ accepted: true }),
    verify: jest.fn().mockResolvedValue({ emailVerified: true }),
    resend: jest.fn().mockResolvedValue({ accepted: true }),
  };
  const authentication = {
    login: jest.fn().mockResolvedValue({
      user,
      accessToken: 'signed-access-token',
      refreshToken: REFRESH_TOKEN,
      accessExpiresAt: new Date('2026-08-11T00:10:00.000Z'),
      refreshExpiresAt: new Date(Date.now() + 2_592_000_000),
    }),
    refresh: jest.fn(),
    logoutByRefresh: jest.fn().mockResolvedValue({ loggedOut: true }),
    logoutAll: jest.fn(),
  };
  const recovery = {
    request: jest.fn().mockResolvedValue({ accepted: true }),
    reset: jest.fn().mockResolvedValue({ passwordReset: true }),
  };
  const sessions = { me: jest.fn(), list: jest.fn(), revoke: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AccountVerificationService)
      .useValue(verification)
      .overrideProvider(AuthenticationService)
      .useValue(authentication)
      .overrideProvider(PasswordRecoveryService)
      .useValue(recovery)
      .overrideProvider(SessionQueryService)
      .useValue(sessions)
      .overrideProvider(PrismaService)
      .useValue({
        $disconnect: jest.fn().mockResolvedValue(undefined),
        securityEvent: { create: jest.fn().mockResolvedValue({}) },
      })
      .compile();

    app = module.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
    configureApplication(app);
    await app.init();
    agent = request.agent(app.getHttpServer());
  });

  afterAll(async () => app.close());

  beforeEach(() => jest.clearAllMocks());

  it('issues an HttpOnly CSRF nonce and no-store response', async () => {
    const response = await agent.get('/api/v1/auth/csrf').expect(200);

    expect((response.body as SuccessBody<{ csrfToken: string }>).data.csrfToken).toEqual(
      expect.any(String),
    );
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(response.headers['set-cookie']?.[0]).toContain('SameSite=Strict');
    expect(response.headers['set-cookie']?.[0]).toContain('Path=/api/v1');
  });

  it('rejects unsafe requests without CSRF before invoking the use case', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', ORIGIN)
      .send({ email: 'new@example.com', username: 'NewPlayer', password: 'long password phrase' })
      .expect(403)
      .expect(({ body }) =>
        expect((body as ErrorBody).error.code).toBe('CSRF_VALIDATION_FAILED'),
      );

    expect(verification.register).not.toHaveBeenCalled();
  });

  it.each([
    { email: 'invalid-email', username: 'ValidPlayer', password: 'long password phrase' },
    { email: 'valid@example.com', username: 'ValidPlayer', password: 'too-short' },
  ])('rejects invalid registration input before the use case', async (payload) => {
    const csrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/register')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send(payload)
      .expect(400)
      .expect(({ body }) => expect((body as ErrorBody).error.code).toBe('VALIDATION_ERROR'));
    expect(verification.register).not.toHaveBeenCalled();
  });

  it('accepts exact Origin and signed CSRF token for registration', async () => {
    const csrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/register')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ email: 'new@example.com', username: 'NewPlayer', password: 'long password phrase' })
      .expect(201)
      .expect(({ body }) =>
        expect((body as SuccessBody<{ accepted: true }>).data).toEqual({ accepted: true }),
      );

    expect(verification.register).toHaveBeenCalledTimes(1);
  });

  it('rejects cross-site fetch metadata even with a valid token', async () => {
    const csrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/forgot-password')
      .set('Origin', ORIGIN)
      .set('Sec-Fetch-Site', 'cross-site')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'player@example.com' })
      .expect(403);
  });

  it('sets scoped authentication cookies without returning either credential', async () => {
    const csrf = await issueCsrf(agent);
    const response = await agent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ identifier: 'player@example.com', password: 'long password phrase' })
      .expect(200);

    const serialized = JSON.stringify(response.body);
    const rawCookies = response.headers['set-cookie'];
    const cookies = Array.isArray(rawCookies) ? rawCookies : rawCookies === undefined ? [] : [rawCookies];
    expect(serialized).not.toContain('signed-access-token');
    expect(serialized).not.toContain(REFRESH_TOKEN);
    expect(cookies.some((cookie: string) => cookie.includes('Path=/api/v1;'))).toBe(true);
    expect(cookies.some((cookie: string) => cookie.includes('Path=/api/v1/auth;'))).toBe(true);
    expect(cookies.every((cookie: string) => cookie.includes('HttpOnly'))).toBe(true);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('denies protected routes by default without a valid session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(401)
      .expect(({ body }) =>
        expect((body as ErrorBody).error.code).toBe('AUTHENTICATION_REQUIRED'),
      );
  });

  it('rejects form-encoded auth payloads', async () => {
    const csrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .type('form')
      .send({ identifier: 'player@example.com', password: 'long password phrase' })
      .expect(400);
  });

  it('does not clear authentication cookies when server-side logout fails', async () => {
    authentication.logoutByRefresh.mockRejectedValueOnce(new Error('database unavailable'));
    const csrf = await issueCsrf(agent);
    const response = await agent
      .post('/api/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .expect(500);

    expect(response.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('database unavailable');
  });

  it('enforces the login IP rate limit through HTTP with retry headers', async () => {
    const config = app.get(ConfigService<EnvironmentVariables, true>);
    const limiter = app.get(TargetedRateLimitGuard);
    limiter['buckets'].clear();
    config.set('AUTH_LOGIN_RATE_LIMIT_MAX', 2);
    try {
      for (const identifier of ['first@example.com', 'second@example.com']) {
        const csrf = await issueCsrf(agent);
        await agent
          .post('/api/v1/auth/login')
          .set('Origin', ORIGIN)
          .set('X-CSRF-Token', csrf)
          .send({ identifier, password: 'long password phrase' })
          .expect(200);
      }
      const csrf = await issueCsrf(agent);
      const response = await agent
        .post('/api/v1/auth/login')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', csrf)
        .send({ identifier: 'third@example.com', password: 'long password phrase' })
        .expect(429);

      expect((response.body as ErrorBody).error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.headers['ratelimit-limit']).toBe('2');
      expect(Number(response.headers['ratelimit-reset'])).toBeGreaterThan(0);
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      config.set('AUTH_LOGIN_RATE_LIMIT_MAX', 1000);
      limiter['buckets'].clear();
    }
  });
});

async function issueCsrf(agent: ReturnType<typeof request.agent>): Promise<string> {
  const response = await agent.get('/api/v1/auth/csrf').expect(200);
  return (response.body as SuccessBody<{ csrfToken: string }>).data.csrfToken;
}
