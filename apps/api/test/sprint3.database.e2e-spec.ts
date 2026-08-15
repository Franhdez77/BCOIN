import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { configureApplication } from '../src/app/configure-application';
import { EMAIL_SENDER, type EmailSender } from '../src/auth/application/email-sender.port';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'secure football phrase';
const EXPECTED_REWARD = 100n;
const EXPECTED_DURATION_MS = 86_400_000;
const describeDatabase = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;

interface SuccessBody<T> {
  data: T;
}

interface ErrorBody {
  error: { code: string };
}

interface MiningSessionResponse {
  id: string;
  startedAt: string;
  endsAt: string;
  claimedAt: string | null;
  rewardAmount: string;
  eligible: boolean;
  createdAt: string;
}

jest.setTimeout(60_000);

describeDatabase('Sprint 3 mining PostgreSQL integration', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let agent: ReturnType<typeof request.agent>;
  const verificationTokens = new Map<string, string>();
  const emailSender: EmailSender = {
    sendEmailVerification: jest.fn((recipient: string, token: string): Promise<void> => {
      verificationTokens.set(recipient, token);
      return Promise.resolve();
    }),
    sendPasswordReset: jest.fn(() => Promise.resolve()),
  };

  beforeAll(async () => {
    await assertTestDatabase();
    deployMigrations();

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
    await assertConnectedDatabase(prisma);
    await cleanup();
    agent = request.agent(app.getHttpServer());
  });

  afterAll(async () => {
    if (prisma !== undefined) await cleanup();
    if (app !== undefined) await app.close();
  });

  beforeEach(async () => {
    verificationTokens.clear();
    await cleanup();
    agent = request.agent(app.getHttpServer());
  });

  it('starts one server-authored 24-hour session with the configured reward', async () => {
    await registerVerifyAndLogin('start@example.com', 'StartPlayer');
    const csrf = await issueCsrf(agent);

    const response = await agent
      .post('/api/v1/mining/start')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({})
      .expect(201);

    const session = (response.body as SuccessBody<{ session: MiningSessionResponse }>).data.session;
    expect(session.rewardAmount).toBe(EXPECTED_REWARD.toString());
    expect(session.claimedAt).toBeNull();
    expect(session.eligible).toBe(false);
    expect(new Date(session.endsAt).getTime() - new Date(session.startedAt).getTime()).toBe(
      EXPECTED_DURATION_MS,
    );

    const stored = await prisma.miningSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(stored.rewardAmount).toBe(EXPECTED_REWARD);
    expect(stored.claimedAt).toBeNull();
  });

  it('prevents a second open session for the same user', async () => {
    await registerVerifyAndLogin('double@example.com', 'DoublePlayer');
    let csrf = await issueCsrf(agent);
    await postMiningStart(agent, csrf).expect(201);

    csrf = await issueCsrf(agent);
    await postMiningStart(agent, csrf)
      .expect(409)
      .expect(({ body }) => {
        expect((body as ErrorBody).error.code).toBe('MINING_ALREADY_ACTIVE');
      });

    const user = await userByEmail('double@example.com');
    expect(await prisma.miningSession.count({ where: { userId: user.id, claimedAt: null } })).toBe(
      1,
    );
  });

  it('allows exactly one of ten concurrent start requests to create an open session', async () => {
    await registerVerifyAndLogin('parallel-start@example.com', 'ParallelStart');
    const csrf = await issueCsrf(agent);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => postMiningStart(agent, csrf)),
    );
    expect(responses.filter(({ status }) => status === 201)).toHaveLength(1);
    expect(responses.filter(({ status }) => status === 409)).toHaveLength(9);

    const user = await userByEmail('parallel-start@example.com');
    expect(await prisma.miningSession.count({ where: { userId: user.id, claimedAt: null } })).toBe(
      1,
    );
  });

  it('derives current eligibility from persisted server state', async () => {
    await registerVerifyAndLogin('current@example.com', 'CurrentPlayer');
    const csrf = await issueCsrf(agent);
    const started = await postMiningStart(agent, csrf).expect(201);
    const session = (started.body as SuccessBody<{ session: MiningSessionResponse }>).data.session;

    await agent
      .get('/api/v1/mining/current')
      .expect(200)
      .expect(({ body }) => {
        const current = (body as SuccessBody<{ session: MiningSessionResponse }>).data.session;
        expect(current.eligible).toBe(false);
      });

    await makeSessionEligible(session.id);

    await agent
      .get('/api/v1/mining/current')
      .expect(200)
      .expect(({ body }) => {
        const current = (body as SuccessBody<{ session: MiningSessionResponse }>).data.session;
        expect(current.id).toBe(session.id);
        expect(current.eligible).toBe(true);
      });
  });

  it('blocks BOLA and mass assignment across mining users', async () => {
    const owner = request.agent(app.getHttpServer());
    await registerVerifyAndLogin('owner-mining@example.com', 'OwnerMining', owner);
    let csrf = await issueCsrf(owner);
    const ownerStart = await postMiningStart(owner, csrf).expect(201);
    const ownerSession = (
      ownerStart.body as SuccessBody<{ session: MiningSessionResponse }>
    ).data.session;
    const ownerUser = await userByEmail('owner-mining@example.com');

    const attacker = request.agent(app.getHttpServer());
    await registerVerifyAndLogin('attacker-mining@example.com', 'AttackerMining', attacker);

    await attacker
      .get('/api/v1/mining/current')
      .query({ userId: ownerUser.id })
      .expect(200)
      .expect(({ body }) => {
        expect((body as SuccessBody<{ session: null }>).data.session).toBeNull();
      });

    csrf = await issueCsrf(attacker);
    await attacker
      .post('/api/v1/mining/start')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({
        userId: ownerUser.id,
        rewardAmount: '999999',
        startedAt: '2000-01-01T00:00:00.000Z',
        endsAt: '2100-01-01T00:00:00.000Z',
        claimedAt: '2000-01-01T00:00:00.000Z',
        balance: '999999',
      })
      .expect(400);

    const storedOwnerSession = await prisma.miningSession.findUniqueOrThrow({
      where: { id: ownerSession.id },
    });
    expect(storedOwnerSession.userId).toBe(ownerUser.id);
    expect(storedOwnerSession.rewardAmount).toBe(EXPECTED_REWARD);
    expect(storedOwnerSession.claimedAt).toBeNull();
  });

  it('rejects claim before endsAt without changing wallet or ledger', async () => {
    await registerVerifyAndLogin('early@example.com', 'EarlyPlayer');
    let csrf = await issueCsrf(agent);
    await postMiningStart(agent, csrf).expect(201);

    csrf = await issueCsrf(agent);
    await postMiningClaim(agent, csrf)
      .expect(409)
      .expect(({ body }) => {
        expect((body as ErrorBody).error.code).toBe('MINING_NOT_ELIGIBLE');
      });

    const user = await userByEmail('early@example.com');
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balance).toBe(0n);
    expect(await prisma.walletTransaction.count({ where: { walletId: wallet.id } })).toBe(0);
    expect(
      await prisma.miningSession.count({ where: { userId: user.id, claimedAt: { not: null } } }),
    ).toBe(0);
  });

  it('claims through wallet atomically with correct ledger metadata', async () => {
    await registerVerifyAndLogin('claim@example.com', 'ClaimPlayer');
    let csrf = await issueCsrf(agent);
    const started = await postMiningStart(agent, csrf).expect(201);
    const session = (started.body as SuccessBody<{ session: MiningSessionResponse }>).data.session;
    await makeSessionEligible(session.id);

    csrf = await issueCsrf(agent);
    const claimed = await postMiningClaim(agent, csrf).expect(200);
    const result = (
      claimed.body as SuccessBody<{
        session: MiningSessionResponse;
        wallet: { currency: 'BIC'; balance: string };
        transaction: { id: string };
      }>
    ).data;

    expect(result.session.id).toBe(session.id);
    expect(result.session.claimedAt).not.toBeNull();
    expect(result.session.rewardAmount).toBe(EXPECTED_REWARD.toString());
    expect(result.wallet).toEqual({ currency: 'BIC', balance: EXPECTED_REWARD.toString() });

    const user = await userByEmail('claim@example.com');
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balance).toBe(EXPECTED_REWARD);

    const ledger = await prisma.walletTransaction.findMany({ where: { walletId: wallet.id } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      id: result.transaction.id,
      type: 'CREDIT',
      amount: EXPECTED_REWARD,
      balanceBefore: 0n,
      balanceAfter: EXPECTED_REWARD,
      referenceType: 'MINING',
      referenceId: session.id,
      idempotencyKey: `mining:claim:${session.id}`,
      actorUserId: user.id,
    });
  });

  it('does not credit a repeated claim twice', async () => {
    await registerVerifyAndLogin('replay@example.com', 'ReplayPlayer');
    let csrf = await issueCsrf(agent);
    const started = await postMiningStart(agent, csrf).expect(201);
    const session = (started.body as SuccessBody<{ session: MiningSessionResponse }>).data.session;
    await makeSessionEligible(session.id);

    csrf = await issueCsrf(agent);
    await postMiningClaim(agent, csrf).expect(200);
    csrf = await issueCsrf(agent);
    await postMiningClaim(agent, csrf)
      .expect(409)
      .expect(({ body }) => {
        expect((body as ErrorBody).error.code).toBe('MINING_ALREADY_CLAIMED');
      });

    const user = await userByEmail('replay@example.com');
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balance).toBe(EXPECTED_REWARD);
    expect(await prisma.walletTransaction.count({ where: { walletId: wallet.id } })).toBe(1);
  });

  it('credits exactly once under twenty concurrent claims for the same session', async () => {
    await registerVerifyAndLogin('parallel-claim@example.com', 'ParallelClaim');
    let csrf = await issueCsrf(agent);
    const started = await postMiningStart(agent, csrf).expect(201);
    const session = (started.body as SuccessBody<{ session: MiningSessionResponse }>).data.session;
    await makeSessionEligible(session.id);

    csrf = await issueCsrf(agent);
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => postMiningClaim(agent, csrf)),
    );
    expect(responses.filter(({ status }) => status === 200)).toHaveLength(1);
    expect(responses.filter(({ status }) => status === 409)).toHaveLength(19);

    const user = await userByEmail('parallel-claim@example.com');
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balance).toBe(EXPECTED_REWARD);
    expect(
      await prisma.walletTransaction.count({
        where: { walletId: wallet.id, referenceType: 'MINING', referenceId: session.id },
      }),
    ).toBe(1);
    expect(
      (await prisma.miningSession.findUniqueOrThrow({ where: { id: session.id } })).claimedAt,
    ).not.toBeNull();
  });

  it('rolls claimedAt back when the wallet movement cannot complete', async () => {
    await registerVerifyAndLogin('rollback@example.com', 'RollbackPlayer');
    let csrf = await issueCsrf(agent);
    const started = await postMiningStart(agent, csrf).expect(201);
    const session = (started.body as SuccessBody<{ session: MiningSessionResponse }>).data.session;
    await makeSessionEligible(session.id);

    const user = await userByEmail('rollback@example.com');
    await prisma.wallet.delete({ where: { userId: user.id } });

    csrf = await issueCsrf(agent);
    await postMiningClaim(agent, csrf).expect(404);

    const stored = await prisma.miningSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(stored.claimedAt).toBeNull();
    expect(await prisma.walletTransaction.count({ where: { referenceId: session.id } })).toBe(0);
  });

  it('returns only the authenticated user history with bounded cursor pagination', async () => {
    await registerVerifyAndLogin('history-mining@example.com', 'HistoryMining');
    const user = await userByEmail('history-mining@example.com');
    const other = await registerOnly('other-history@example.com', 'OtherHistory');
    const base = Date.now() - 1_000_000;

    for (let index = 0; index < 3; index += 1) {
      const startedAt = new Date(base + index * 10_000);
      const endsAt = new Date(startedAt.getTime() + 1_000);
      await prisma.miningSession.create({
        data: {
          userId: user.id,
          startedAt,
          endsAt,
          claimedAt: new Date(endsAt.getTime() + 1_000),
          rewardAmount: EXPECTED_REWARD,
          createdAt: new Date(base + index * 10_000),
        },
      });
    }
    await prisma.miningSession.create({
      data: {
        userId: other.id,
        startedAt: new Date(base),
        endsAt: new Date(base + 1_000),
        claimedAt: new Date(base + 2_000),
        rewardAmount: 999n,
        createdAt: new Date(base + 50_000),
      },
    });

    const first = await agent.get('/api/v1/mining/history').query({ limit: 2 }).expect(200);
    const firstData = (
      first.body as SuccessBody<{ sessions: MiningSessionResponse[]; nextCursor?: string }>
    ).data;
    expect(firstData.sessions).toHaveLength(2);
    expect(firstData.sessions.every(({ rewardAmount }) => rewardAmount === '100')).toBe(true);
    expect(firstData.nextCursor).toBeDefined();

    const second = await agent
      .get('/api/v1/mining/history')
      .query({ limit: 2, cursor: firstData.nextCursor })
      .expect(200);
    expect((second.body as SuccessBody<{ sessions: unknown[] }>).data.sessions).toHaveLength(1);

    await agent.get('/api/v1/mining/history').query({ limit: 51 }).expect(400);
    await agent.get('/api/v1/mining/history').query({ cursor: '***' }).expect(400);
  });

  it('rejects economic and timestamp mass assignment on claim', async () => {
    await registerVerifyAndLogin('claim-body@example.com', 'ClaimBody');
    let csrf = await issueCsrf(agent);
    const started = await postMiningStart(agent, csrf).expect(201);
    const session = (started.body as SuccessBody<{ session: MiningSessionResponse }>).data.session;
    await makeSessionEligible(session.id);

    csrf = await issueCsrf(agent);
    await agent
      .post('/api/v1/mining/claim')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({
        userId: crypto.randomUUID(),
        rewardAmount: '999999',
        startedAt: '2000-01-01T00:00:00.000Z',
        endsAt: '2000-01-01T00:00:00.000Z',
        claimedAt: '2000-01-01T00:00:00.000Z',
        balance: '999999',
      })
      .expect(400);

    const stored = await prisma.miningSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(stored.claimedAt).toBeNull();
    const user = await userByEmail('claim-body@example.com');
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balance).toBe(0n);
  });

  async function userByEmail(email: string): Promise<{ id: string }> {
    return prisma.user.findUniqueOrThrow({ where: { emailNormalized: email.toLowerCase() } });
  }

  async function makeSessionEligible(sessionId: string): Promise<void> {
    const endsAt = new Date(Date.now() - 1_000);
    const startedAt = new Date(endsAt.getTime() - EXPECTED_DURATION_MS);
    await prisma.miningSession.update({
      where: { id: sessionId },
      data: { startedAt, endsAt },
    });
  }

  async function registerOnly(
    email: string,
    username: string,
    targetAgent = agent,
  ): Promise<{ id: string }> {
    const csrf = await issueCsrf(targetAgent);
    await targetAgent
      .post('/api/v1/auth/register')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ email, username, password: PASSWORD })
      .expect(201);

    return userByEmail(email);
  }

  async function registerVerifyAndLogin(
    email: string,
    username: string,
    targetAgent = agent,
  ): Promise<void> {
    await registerOnly(email, username, targetAgent);
    const token = verificationTokens.get(email);
    if (token === undefined) throw new Error('Verification token was not captured.');

    let csrf = await issueCsrf(targetAgent);
    await targetAgent
      .post('/api/v1/auth/verify-email')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ token })
      .expect(200);

    csrf = await issueCsrf(targetAgent);
    await targetAgent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ identifier: email, password: PASSWORD })
      .expect(200);
  }

  async function cleanup(): Promise<void> {
    if (prisma === undefined) return;
    await assertConnectedDatabase(prisma);
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "mining_sessions", "wallet_transactions", "wallets", "security_events", ' +
        '"refresh_tokens", "auth_sessions", "email_verification_tokens", ' +
        '"password_reset_tokens", "users" CASCADE',
    );
  }
});

function postMiningStart(agent: ReturnType<typeof request.agent>, csrf: string) {
  return agent
    .post('/api/v1/mining/start')
    .set('Origin', ORIGIN)
    .set('X-CSRF-Token', csrf)
    .send({});
}

function postMiningClaim(agent: ReturnType<typeof request.agent>, csrf: string) {
  return agent
    .post('/api/v1/mining/claim')
    .set('Origin', ORIGIN)
    .set('X-CSRF-Token', csrf)
    .send({});
}

async function issueCsrf(agent: ReturnType<typeof request.agent>): Promise<string> {
  const response = await agent.get('/api/v1/auth/csrf').expect(200);
  return (response.body as SuccessBody<{ csrfToken: string }>).data.csrfToken;
}

function deployMigrations(): void {
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
}

async function assertTestDatabase(): Promise<void> {
  const configured = process.env.AUTH_TEST_DATABASE_URL;
  if (configured === undefined) throw new Error('AUTH_TEST_DATABASE_URL is missing.');

  const client = new Client({ connectionString: configured });
  try {
    await client.connect();
    const result = await client.query<{ database: string }>(
      'SELECT current_database() AS database',
    );
    const expected = new URL(configured).pathname.slice(1);
    if (!expected.endsWith('_test') || result.rows[0]?.database !== expected) {
      throw new Error('Refusing to run Sprint 3 tests outside the dedicated test database.');
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function assertConnectedDatabase(prisma: PrismaService): Promise<void> {
  const configured = process.env.AUTH_TEST_DATABASE_URL;
  if (configured === undefined) throw new Error('AUTH_TEST_DATABASE_URL is missing.');

  const expected = new URL(configured).pathname.slice(1);
  const result = await prisma.$queryRaw<
    Array<{ database: string }>
  >`SELECT current_database() AS database`;
  if (!expected.endsWith('_test') || result[0]?.database !== expected) {
    throw new Error(
      'Refusing destructive Sprint 3 test cleanup outside the dedicated test database.',
    );
  }
}
