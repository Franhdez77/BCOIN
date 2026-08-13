import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import type { Response as SupertestResponse } from 'supertest';

import { AppModule } from '../src/app/app.module';
import { configureApplication } from '../src/app/configure-application';
import { EMAIL_SENDER, type EmailSender } from '../src/auth/application/email-sender.port';
import { UserRole, UserStatus } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'secure football phrase';
const describeDatabase = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;

interface SuccessBody<T> {
  data: T;
}
interface ErrorBody {
  error: { code: string };
}

jest.setTimeout(60_000);

describeDatabase('authentication PostgreSQL integration', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let agent: ReturnType<typeof request.agent>;
  let destructiveCleanupAuthorized = false;
  const verificationTokens = new Map<string, string>();
  const resetTokens = new Map<string, string>();
  const emailSender: EmailSender = {
    sendEmailVerification: jest.fn((recipient: string, token: string): Promise<void> => {
      verificationTokens.set(recipient, token);
      return Promise.resolve();
    }),
    sendPasswordReset: jest.fn((recipient: string, token: string): Promise<void> => {
      resetTokens.set(recipient, token);
      return Promise.resolve();
    }),
  };

  beforeAll(async () => {
    await assertAuthenticationTestDatabaseBeforeMigration();
    const prismaCli = [
      resolve(process.cwd(), 'node_modules/prisma/build/index.js'),
      resolve(process.cwd(), '../../node_modules/prisma/build/index.js'),
    ].find((candidate) => existsSync(candidate));
    if (prismaCli === undefined) throw new Error('Local Prisma CLI was not found.');
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'pipe',
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SENDER)
      .useValue(emailSender)
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
    await assertConnectedToAuthenticationTestDatabase(prisma);
    await assertAuthenticationTablesAreEmpty(prisma);
    destructiveCleanupAuthorized = true;
    agent = request.agent(app.getHttpServer());
  });

  afterAll(async () => {
    if (prisma !== undefined) await cleanup();
    if (app !== undefined) await app.close();
  });

  beforeEach(async () => {
    verificationTokens.clear();
    resetTokens.clear();
    await cleanup();
  });

  it('registers without a session, verifies email, logs in, and exposes a live session', async () => {
    await registerAndVerify('flow@example.com', 'FlowPlayer');
    expect(await prisma.authSession.count()).toBe(0);

    const csrf = await issueCsrf(agent);
    const login = await agent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ identifier: 'flow@example.com', password: PASSWORD })
      .expect(200);

    expect((login.body as SuccessBody<{ user: unknown }>).data.user).toMatchObject({
      email: 'flow@example.com',
      username: 'FlowPlayer',
      status: UserStatus.ACTIVE,
      role: UserRole.USER,
    });
    expect(JSON.stringify(login.body)).not.toContain('passwordHash');
    expect(await prisma.authSession.count()).toBe(1);

    await agent
      .get('/api/v1/auth/me')
      .expect(200)
      .expect(({ body }) =>
        expect((body as SuccessBody<{ user: { email: string } }>).data.user.email).toBe(
          'flow@example.com',
        ),
      );
    await agent
      .get('/api/v1/auth/sessions')
      .expect(200)
      .expect(({ body }) =>
        expect(
          (body as SuccessBody<{ sessions: Array<{ current: boolean }> }>).data.sessions[0]
            ?.current,
        ).toBe(true),
      );
    const refreshCsrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', refreshCsrf)
      .expect(200);
    const logoutCsrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', logoutCsrf)
      .expect(200);
    await agent.get('/api/v1/auth/me').expect(401);
  });

  it('stores canonical identifiers and Argon2id only, rejecting normalized duplicates', async () => {
    const csrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/register')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ email: 'Mixed@Example.COM', username: 'Mixed_User', password: PASSWORD })
      .expect(201);

    const stored = await prisma.user.findFirstOrThrow();
    expect(stored).toMatchObject({
      email: 'Mixed@Example.COM',
      emailNormalized: 'mixed@example.com',
      username: 'Mixed_User',
      usernameNormalized: 'mixed_user',
    });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    expect(stored.passwordHash).not.toContain(PASSWORD);
    expect(await prisma.authSession.count()).toBe(0);

    let nextCsrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/register')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', nextCsrf)
      .send({ email: 'mixed@example.com', username: 'Another_User', password: PASSWORD })
      .expect(409)
      .expect(({ body }) => expect((body as ErrorBody).error.code).toBe('REGISTRATION_CONFLICT'));
    nextCsrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/register')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', nextCsrf)
      .send({ email: 'another@example.com', username: 'mixed_user', password: PASSWORD })
      .expect(409);
  });

  it('commits registration safely when verification email delivery fails', async () => {
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const sendEmailVerification = (
      emailSender as unknown as {
        sendEmailVerification: jest.MockedFunction<
          (recipient: string, token: string) => Promise<void>
        >;
      }
    ).sendEmailVerification;
    sendEmailVerification.mockRejectedValueOnce(
      new Error('smtp-registration-secret-that-must-not-leak'),
    );
    const csrf = await issueCsrf(agent);
    const response = await agent
      .post('/api/v1/auth/register')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({
        email: 'delivery-failure@example.com',
        username: 'DeliveryFailure',
        password: PASSWORD,
      })
      .expect(201);

    expect((response.body as SuccessBody<{ accepted: true }>).data).toEqual({ accepted: true });
    const user = await prisma.user.findUniqueOrThrow({
      where: { emailNormalized: 'delivery-failure@example.com' },
    });
    expect(await prisma.emailVerificationToken.count({ where: { userId: user.id } })).toBe(1);
    expect(JSON.stringify(response.body)).not.toContain('token');
    const logs = JSON.stringify(logger.mock.calls);
    expect(logs).not.toContain('delivery-failure@example.com');
    expect(logs).not.toContain('smtp-registration-secret-that-must-not-leak');
    logger.mockRestore();
  });

  it('rejects invalid, expired, used, and concurrently consumed verification tokens', async () => {
    let csrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/verify-email')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ token: `${crypto.randomUUID()}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` })
      .expect(400);

    const usedToken = await registerOnly('used@example.com', 'UsedPlayer');
    csrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/verify-email')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ token: usedToken })
      .expect(200);
    csrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/verify-email')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ token: usedToken })
      .expect(400);

    const expiredToken = await registerOnly('expired@example.com', 'ExpiredPlayer');
    const expiredId = expiredToken.split('.')[0];
    await prisma.emailVerificationToken.update({
      where: { id: expiredId },
      data: {
        createdAt: new Date(Date.now() - 86_400_000),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    csrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/verify-email')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ token: expiredToken })
      .expect(400);

    const concurrentToken = await registerOnly('concurrent@example.com', 'ConcurrentPlayer');
    const csrfA = await issueBareCsrf(app);
    const csrfB = await issueBareCsrf(app);
    const verify = (csrfToken: { token: string; cookie: string }) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', csrfToken.token)
        .set('Cookie', csrfToken.cookie)
        .send({ token: concurrentToken });
    const responses = await Promise.all([verify(csrfA), verify(csrfB)]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 400]);
  });

  it('uses equivalent credential errors and enforces verification and account status', async () => {
    const unverifiedToken = await registerOnly('states@example.com', 'StatesPlayer');
    let csrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ identifier: 'states@example.com', password: PASSWORD })
      .expect(403)
      .expect(({ body }) =>
        expect((body as ErrorBody).error.code).toBe('EMAIL_VERIFICATION_REQUIRED'),
      );

    csrf = await issueCsrf(agent);
    const wrong = await agent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ identifier: 'states@example.com', password: 'wrong password' })
      .expect(401);
    csrf = await issueCsrf(agent);
    const missing = await agent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ identifier: 'missing@example.com', password: 'wrong password' })
      .expect(401);
    expect((wrong.body as ErrorBody).error).toEqual((missing.body as ErrorBody).error);

    csrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/verify-email')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ token: unverifiedToken })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({
      where: { emailNormalized: 'states@example.com' },
    });
    await prisma.user.update({ where: { id: user.id }, data: { status: UserStatus.SUSPENDED } });
    csrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ identifier: 'states@example.com', password: PASSWORD })
      .expect(403)
      .expect(({ body }) => expect((body as ErrorBody).error.code).toBe('ACCOUNT_SUSPENDED'));
    await prisma.user.update({ where: { id: user.id }, data: { status: UserStatus.BANNED } });
    csrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ identifier: 'states@example.com', password: PASSWORD })
      .expect(403)
      .expect(({ body }) => expect((body as ErrorBody).error.code).toBe('ACCOUNT_BANNED'));
  });

  it('creates the required JWT claims and rejects access after live account state changes', async () => {
    await registerAndVerify('claims@example.com', 'ClaimsPlayer');
    const response = await login('claims@example.com', agent);
    const accessCookie = normalizeCookies(response.headers['set-cookie']).find((value) =>
      value.startsWith('bichocoin_access='),
    );
    if (accessCookie === undefined) throw new Error('Access cookie was not set.');
    const accessToken = accessCookie.split(';')[0]?.split('=')[1];
    if (accessToken === undefined) throw new Error('Access token cookie was malformed.');
    const payload = app.get(JwtService).decode<{
      iss: string;
      aud: string;
      sub: string;
      sid: string;
      jti: string;
      iat: number;
      exp: number;
    }>(accessToken);
    expect(payload).toMatchObject({ iss: 'bichocoin-api', aud: 'bichocoin-web' });
    expect(payload.sub).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload.sid).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload.exp - payload.iat).toBe(600);

    await prisma.user.update({
      where: { id: payload.sub },
      data: { status: UserStatus.SUSPENDED },
    });
    await agent
      .get('/api/v1/auth/me')
      .expect(401)
      .expect(({ body }) => expect((body as ErrorBody).error.code).toBe('AUTHENTICATION_REQUIRED'));
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    await registerAndVerify('rotate@example.com', 'RotatePlayer');
    const originalRefreshCookie = await loginAndGetRefresh('rotate@example.com');
    const csrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .expect(200);

    const csrfForReuse = await issueBareCsrf(app);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrfForReuse.token)
      .set('Cookie', [csrfForReuse.cookie, originalRefreshCookie])
      .expect(401)
      .expect(({ body }) => expect((body as ErrorBody).error.code).toBe('INVALID_REFRESH_TOKEN'));

    const session = await prisma.authSession.findFirstOrThrow();
    expect(session.revocationReason).toBe('REFRESH_REUSE');
    expect(session.revokedAt).not.toBeNull();
    expect(await prisma.securityEvent.count({ where: { type: 'REFRESH_REUSE_DETECTED' } })).toBe(1);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const repeatedCsrf = await issueBareCsrf(app);
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', repeatedCsrf.token)
        .set('Cookie', [repeatedCsrf.cookie, originalRefreshCookie])
        .expect(401);
    }
    expect(await prisma.securityEvent.count({ where: { type: 'REFRESH_REUSE_DETECTED' } })).toBe(1);
  });

  it('handles concurrent, expired, and revoked refresh credentials safely', async () => {
    await registerAndVerify('refresh-cases@example.com', 'RefreshCases');
    const original = await loginAndGetRefresh('refresh-cases@example.com');
    const csrfA = await issueBareCsrf(app);
    const csrfB = await issueBareCsrf(app);
    const rotate = (csrf: { token: string; cookie: string }) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', csrf.token)
        .set('Cookie', [csrf.cookie, original]);
    const concurrent = await Promise.all([rotate(csrfA), rotate(csrfB)]);
    expect(concurrent.map(({ status }) => status).sort()).toEqual([200, 401]);
    expect((await prisma.authSession.findFirstOrThrow()).revocationReason).toBe('REFRESH_REUSE');

    await cleanup();
    verificationTokens.clear();
    await registerAndVerify('refresh-expired@example.com', 'RefreshExpired');
    const expiredCookie = await loginAndGetRefresh('refresh-expired@example.com');
    const tokenId = cookieValue(expiredCookie).split('.')[0];
    await prisma.refreshToken.update({
      where: { id: tokenId },
      data: {
        createdAt: new Date(Date.now() - 86_400_000),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const expiredCsrf = await issueBareCsrf(app);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', expiredCsrf.token)
      .set('Cookie', [expiredCsrf.cookie, expiredCookie])
      .expect(401);

    const token = await prisma.refreshToken.findUniqueOrThrow({ where: { id: tokenId } });
    await prisma.refreshToken.update({
      where: { id: token.id },
      data: { expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date() },
    });
    const revokedCsrf = await issueBareCsrf(app);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', revokedCsrf.token)
      .set('Cookie', [revokedCsrf.cookie, expiredCookie])
      .expect(401);
    expect(await prisma.securityEvent.count({ where: { type: 'REFRESH_REUSE_DETECTED' } })).toBe(0);
  });

  it('rejects expired reset credentials, then allows one concurrent reset and revokes sessions', async () => {
    await registerAndVerify('reset@example.com', 'ResetPlayer');
    await loginAndGetRefresh('reset@example.com');
    const forgotCsrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/forgot-password')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', forgotCsrf)
      .send({ email: 'reset@example.com' })
      .expect(202);
    const expiredToken = resetTokens.get('reset@example.com');
    expect(expiredToken).toBeDefined();
    const expiredTokenId = expiredToken?.split('.')[0];
    if (expiredTokenId === undefined) throw new Error('Reset token identifier is missing.');
    await prisma.passwordResetToken.update({
      where: { id: expiredTokenId },
      data: {
        createdAt: new Date(Date.now() - 86_400_000),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const expiredCsrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/reset-password')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', expiredCsrf)
      .send({ token: expiredToken, newPassword: 'another secure phrase' })
      .expect(400)
      .expect(({ body }) =>
        expect((body as ErrorBody).error.code).toBe('PASSWORD_RESET_INVALID'),
      );

    const replacementCsrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/forgot-password')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', replacementCsrf)
      .send({ email: 'reset@example.com' })
      .expect(202);
    const token = resetTokens.get('reset@example.com');
    expect(token).toBeDefined();

    const csrfA = await issueBareCsrf(app);
    const csrfB = await issueBareCsrf(app);
    const attempt = (csrf: { token: string; cookie: string }) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', csrf.token)
        .set('Cookie', csrf.cookie)
        .send({ token, newPassword: 'another secure phrase' });
    const responses = await Promise.all([attempt(csrfA), attempt(csrfB)]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 400]);
    expect(await prisma.authSession.count({ where: { revokedAt: null } })).toBe(0);

    let loginCsrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', loginCsrf)
      .send({ identifier: 'reset@example.com', password: PASSWORD })
      .expect(401);
    loginCsrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', loginCsrf)
      .send({ identifier: 'reset@example.com', password: 'another secure phrase' })
      .expect(200);
  });

  it('keeps recovery responses generic when accounts or SMTP delivery differ', async () => {
    await registerAndVerify('recovery@example.com', 'RecoveryPlayer');
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const sendPasswordReset = (
      emailSender as unknown as {
        sendPasswordReset: jest.MockedFunction<(recipient: string, token: string) => Promise<void>>;
      }
    ).sendPasswordReset;
    sendPasswordReset.mockRejectedValueOnce(new Error('smtp-secret-that-must-not-leak'));
    let csrf = await issueCsrf(agent);
    const existing = await agent
      .post('/api/v1/auth/forgot-password')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ email: 'recovery@example.com' })
      .expect(202);
    csrf = await issueCsrf(agent);
    const missing = await agent
      .post('/api/v1/auth/forgot-password')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ email: 'missing@example.com' })
      .expect(202);

    expect((existing.body as SuccessBody<{ accepted: true }>).data).toEqual(
      (missing.body as SuccessBody<{ accepted: true }>).data,
    );
    const logs = JSON.stringify(logger.mock.calls);
    expect(logs).not.toContain('recovery@example.com');
    expect(logs).not.toContain('smtp-secret-that-must-not-leak');
    logger.mockRestore();
  });

  it('revokes logout server-side, remains repeatable, and logout-all revokes every session', async () => {
    await registerAndVerify('logout@example.com', 'LogoutPlayer');
    await loginAndGetRefresh('logout@example.com');
    let csrf = await issueCsrf(agent);
    const first = await agent
      .post('/api/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    expect(normalizeCookies(first.headers['set-cookie']).join(';')).toContain('bichocoin_access=;');
    expect(await prisma.authSession.count({ where: { revokedAt: null } })).toBe(0);
    expect(await prisma.securityEvent.count({ where: { type: 'LOGOUT' } })).toBe(1);
    csrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    expect(await prisma.securityEvent.count({ where: { type: 'LOGOUT' } })).toBe(1);

    const firstAgent = request.agent(app.getHttpServer());
    const secondAgent = request.agent(app.getHttpServer());
    await loginAndGetRefresh('logout@example.com', firstAgent);
    await loginAndGetRefresh('logout@example.com', secondAgent);
    csrf = await issueCsrf(firstAgent);
    await firstAgent
      .post('/api/v1/auth/logout-all')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    expect(await prisma.authSession.count({ where: { revokedAt: null } })).toBe(0);
    await secondAgent.get('/api/v1/auth/me').expect(401);
  });

  it('revokes using an access-only logout and clears a successfully revoked current session', async () => {
    await registerAndVerify('access-logout@example.com', 'AccessLogout');
    const loginResponse = await login('access-logout@example.com', agent);
    const accessCookie = normalizeCookies(loginResponse.headers['set-cookie'])
      .find((value) => value.startsWith('bichocoin_access='))
      ?.split(';')[0];
    if (accessCookie === undefined) throw new Error('Access cookie missing.');
    const bareCsrf = await issueBareCsrf(app);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', bareCsrf.token)
      .set('Cookie', [bareCsrf.cookie, accessCookie])
      .expect(200);
    expect(await prisma.authSession.count({ where: { revokedAt: null } })).toBe(0);

    await loginAndGetRefresh('access-logout@example.com', agent);
    const session = await prisma.authSession.findFirstOrThrow({
      where: { revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const csrf = await issueCsrf(agent);
    const revoked = await agent
      .delete(`/api/v1/auth/sessions/${session.id}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    expect((revoked.body as SuccessBody<{ currentSessionRevoked: boolean }>).data).toEqual(
      expect.objectContaining({ currentSessionRevoked: true }),
    );
    expect(normalizeCookies(revoked.headers['set-cookie']).join(';')).toContain(
      'bichocoin_access=;',
    );
  });

  it('prevents BOLA when revoking another user session', async () => {
    await registerAndVerify('owner@example.com', 'OwnerPlayer');
    await loginAndGetRefresh('owner@example.com');
    const ownerSession = await prisma.authSession.findFirstOrThrow();

    const secondAgent = request.agent(app.getHttpServer());
    await registerAndVerify('attacker@example.com', 'AttackerPlayer', secondAgent);
    await loginAndGetRefresh('attacker@example.com', secondAgent);
    const csrf = await issueCsrf(secondAgent);
    await secondAgent
      .delete(`/api/v1/auth/sessions/${ownerSession.id}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .expect(404);

    const bolaCsrf = await issueCsrf(secondAgent);
    const bolaResponse = await secondAgent
      .delete(`/api/v1/auth/sessions/${ownerSession.id}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', bolaCsrf)
      .expect(404);
    expect(normalizeCookies(bolaResponse.headers['set-cookie']).join(';')).not.toContain(
      'bichocoin_access=;',
    );

    expect(
      (await prisma.authSession.findUniqueOrThrow({ where: { id: ownerSession.id } })).revokedAt,
    ).toBeNull();
  });

  async function registerAndVerify(
    email: string,
    username: string,
    targetAgent = agent,
  ): Promise<void> {
    const token = await registerOnly(email, username, targetAgent);
    const csrf = await issueCsrf(targetAgent);
    await targetAgent
      .post('/api/v1/auth/verify-email')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ token })
      .expect(200);
  }

  async function registerOnly(
    email: string,
    username: string,
    targetAgent = agent,
  ): Promise<string> {
    const csrf = await issueCsrf(targetAgent);
    await targetAgent
      .post('/api/v1/auth/register')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ email, username, password: PASSWORD })
      .expect(201);
    const token = verificationTokens.get(email);
    if (token === undefined) throw new Error('Verification token was not captured.');
    return token;
  }

  async function loginAndGetRefresh(identifier: string, targetAgent = agent): Promise<string> {
    const response = await login(identifier, targetAgent);
    const cookies = normalizeCookies(response.headers['set-cookie']);
    const cookie = cookies.find((value) => value.startsWith('bichocoin_refresh='));
    if (cookie === undefined) throw new Error('Refresh cookie was not set.');
    return cookie.split(';')[0] ?? cookie;
  }

  async function login(
    identifier: string,
    targetAgent: ReturnType<typeof request.agent>,
  ): Promise<SupertestResponse> {
    const csrf = await issueCsrf(targetAgent);
    return targetAgent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ identifier, password: PASSWORD })
      .expect(200);
  }

  async function cleanup(): Promise<void> {
    if (!destructiveCleanupAuthorized || prisma === undefined) return;
    await assertConnectedToAuthenticationTestDatabase(prisma);
    await prisma?.securityEvent.deleteMany();
    await prisma?.refreshToken.deleteMany();
    await prisma?.authSession.deleteMany();
    await prisma?.emailVerificationToken.deleteMany();
    await prisma?.passwordResetToken.deleteMany();
    await prisma?.user.deleteMany();
  }
});

async function issueCsrf(agent: ReturnType<typeof request.agent>): Promise<string>;
async function issueCsrf(agent: ReturnType<typeof request.agent>): Promise<string> {
  const response = await agent.get('/api/v1/auth/csrf').expect(200);
  return (response.body as SuccessBody<{ csrfToken: string }>).data.csrfToken;
}

async function assertAuthenticationTestDatabaseBeforeMigration(): Promise<void> {
  const configured = process.env.AUTH_TEST_DATABASE_URL;
  if (configured === undefined) throw new Error('AUTH_TEST_DATABASE_URL is missing.');
  const client = new Client({ connectionString: configured });
  try {
    await client.connect();
    const result = await client.query<{ database: string }>(
      'SELECT current_database() AS database',
    );
    const expected = new URL(configured).pathname.slice(1);
    if (result.rows[0]?.database !== expected) {
      throw new Error(`Refusing to migrate a database other than ${expected}.`);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function assertAuthenticationTablesAreEmpty(prisma: PrismaService): Promise<void> {
  const counts = await Promise.all([
    prisma.securityEvent.count(),
    prisma.refreshToken.count(),
    prisma.authSession.count(),
    prisma.emailVerificationToken.count(),
    prisma.passwordResetToken.count(),
    prisma.user.count(),
  ]);
  if (counts.some((count) => count !== 0)) {
    throw new Error(
      'Refusing authentication tests because the dedicated test database is not empty.',
    );
  }
}

async function assertConnectedToAuthenticationTestDatabase(prisma: PrismaService): Promise<void> {
  const configured = process.env.AUTH_TEST_DATABASE_URL;
  if (configured === undefined) throw new Error('AUTH_TEST_DATABASE_URL is missing.');
  const expected = new URL(configured).pathname.slice(1);
  const rows = await prisma.$queryRaw<
    Array<{ database: string }>
  >`SELECT current_database() AS database`;
  // Docker/NAT exposes a loopback client URL while PostgreSQL reports its container
  // address and internal port. The strict URL parser plus the exact DB name are the
  // reliable destructive-test boundary from the client side.
  if (rows[0]?.database !== expected) {
    throw new Error(`Refusing destructive test cleanup outside ${expected}.`);
  }
}

function normalizeCookies(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function cookieValue(cookie: string): string {
  const separator = cookie.indexOf('=');
  if (separator < 0) throw new Error('Cookie value is malformed.');
  return cookie.slice(separator + 1);
}

async function issueBareCsrf(
  app: NestExpressApplication,
): Promise<{ token: string; cookie: string }> {
  const response = await request(app.getHttpServer()).get('/api/v1/auth/csrf').expect(200);
  const cookie = normalizeCookies(response.headers['set-cookie'])[0]?.split(';')[0];
  if (cookie === undefined) throw new Error('CSRF cookie was not set.');
  return {
    token: (response.body as SuccessBody<{ csrfToken: string }>).data.csrfToken,
    cookie,
  };
}
